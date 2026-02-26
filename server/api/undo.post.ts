import type { AnswerResponse } from '~/types/mindtrace'
import { requireValidToken } from '~/server/utils/auth'
import { getAppConfig } from '~/server/utils/config'
import { getErrorReasonCode } from '~/server/utils/error-codes'
import { getQuestionById, sanitizeQuestionForClient } from '~/server/utils/questions'
import { logFull, maskSessionId, maskToken } from '~/server/utils/logger'
import { beginApiRequest, endApiRequest, failApiRequest } from '~/server/utils/observability'
import { applyAnswerToDistribution, initDistribution, summarizeDistribution } from '~/server/utils/probability'
import { assertSessionBurstAllowed } from '~/server/utils/rate-limit'
import { assertSessionOwnership, getSessionOrThrow, saveSession } from '~/server/utils/store'

interface UndoBody {
  token?: string
  sessionId?: string
}

const buildProgress = (current: number, max: number) => ({
  current,
  max,
  ratio: Math.min(1, current / max)
})

export default defineEventHandler(async (event) => {
  const request = beginApiRequest(event, 'POST /api/undo')
  let body: UndoBody = {}

  try {
    body = await readBody<UndoBody>(event)
    const token = requireValidToken(event, body.token, {
      requestId: request.requestId,
      endpoint: request.endpoint
    })

    if (!body.sessionId) {
      throw createError({ statusCode: 400, statusMessage: 'sessionId가 필요합니다.' })
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

    const { maxQuestions } = getAppConfig()

    if (session.answers.length === 0 || session.questionHistory.length <= 1) {
      throw createError({ statusCode: 409, statusMessage: '되돌릴 이전 응답이 없습니다.' })
    }

    session.questionHistory.pop()
    session.answers.pop()

    const reset = initDistribution()
    session.distribution = reset

    const rebuiltAnswers = [...session.answers]
    const questionMap = new Map(session.questionHistory.map(question => [question.id, question]))

    for (const item of rebuiltAnswers) {
      const question = questionMap.get(item.questionId) || getQuestionById(item.questionId)
      if (!question) continue
      applyAnswerToDistribution(session.distribution, question, item.answer, item.meta?.confidenceWeight || 1)
    }

    session.stopSnapshots = []
    session.done = false
    session.finalized = false
    session.report = undefined
    session.lastUpdatedAt = Date.now()

    const currentQuestion = session.questionHistory[session.questionHistory.length - 1]
    if (!currentQuestion) {
      throw createError({ statusCode: 500, statusMessage: '현재 질문 복원에 실패했습니다.' })
    }

    const summary = summarizeDistribution(session.distribution)

    saveSession(session)

    const response = {
      done: false,
      nextQuestion: sanitizeQuestionForClient(currentQuestion),
      progress: buildProgress(session.answers.length, maxQuestions),
      distributionsSummary: summary
    } satisfies AnswerResponse

    endApiRequest(request, {
      status: 'ok',
      sessionId: session.id,
      action: 'undo'
    })

    return response
  }
  catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.data?.statusCode || 0)
    if (statusCode === 401) {
      logFull('undo.auth.fail', {
        requestId: request.requestId,
        endpoint: request.endpoint,
        reasonCode: getErrorReasonCode(error) || 'UNKNOWN',
        sessionId: maskSessionId(body.sessionId),
        token: maskToken(body.token)
      })
    }
    failApiRequest(request, error)
    throw error
  }
})
