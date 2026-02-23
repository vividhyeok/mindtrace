import type { FinalReport } from '~/types/mindtrace'
import { requireValidToken } from '~/server/utils/auth'
import { finalizeWithModel } from '~/server/utils/inference'
import { logBasic, logFull } from '~/server/utils/logger'
import { beginApiRequest, endApiRequest, failApiRequest } from '~/server/utils/observability'
import { summarizeDistribution } from '~/server/utils/probability'
import { assertSessionBurstAllowed } from '~/server/utils/rate-limit'
import { assertSessionOwnership, getSessionOrThrow, saveReport, saveSession } from '~/server/utils/store'

export default defineEventHandler(async (event) => {
  const request = beginApiRequest(event, 'POST /api/finalize')

  try {
    const body = await readBody<{ token?: string, sessionId?: string }>(event)
    const token = requireValidToken(event, body.token, {
      requestId: request.requestId,
      endpoint: request.endpoint
    })

    if (!body.sessionId) {
      throw createError({ statusCode: 400, statusMessage: 'sessionId가 필요합니다.' })
    }

    assertSessionBurstAllowed('finalize', body.sessionId, request.requestId)

    const session = getSessionOrThrow(body.sessionId, {
      requestId: request.requestId,
      endpoint: request.endpoint
    })
    assertSessionOwnership(session, token, {
      requestId: request.requestId,
      endpoint: request.endpoint
    })

    if (session.report) {
      endApiRequest(request, {
        status: 'cached',
        sessionId: session.id
      })
      return session.report
    }

    const report: FinalReport = await finalizeWithModel(session, {
      requestId: request.requestId
    })

    session.done = true
    session.finalized = true
    session.report = report
    session.lastUpdatedAt = Date.now()

    saveSession(session)
    saveReport(session.id, report)

    logBasic('finalize.completed', {
      requestId: request.requestId,
      sessionId: session.id,
      mbti: report.mbti.top,
      enneagram: report.enneagram.top,
      finalDistributions: summarizeDistribution(session.distribution)
    })

    logFull('finalize.report', {
      requestId: request.requestId,
      report
    })

    endApiRequest(request, {
      status: 'ok',
      sessionId: session.id
    })

    return report
  }
  catch (error: any) {
    failApiRequest(request, error)
    throw error
  }
})
