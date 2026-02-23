import type {
  AnswerResponse,
  PrefetchBranch,
  SessionState,
  YesNo
} from '~/types/mindtrace'
import { requireValidToken } from '~/server/utils/auth'
import { getAppConfig } from '~/server/utils/config'
import {
  generateAdaptiveQuestionDetailed,
  requestDistributionUpdate,
  toPublicQuestion
} from '~/server/utils/inference'
import { getErrorReasonCode } from '~/server/utils/error-codes'
import { logBasic, logFull, maskSessionId, maskToken } from '~/server/utils/logger'
import { beginApiRequest, endApiRequest, failApiRequest } from '~/server/utils/observability'
import {
  applyAnswerToDistribution,
  blendWithModelUpdate,
  shouldStop,
  summarizeDistribution
} from '~/server/utils/probability'
import { curatedQuestionCount, getCuratedQuestionByIndex } from '~/server/utils/questions'
import { assertSessionBurstAllowed } from '~/server/utils/rate-limit'
import { assertSessionOwnership, getSessionById, getSessionOrThrow, saveSession } from '~/server/utils/store'

interface AnswerBody {
  token?: string
  sessionId?: string
  questionId?: string
  answer?: YesNo
}

interface StageMetrics {
  prefetchLookupMs: number
  deterministicUpdateMs: number
  modelUpdateMs: number
  questionGenerationMs: number
  qualityFilterMs: number
  prefetchPreparedMs: number
  totalMs: number
}

interface CalibrationDecision {
  run: boolean
  reason: string
}

const PREFETCH_MAX_REGENERATIONS = 1
const ANSWER_MODEL_CALIBRATION_INTERVAL = 3
const PREFETCH_MODEL_CALIBRATION_INTERVAL = 4
const PREFETCH_CACHE_LIMIT = 12
const prefetchLocks = new Set<string>()

const isValidAnswer = (value: unknown): value is YesNo => value === 'yes' || value === 'no'

const cloneValue = <T>(value: T): T => structuredClone(value)

const ensureSessionRuntimeFields = (session: SessionState) => {
  session.prefetchByQuestionId ||= {}
  session.stopSnapshots ||= []
}

const isAdaptiveIndex = (index: number) => index >= curatedQuestionCount()

const trimPrefetchCache = (session: SessionState) => {
  const recentQuestionIds = new Set(session.questionHistory.slice(-PREFETCH_CACHE_LIMIT).map(question => question.id))
  for (const questionId of Object.keys(session.prefetchByQuestionId || {})) {
    if (!recentQuestionIds.has(questionId)) {
      delete session.prefetchByQuestionId[questionId]
    }
  }
}

const getCalibrationDecision = (
  mode: 'answer' | 'prefetch',
  answerCountAfter: number,
  conflictCount: number,
  isAdaptive: boolean,
  maxQuestions: number
): CalibrationDecision => {
  if (!isAdaptive) {
    return { run: false, reason: 'curated_phase' }
  }

  if (answerCountAfter === curatedQuestionCount()) {
    return { run: true, reason: 'adaptive_transition' }
  }

  if (conflictCount > 0) {
    return { run: true, reason: 'conflict_detected' }
  }

  if (answerCountAfter >= maxQuestions - 2) {
    return { run: true, reason: 'near_max_cap' }
  }

  const interval = mode === 'prefetch'
    ? PREFETCH_MODEL_CALIBRATION_INTERVAL
    : ANSWER_MODEL_CALIBRATION_INTERVAL
  if (answerCountAfter % interval === 0) {
    return { run: true, reason: 'periodic' }
  }

  return { run: false, reason: 'policy_skip' }
}

const buildProgress = (current: number, max: number) => ({
  current,
  max,
  ratio: Math.min(1, current / max)
})

const buildBaseResponse = (answerCount: number, maxQuestions: number, summary: ReturnType<typeof summarizeDistribution>) => ({
  progress: buildProgress(answerCount, maxQuestions),
  distributionsSummary: summary
})

const buildSimulatedSession = (
  baseSession: SessionState,
  distribution: SessionState['distribution'],
  questionId: string,
  answer: YesNo,
  answeredAt: string,
  targets: SessionState['answers'][number]['targets'],
  snapshot: SessionState['stopSnapshots'][number]
): SessionState => {
  return {
    ...baseSession,
    distribution,
    answers: [
      ...baseSession.answers,
      {
        questionId,
        answer,
        answeredAt,
        targets
      }
    ],
    stopSnapshots: [...baseSession.stopSnapshots, snapshot]
  }
}

const runPrefetchForQuestion = async (
  sessionId: string,
  questionId: string,
  requestId: string
) => {
  const lockKey = `${sessionId}:${questionId}`
  if (prefetchLocks.has(lockKey)) return

  const session = getSessionById(sessionId)
  if (!session || session.done || session.finalized) return

  ensureSessionRuntimeFields(session)
  const currentQuestion = session.questionHistory[session.questionHistory.length - 1]
  if (!currentQuestion || currentQuestion.id !== questionId) return

  const currentQuestionIndex = session.questionHistory.length - 1
  if (!isAdaptiveIndex(currentQuestionIndex)) return

  prefetchLocks.add(lockKey)

  const entry = session.prefetchByQuestionId[questionId]
  if (entry?.inFlight) {
    prefetchLocks.delete(lockKey)
    return
  }

  session.prefetchByQuestionId[questionId] = {
    questionId,
    baseAnswerCount: session.answers.length,
    createdAt: Date.now(),
    inFlight: true,
    branches: {},
    errors: {}
  }
  saveSession(session)

  const { maxQuestions, minQuestions } = getAppConfig()
  const prefetchStarted = Date.now()
  logFull('prefetch.start', {
    requestId,
    sessionId,
    questionId,
    baseAnswerCount: session.answers.length,
    adaptive: true
  })

  const baseSession = cloneValue(session)
  const baseQuestion = cloneValue(currentQuestion)
  const baseDistribution = cloneValue(session.distribution)
  const baseSnapshots = cloneValue(session.stopSnapshots)

  const branchBuilder = async (branchAnswer: YesNo) => {
    const branchStarted = Date.now()
    try {
      const distribution = cloneValue(baseDistribution)
      applyAnswerToDistribution(distribution, baseQuestion, branchAnswer)

      const answerCountAfter = baseSession.answers.length + 1
      const calibrationDecision = getCalibrationDecision(
        'prefetch',
        answerCountAfter,
        distribution.conflicts.length,
        isAdaptiveIndex(answerCountAfter),
        maxQuestions
      )

      let calibrationApplied = false
      if (calibrationDecision.run) {
        const sessionForModel = { ...baseSession, distribution }
        const modelUpdate = await requestDistributionUpdate(sessionForModel, baseQuestion, branchAnswer, {
          requestId: `${requestId}:prefetch:${branchAnswer}`,
          promptBudget: { recentQuestions: 4, recentAnswers: 2 }
        })
        if (modelUpdate) {
          blendWithModelUpdate(distribution, modelUpdate)
          calibrationApplied = true
        }
      }

      const stopDecision = shouldStop(
        distribution,
        answerCountAfter,
        minQuestions,
        maxQuestions,
        baseSnapshots
      )

      const summary = summarizeDistribution(distribution)
      const answeredAt = new Date().toISOString()

      let nextQuestion: SessionState['questionHistory'][number] | undefined
      let questionGeneration: PrefetchBranch['questionGeneration'] | undefined
      if (!stopDecision.done) {
        const nextIndex = answerCountAfter
        const curated = nextIndex < curatedQuestionCount()
          ? getCuratedQuestionByIndex(nextIndex)
          : null

        if (curated) {
          nextQuestion = curated
          questionGeneration = {
            usedModel: false,
            retryCount: 0,
            usedFallback: false
          }
        }
        else {
          const simulatedSession = buildSimulatedSession(
            baseSession,
            distribution,
            baseQuestion.id,
            branchAnswer,
            answeredAt,
            baseQuestion.targets,
            stopDecision.snapshot
          )
          const generated = await generateAdaptiveQuestionDetailed(simulatedSession, {
            requestId: `${requestId}:prefetch:qgen:${branchAnswer}`,
            maxRegenerations: PREFETCH_MAX_REGENERATIONS,
            promptBudget: { recentQuestions: 5, recentAnswers: 3 }
          })
          nextQuestion = generated.question
          questionGeneration = {
            usedModel: true,
            retryCount: generated.meta.retryCount,
            usedFallback: generated.meta.usedFallback
          }
        }
      }

      const branch: PrefetchBranch = {
        answer: branchAnswer,
        done: stopDecision.done,
        reason: stopDecision.reason,
        detail: stopDecision.detail,
        nextQuestion,
        distribution,
        summary,
        snapshot: stopDecision.snapshot,
        latencyMs: Date.now() - branchStarted,
        modelCalibration: {
          attempted: calibrationDecision.run,
          applied: calibrationApplied
        },
        questionGeneration
      }

      return { ok: true as const, branchAnswer, branch }
    }
    catch (error: any) {
      return {
        ok: false as const,
        branchAnswer,
        errorMessage: error?.message || 'prefetch branch failed'
      }
    }
  }

  const branchResults = await Promise.all([branchBuilder('yes'), branchBuilder('no')])
  const latestSession = getSessionById(sessionId)
  if (!latestSession) {
    prefetchLocks.delete(lockKey)
    return
  }

  ensureSessionRuntimeFields(latestSession)
  const latestEntry = latestSession.prefetchByQuestionId[questionId]
  if (!latestEntry) {
    prefetchLocks.delete(lockKey)
    return
  }

  latestEntry.inFlight = false
  latestEntry.completedAt = Date.now()

  for (const result of branchResults) {
    if (result.ok) {
      latestEntry.branches[result.branchAnswer] = result.branch
      continue
    }
    latestEntry.errors[result.branchAnswer] = result.errorMessage
  }

  trimPrefetchCache(latestSession)
  saveSession(latestSession)
  prefetchLocks.delete(lockKey)

  logFull('prefetch.done', {
    requestId,
    sessionId,
    questionId,
    latencyMs: Date.now() - prefetchStarted,
    readyBranches: Object.keys(latestEntry.branches),
    failedBranches: Object.keys(latestEntry.errors)
  })
}

const schedulePrefetch = (sessionId: string, questionId: string, requestId: string) => {
  void runPrefetchForQuestion(sessionId, questionId, requestId).catch((error: any) => {
    logFull('prefetch.fail', {
      requestId,
      sessionId,
      questionId,
      error: error?.message || 'unknown prefetch error'
    })
  })
}

export default defineEventHandler(async (event) => {
  const request = beginApiRequest(event, 'POST /api/answer')
  let body: AnswerBody = {}
  const stage: StageMetrics = {
    prefetchLookupMs: 0,
    deterministicUpdateMs: 0,
    modelUpdateMs: 0,
    questionGenerationMs: 0,
    qualityFilterMs: 0,
    prefetchPreparedMs: 0,
    totalMs: 0
  }

  try {
    body = await readBody<AnswerBody>(event)
    const token = requireValidToken(event, body.token, {
      requestId: request.requestId,
      endpoint: request.endpoint
    })

    if (!body.sessionId || !body.questionId || !isValidAnswer(body.answer)) {
      throw createError({ statusCode: 400, statusMessage: '요청 형식이 올바르지 않습니다.' })
    }

    assertSessionBurstAllowed('answer', body.sessionId, request.requestId)

    const session = getSessionOrThrow(body.sessionId, {
      requestId: request.requestId,
      endpoint: request.endpoint
    })
    assertSessionOwnership(session, token, {
      requestId: request.requestId,
      endpoint: request.endpoint
    })
    ensureSessionRuntimeFields(session)
    trimPrefetchCache(session)

    const { maxQuestions, minQuestions } = getAppConfig()

    if (session.finalized) {
      logFull('session.lookup.fail', {
        requestId: request.requestId,
        endpoint: request.endpoint,
        reasonCode: 'SESSION_ALREADY_FINALIZED',
        sessionId: maskSessionId(session.id)
      })

      const response = {
        done: true,
        progress: buildProgress(session.answers.length, maxQuestions)
      } satisfies AnswerResponse

      endApiRequest(request, {
        status: 'already_finalized',
        sessionId: session.id
      })
      return response
    }

    const currentQuestion = session.questionHistory[session.questionHistory.length - 1]

    if (!currentQuestion || currentQuestion.id !== body.questionId) {
      throw createError({ statusCode: 409, statusMessage: '현재 질문과 응답이 일치하지 않습니다.' })
    }

    if (session.answers.some(item => item.questionId === body.questionId)) {
      throw createError({ statusCode: 409, statusMessage: '이미 응답한 질문입니다.' })
    }

    const beforeAxis = { ...session.distribution.axisScores }
    const answerCountBefore = session.answers.length

    const prefetchStarted = Date.now()
    const prefetchEntry = session.prefetchByQuestionId[body.questionId]
    const prefetchBranch: PrefetchBranch | undefined =
      prefetchEntry?.baseAnswerCount === answerCountBefore
        ? prefetchEntry.branches[body.answer]
        : undefined
    stage.prefetchLookupMs = Date.now() - prefetchStarted

    const prefetchState = prefetchBranch ? 'hit' : 'miss'
    const prefetchReason = prefetchBranch
      ? 'ready'
      : !prefetchEntry
        ? 'not_found'
        : prefetchEntry.baseAnswerCount !== answerCountBefore
          ? 'stale_base_count'
          : prefetchEntry.inFlight
            ? 'inflight'
            : 'branch_missing'

    logFull(prefetchBranch ? 'prefetch.hit' : 'prefetch.miss', {
      requestId: request.requestId,
      sessionId: session.id,
      questionId: body.questionId,
      answer: body.answer,
      reason: prefetchReason,
      lookupMs: stage.prefetchLookupMs
    })

    let summary: ReturnType<typeof summarizeDistribution>
    let stopDecision: ReturnType<typeof shouldStop>
    let nextQuestion: SessionState['questionHistory'][number] | null = null
    let questionRetryCount = 0
    let questionUsedFallback = false
    let questionPromptChars = 0
    let modelCalibrationApplied = false
    let modelCalibrationAttempted = false
    let modelCalibrationReason = 'prefetch_hit'

    session.answers.push({
      questionId: body.questionId,
      answer: body.answer,
      answeredAt: new Date().toISOString(),
      targets: currentQuestion.targets
    })

    if (prefetchBranch) {
      stage.prefetchPreparedMs = prefetchBranch.latencyMs
      session.distribution = cloneValue(prefetchBranch.distribution)
      summary = prefetchBranch.summary
      stopDecision = {
        done: prefetchBranch.done,
        reason: prefetchBranch.reason,
        detail: prefetchBranch.detail as ReturnType<typeof shouldStop>['detail'],
        snapshot: prefetchBranch.snapshot,
        metrics: {
          answerCount: session.answers.length,
          minQuestions,
          maxQuestions,
          mbtiTop1: prefetchBranch.snapshot.mbtiTopProb,
          mbtiGap: prefetchBranch.snapshot.mbtiGap,
          enneaTop1: prefetchBranch.snapshot.enneaTopProb,
          enneaGap: prefetchBranch.snapshot.enneaGap,
          conflictCount: prefetchBranch.summary.conflicts.length,
          stabilityScore: 1
        }
      }
      nextQuestion = prefetchBranch.nextQuestion || null
      modelCalibrationApplied = prefetchBranch.modelCalibration.applied
      modelCalibrationAttempted = prefetchBranch.modelCalibration.attempted
      questionRetryCount = prefetchBranch.questionGeneration?.retryCount || 0
      questionUsedFallback = !!prefetchBranch.questionGeneration?.usedFallback
    }
    else {
      const deterministicStarted = Date.now()
      applyAnswerToDistribution(session.distribution, currentQuestion, body.answer)
      stage.deterministicUpdateMs = Date.now() - deterministicStarted

      const calibrationDecision = getCalibrationDecision(
        'answer',
        session.answers.length,
        session.distribution.conflicts.length,
        isAdaptiveIndex(session.answers.length),
        maxQuestions
      )
      modelCalibrationAttempted = calibrationDecision.run
      modelCalibrationReason = calibrationDecision.reason

      if (calibrationDecision.run) {
        const modelStarted = Date.now()
        const modelUpdate = await requestDistributionUpdate(session, currentQuestion, body.answer, {
          requestId: request.requestId,
          promptBudget: { recentQuestions: 5, recentAnswers: 3 }
        })
        stage.modelUpdateMs = Date.now() - modelStarted

        if (modelUpdate) {
          blendWithModelUpdate(session.distribution, modelUpdate)
          modelCalibrationApplied = true
        }
      }

      summary = summarizeDistribution(session.distribution)
      stopDecision = shouldStop(
        session.distribution,
        session.answers.length,
        minQuestions,
        maxQuestions,
        session.stopSnapshots
      )

      if (!stopDecision.done) {
        const nextIndex = session.answers.length
        const curated = nextIndex < curatedQuestionCount()
          ? getCuratedQuestionByIndex(nextIndex)
          : null

        if (curated) {
          nextQuestion = curated
        }
        else {
          const questionStarted = Date.now()
          const generated = await generateAdaptiveQuestionDetailed(session, {
            requestId: request.requestId,
            promptBudget: { recentQuestions: 6, recentAnswers: 3 }
          })
          stage.questionGenerationMs = Date.now() - questionStarted
          stage.qualityFilterMs += generated.meta.filterLatencyMs
          questionRetryCount = generated.meta.retryCount
          questionUsedFallback = generated.meta.usedFallback
          questionPromptChars = generated.meta.promptChars
          nextQuestion = generated.question
        }
      }
    }

    delete session.prefetchByQuestionId[body.questionId]
    session.stopSnapshots.push(stopDecision.snapshot)
    session.lastUpdatedAt = Date.now()

    if (stopDecision.done) {
      session.done = true
      saveSession(session)

      if (stopDecision.reason === 'cap') {
        logFull('maxQuestions.reached', {
          requestId: request.requestId,
          sessionId: session.id,
          answerCount: session.answers.length
        })
      }
      else {
        logFull('earlystop.hit', {
          requestId: request.requestId,
          sessionId: session.id,
          detail: stopDecision.detail,
          metrics: stopDecision.metrics
        })
      }

      const response = {
        done: true,
        ...buildBaseResponse(session.answers.length, maxQuestions, summary)
      } satisfies AnswerResponse

      stage.totalMs = Date.now() - request.startedAt

      logBasic('answer.metrics', {
        requestId: request.requestId,
        sessionId: session.id,
        prefetch: prefetchState,
        prefetchReason,
        totalMs: stage.totalMs,
        deterministicUpdateMs: stage.deterministicUpdateMs,
        modelUpdateMs: stage.modelUpdateMs,
        questionGenerationMs: stage.questionGenerationMs,
        qualityFilterMs: stage.qualityFilterMs,
        retryCount: questionRetryCount
      })

      logFull('answer.metrics.detail', {
        requestId: request.requestId,
        sessionId: session.id,
        historyLength: session.answers.length,
        prefetchState,
        prefetchReason,
        stopDecision,
        stage,
        modelCalibrationAttempted,
        modelCalibrationApplied,
        modelCalibrationReason,
        questionUsedFallback,
        questionPromptChars
      })

      endApiRequest(request, {
        status: 'done',
        sessionId: session.id,
        reason: stopDecision.reason,
        detail: stopDecision.detail
      })

      return response
    }

    if (!nextQuestion) {
      throw createError({ statusCode: 500, statusMessage: '다음 질문 생성에 실패했습니다.' })
    }

    session.questionHistory.push(nextQuestion)
    trimPrefetchCache(session)
    saveSession(session)

    const nextQuestionIndex = session.questionHistory.length - 1
    if (isAdaptiveIndex(nextQuestionIndex)) {
      schedulePrefetch(session.id, nextQuestion.id, request.requestId)
    }

    stage.totalMs = Date.now() - request.startedAt

    logBasic('answer.metrics', {
      requestId: request.requestId,
      sessionId: session.id,
      prefetch: prefetchState,
      prefetchReason,
      totalMs: stage.totalMs,
      deterministicUpdateMs: stage.deterministicUpdateMs,
      modelUpdateMs: stage.modelUpdateMs,
      questionGenerationMs: stage.questionGenerationMs,
      qualityFilterMs: stage.qualityFilterMs,
      retryCount: questionRetryCount
    })

    logFull('earlystop.check', {
      requestId: request.requestId,
      sessionId: session.id,
      result: stopDecision.reason,
      detail: stopDecision.detail,
      metrics: stopDecision.metrics
    })

    if (!stopDecision.done) {
      logFull('earlystop.skip', {
        requestId: request.requestId,
        sessionId: session.id,
        detail: stopDecision.detail,
        metrics: stopDecision.metrics
      })
    }

    logFull('answer.score_updates', {
      requestId: request.requestId,
      question_id: currentQuestion.id,
      beforeAxis,
      afterAxis: session.distribution.axisScores,
      mbtiTop3: summary.mbtiTop3,
      enneaTop2: summary.enneagramTop2,
      conflicts: summary.conflicts
    })

    logFull('answer.next_question', {
      requestId: request.requestId,
      sessionId: session.id,
      historyLength: session.answers.length,
      question: {
        id: nextQuestion.id,
        targets: nextQuestion.targets,
        rationale_short: nextQuestion.rationale_short
      },
      modelCalibrationAttempted,
      modelCalibrationApplied,
      modelCalibrationReason,
      questionRetryCount,
      questionUsedFallback,
      questionPromptChars,
      stage
    })

    const response = {
      done: false,
      nextQuestion: toPublicQuestion(nextQuestion),
      ...buildBaseResponse(session.answers.length, maxQuestions, summary)
    } satisfies AnswerResponse

    endApiRequest(request, {
      status: 'ok',
      sessionId: session.id,
      nextQuestionId: nextQuestion.id,
      prefetch: prefetchState,
      prefetchReason
    })

    return response
  }
  catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.data?.statusCode || 0)
    if (statusCode === 401) {
      logFull('answer.auth.fail', {
        requestId: request.requestId,
        endpoint: request.endpoint,
        reasonCode: getErrorReasonCode(error) || 'UNKNOWN',
        sessionId: maskSessionId(body.sessionId),
        token: maskToken(body.token),
        questionId: body.questionId || ''
      })
    }
    failApiRequest(request, error)
    throw error
  }
})
