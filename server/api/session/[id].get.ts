import { requireValidToken } from '~/server/utils/auth'
import { getAppConfig } from '~/server/utils/config'
import { getErrorReasonCode } from '~/server/utils/error-codes'
import { toPublicQuestion } from '~/server/utils/inference'
import { logFull, maskSessionId, maskToken } from '~/server/utils/logger'
import { beginApiRequest, endApiRequest, failApiRequest } from '~/server/utils/observability'
import { assertSessionOwnership, getSessionOrThrow } from '~/server/utils/store'

export default defineEventHandler((event) => {
  const request = beginApiRequest(event, 'GET /api/session/:id')
  let sessionId = ''

  try {
    const token = requireValidToken(event, undefined, {
      requestId: request.requestId,
      endpoint: request.endpoint
    })
    sessionId = getRouterParam(event, 'id') || ''

    if (!sessionId) {
      throw createError({ statusCode: 400, statusMessage: 'sessionId가 필요합니다.' })
    }

    const session = getSessionOrThrow(sessionId, {
      requestId: request.requestId,
      endpoint: request.endpoint
    })
    assertSessionOwnership(session, token, {
      requestId: request.requestId,
      endpoint: request.endpoint
    })

    const currentQuestion = session.questionHistory[session.questionHistory.length - 1]
    const { maxQuestions } = getAppConfig()

    const response = {
      sessionId: session.id,
      done: session.done,
      finalized: session.finalized,
      answerCount: session.answers.length,
      maxQuestions,
      currentQuestion: session.done ? null : toPublicQuestion(currentQuestion),
      progress: {
        current: session.answers.length,
        max: maxQuestions,
        ratio: Math.min(1, session.answers.length / maxQuestions)
      }
    }

    endApiRequest(request, {
      status: 'ok',
      sessionId: session.id
    })

    return response
  }
  catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.data?.statusCode || 0)
    if (statusCode === 401) {
      const queryToken = getQuery(event).token
      logFull('session.resume.fail', {
        requestId: request.requestId,
        endpoint: request.endpoint,
        reasonCode: getErrorReasonCode(error) || 'UNKNOWN',
        sessionId: maskSessionId(sessionId),
        token: maskToken(typeof queryToken === 'string' ? queryToken : '')
      })
    }
    failApiRequest(request, error)
    throw error
  }
})
