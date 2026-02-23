import type { AnswerResponse, YesNo } from '~/types/mindtrace'
import { requireValidToken } from '~/server/utils/auth'
import { getAppConfig } from '~/server/utils/config'
import {
  generateAdaptiveQuestion,
  requestDistributionUpdate,
  toPublicQuestion
} from '~/server/utils/inference'
import { logBasic, logFull } from '~/server/utils/logger'
import { beginApiRequest, endApiRequest, failApiRequest } from '~/server/utils/observability'
import {
  applyAnswerToDistribution,
  blendWithModelUpdate,
  shouldStop,
  summarizeDistribution
} from '~/server/utils/probability'
import { curatedQuestionCount, getCuratedQuestionByIndex } from '~/server/utils/questions'
import { assertSessionBurstAllowed } from '~/server/utils/rate-limit'
import { assertSessionOwnership, getSessionOrThrow, saveSession } from '~/server/utils/store'

interface AnswerBody {
  token?: string
  sessionId?: string
  questionId?: string
  answer?: YesNo
}

const isValidAnswer = (value: unknown): value is YesNo => value === 'yes' || value === 'no'

export default defineEventHandler(async (event) => {
  const request = beginApiRequest(event, 'POST /api/answer')

  try {
    const body = await readBody<AnswerBody>(event)
    const token = requireValidToken(event, body.token)

    if (!body.sessionId || !body.questionId || !isValidAnswer(body.answer)) {
      throw createError({ statusCode: 400, statusMessage: '요청 형식이 올바르지 않습니다.' })
    }

    assertSessionBurstAllowed('answer', body.sessionId, request.requestId)

    const session = getSessionOrThrow(body.sessionId)
    assertSessionOwnership(session, token)

    if (session.finalized) {
      const response = {
        done: true,
        progress: {
          current: session.answers.length,
          max: getAppConfig().maxQuestions,
          ratio: Math.min(1, session.answers.length / getAppConfig().maxQuestions)
        }
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

    session.answers.push({
      questionId: body.questionId,
      answer: body.answer,
      answeredAt: new Date().toISOString(),
      targets: currentQuestion.targets
    })

    const beforeAxis = { ...session.distribution.axisScores }

    applyAnswerToDistribution(session.distribution, currentQuestion, body.answer)
    const modelUpdate = await requestDistributionUpdate(session, currentQuestion, body.answer, {
      requestId: request.requestId
    })
    blendWithModelUpdate(session.distribution, modelUpdate)

    const summary = summarizeDistribution(session.distribution)

    logBasic('answer.received', {
      requestId: request.requestId,
      question_id: currentQuestion.id,
      answer: body.answer,
      axis_targeted: currentQuestion.targets.mbtiAxes,
      conflicts: summary.conflicts
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

    const { maxQuestions } = getAppConfig()
    const stop = shouldStop(session.distribution, session.answers.length, maxQuestions)

    session.lastUpdatedAt = Date.now()

    const baseResponse = {
      progress: {
        current: session.answers.length,
        max: maxQuestions,
        ratio: Math.min(1, session.answers.length / maxQuestions)
      },
      distributionsSummary: summary
    }

    if (stop.done) {
      session.done = true
      saveSession(session)

      logBasic('answer.stop', {
        requestId: request.requestId,
        sessionId: session.id,
        reason: stop.reason,
        answerCount: session.answers.length,
        finalDistributions: summary
      })

      const response = {
        done: true,
        ...baseResponse
      } satisfies AnswerResponse

      endApiRequest(request, {
        status: 'done',
        sessionId: session.id,
        reason: stop.reason
      })

      return response
    }

    const nextIndex = session.answers.length
    const shouldUseCurated = nextIndex < curatedQuestionCount()
    const curated = shouldUseCurated ? getCuratedQuestionByIndex(nextIndex) : null

    const nextQuestion = curated || (await generateAdaptiveQuestion(session, { requestId: request.requestId }))
    session.questionHistory.push(nextQuestion)

    saveSession(session)

    logFull('answer.next_question', {
      requestId: request.requestId,
      sessionId: session.id,
      question: {
        id: nextQuestion.id,
        targets: nextQuestion.targets,
        rationale_short: nextQuestion.rationale_short
      }
    })

    const response = {
      done: false,
      nextQuestion: toPublicQuestion(nextQuestion),
      ...baseResponse
    } satisfies AnswerResponse

    endApiRequest(request, {
      status: 'ok',
      sessionId: session.id,
      nextQuestionId: nextQuestion.id
    })

    return response
  }
  catch (error: any) {
    failApiRequest(request, error)
    throw error
  }
})
