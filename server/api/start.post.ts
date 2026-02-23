import { randomUUID } from 'node:crypto'
import type { SessionState } from '~/types/mindtrace'
import { requireValidToken } from '~/server/utils/auth'
import { getAppConfig } from '~/server/utils/config'
import { logBasic } from '~/server/utils/logger'
import { beginApiRequest, endApiRequest, failApiRequest } from '~/server/utils/observability'
import { initDistribution } from '~/server/utils/probability'
import { getCuratedQuestionByIndex, sanitizeQuestionForClient } from '~/server/utils/questions'
import { saveSession } from '~/server/utils/store'

export default defineEventHandler(async (event) => {
  const request = beginApiRequest(event, 'POST /api/start')

  try {
    const body = await readBody<{ token?: string }>(event)
    const token = requireValidToken(event, body.token)

    const firstQuestion = getCuratedQuestionByIndex(0)
    if (!firstQuestion) {
      throw createError({ statusCode: 500, statusMessage: '초기 질문 세트를 찾을 수 없습니다.' })
    }

    const { sessionTtlMinutes, maxQuestions } = getAppConfig()
    const now = Date.now()

    const session: SessionState = {
      id: randomUUID(),
      token,
      createdAt: now,
      expiresAt: now + sessionTtlMinutes * 60 * 1000,
      lastUpdatedAt: now,
      done: false,
      finalized: false,
      questionHistory: [firstQuestion],
      answers: [],
      distribution: initDistribution(),
      stopSnapshots: [],
      prefetchByQuestionId: {}
    }

    saveSession(session)

    logBasic('session.start', {
      requestId: request.requestId,
      sessionId: session.id,
      maxQuestions
    })

    const response = {
      sessionId: session.id,
      firstQuestion: sanitizeQuestionForClient(firstQuestion),
      maxQuestions
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
