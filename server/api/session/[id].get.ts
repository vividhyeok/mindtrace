import { requireValidToken } from '~/server/utils/auth'
import { getAppConfig } from '~/server/utils/config'
import { toPublicQuestion } from '~/server/utils/inference'
import { beginApiRequest, endApiRequest, failApiRequest } from '~/server/utils/observability'
import { assertSessionOwnership, getSessionOrThrow } from '~/server/utils/store'

export default defineEventHandler((event) => {
  const request = beginApiRequest(event, 'GET /api/session/:id')

  try {
    const token = requireValidToken(event)
    const sessionId = getRouterParam(event, 'id')

    if (!sessionId) {
      throw createError({ statusCode: 400, statusMessage: 'sessionId가 필요합니다.' })
    }

    const session = getSessionOrThrow(sessionId)
    assertSessionOwnership(session, token)

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
    failApiRequest(request, error)
    throw error
  }
})
