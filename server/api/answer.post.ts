import type {
  AnswerResponse,
  HesitationReason,
  YesNo
} from '~/types/mindtrace'
import { requireValidToken } from '~/server/utils/auth'
import { getAppConfig } from '~/server/utils/config'
import { getErrorReasonCode } from '~/server/utils/error-codes'
import {
  countValidationAnswers,
  determinePhase,
  sanitizeQuestionForClient,
  selectNextQuestionFromBank
} from '~/server/utils/questions'
import { logBasic, logFull, maskSessionId, maskToken } from '~/server/utils/logger'
import { beginApiRequest, endApiRequest, failApiRequest } from '~/server/utils/observability'
import {
  applyAnswerToDistribution,
  shouldStop,
  summarizeDistribution
} from '~/server/utils/probability'
import { assertSessionBurstAllowed } from '~/server/utils/rate-limit'
import { assertSessionOwnership, getSessionOrThrow, saveSession } from '~/server/utils/store'

interface AnswerBody {
  token?: string
  sessionId?: string
  questionId?: string
  answer?: YesNo
  meta?: {
    dwellMs?: number
    hesitationReason?: HesitationReason
    deferScoring?: boolean
  }
}

interface StageMetrics {
  deterministicUpdateMs: number
  selectionMs: number
  answerTotalMs: number
}

const isValidAnswer = (value: unknown): value is YesNo => value === 'yes' || value === 'no'
const isHesitationReason = (value: unknown): value is HesitationReason => {
  return value === 'ambiguous_meaning' || value === 'did_other_tasks'
}

const resolveConfidenceWeight = (meta?: AnswerBody['meta']) => {
  if (!meta) return 1
  if (meta.deferScoring) return 0.35
  if (meta.hesitationReason === 'ambiguous_meaning') return 0.7
  return 1
}

const buildProgress = (current: number, max: number) => ({
  current,
  max,
  ratio: Math.min(1, current / max)
})

const buildBaseResponse = (
  answerCount: number,
  maxQuestions: number,
  summary: ReturnType<typeof summarizeDistribution>
) => ({
  progress: buildProgress(answerCount, maxQuestions),
  distributionsSummary: summary
})

export default defineEventHandler(async (event) => {
  const request = beginApiRequest(event, 'POST /api/answer')
  let body: AnswerBody = {}
  const stage: StageMetrics = {
    deterministicUpdateMs: 0,
    selectionMs: 0,
    answerTotalMs: 0
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

    const hesitationReason = isHesitationReason(body.meta?.hesitationReason)
      ? body.meta?.hesitationReason
      : undefined
    const confidenceWeight = resolveConfidenceWeight({
      dwellMs: Number(body.meta?.dwellMs || 0),
      hesitationReason,
      deferScoring: Boolean(body.meta?.deferScoring)
    })

    session.answers.push({
      questionId: body.questionId,
      answer: body.answer,
      answeredAt: new Date().toISOString(),
      targets: currentQuestion.targets,
      meta: {
        dwellMs: Number(body.meta?.dwellMs || 0),
        hesitationReason,
        deferred: Boolean(body.meta?.deferScoring),
        confidenceWeight
      }
    })

    const deterministicStarted = Date.now()
    applyAnswerToDistribution(session.distribution, currentQuestion, body.answer, confidenceWeight)
    stage.deterministicUpdateMs = Date.now() - deterministicStarted

    const summary = summarizeDistribution(session.distribution)

    const phase = determinePhase(session, maxQuestions)
    const validationCount = countValidationAnswers(session)
    const requiredValidationCount = phase === 'C' ? 1 : 0

    const stopDecision = shouldStop(
      session.distribution,
      session.answers.length,
      minQuestions,
      maxQuestions,
      session.stopSnapshots,
      {
        phase,
        validationCount,
        requiredValidationCount
      }
    )

    session.stopSnapshots.push(stopDecision.snapshot)
    session.lastUpdatedAt = Date.now()
    session.phase = phase

    logFull('earlyStop.check', {
      requestId: request.requestId,
      sessionId: session.id,
      phase,
      detail: stopDecision.detail,
      metrics: stopDecision.metrics
    })

    if (stopDecision.done) {
      session.done = true
      saveSession(session)

      stage.answerTotalMs = Date.now() - request.startedAt

      logFull('earlyStop.result', {
        requestId: request.requestId,
        sessionId: session.id,
        result: 'hit',
        reason: stopDecision.reason,
        detail: stopDecision.detail
      })

      logBasic('answer.metrics', {
        requestId: request.requestId,
        sessionId: session.id,
        phase,
        deterministicUpdateMs: stage.deterministicUpdateMs,
        selectionMs: stage.selectionMs,
        answerTotalMs: stage.answerTotalMs
      })

      const response = {
        done: true,
        ...buildBaseResponse(session.answers.length, maxQuestions, summary)
      } satisfies AnswerResponse

      endApiRequest(request, {
        status: 'done',
        sessionId: session.id,
        reason: stopDecision.reason,
        detail: stopDecision.detail
      })

      return response
    }

    const selectionStarted = Date.now()
    const selection = selectNextQuestionFromBank(session, maxQuestions)
    stage.selectionMs = Date.now() - selectionStarted

    const nextQuestion = selection.question
    session.phase = selection.phase
    session.questionHistory.push(nextQuestion)
    saveSession(session)

    stage.answerTotalMs = Date.now() - request.startedAt

    logFull('question.source', {
      requestId: request.requestId,
      sessionId: session.id,
      source: 'bank'
    })

    logFull('question.select.score', {
      requestId: request.requestId,
      sessionId: session.id,
      phase: selection.phase,
      topCandidates: selection.ranked
    })

    logFull('question.select.reason', {
      requestId: request.requestId,
      sessionId: session.id,
      phase: selection.phase,
      reason: selection.reason,
      pickedQuestionId: nextQuestion.id
    })

    logFull('answer.score_updates', {
      requestId: request.requestId,
      question_id: currentQuestion.id,
      beforeAxis,
      afterAxis: session.distribution.axisScores,
      mbtiTop3: summary.mbtiTop3,
      enneaTop2: summary.enneagramTop2,
      conflicts: summary.conflicts
    })

    logFull('earlyStop.result', {
      requestId: request.requestId,
      sessionId: session.id,
      result: 'skip',
      reason: stopDecision.reason,
      detail: stopDecision.detail
    })

    logBasic('answer.metrics', {
      requestId: request.requestId,
      sessionId: session.id,
      phase: selection.phase,
      deterministicUpdateMs: stage.deterministicUpdateMs,
      selectionMs: stage.selectionMs,
      answerTotalMs: stage.answerTotalMs
    })

    const response = {
      done: false,
      nextQuestion: sanitizeQuestionForClient(nextQuestion),
      ...buildBaseResponse(session.answers.length, maxQuestions, summary)
    } satisfies AnswerResponse

    endApiRequest(request, {
      status: 'ok',
      sessionId: session.id,
      nextQuestionId: nextQuestion.id,
      phase: selection.phase
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
