import { requireValidToken } from '~/server/utils/auth'
import { beginApiRequest, endApiRequest, failApiRequest } from '~/server/utils/observability'
import { assertSessionOwnership, getReport, getSessionOrThrow } from '~/server/utils/store'

export default defineEventHandler((event) => {
  const request = beginApiRequest(event, 'GET /api/result/:id')

  try {
    const token = requireValidToken(event)
    const sessionId = getRouterParam(event, 'id')

    if (!sessionId) {
      throw createError({ statusCode: 400, statusMessage: 'sessionId가 필요합니다.' })
    }

    const session = getSessionOrThrow(sessionId)
    assertSessionOwnership(session, token)

    const report = getReport(sessionId) || session.report

    if (!report) {
      throw createError({ statusCode: 404, statusMessage: '아직 결과가 생성되지 않았습니다.' })
    }

    endApiRequest(request, {
      status: 'ok',
      sessionId
    })

    return report
  }
  catch (error: any) {
    failApiRequest(request, error)
    throw error
  }
})
