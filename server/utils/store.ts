import type { FinalReport, SessionState } from '~/types/mindtrace'
import { createReasonError } from '~/server/utils/error-codes'
import { logFull, maskSessionId, maskToken } from '~/server/utils/logger'

interface SessionLogContext {
  requestId?: string
  endpoint?: string
}

const sessionStore = new Map<string, SessionState>()
const reportStore = new Map<string, FinalReport>()

const cleanExpiredSessions = () => {
  const now = Date.now()
  for (const [id, session] of sessionStore.entries()) {
    if (session.expiresAt <= now) {
      sessionStore.delete(id)
      reportStore.delete(id)
    }
  }
}

export const saveSession = (session: SessionState) => {
  cleanExpiredSessions()
  sessionStore.set(session.id, session)
}

export const getSessionOrThrow = (
  sessionId: string,
  context: SessionLogContext = {}
): SessionState => {
  const session = sessionStore.get(sessionId)
  if (!session) {
    logFull('session.lookup.fail', {
      requestId: context.requestId || 'n/a',
      endpoint: context.endpoint || 'unknown',
      reasonCode: 'SESSION_NOT_FOUND',
      sessionId: maskSessionId(sessionId)
    })
    throw createReasonError('SESSION_NOT_FOUND')
  }

  if (session.expiresAt <= Date.now()) {
    sessionStore.delete(sessionId)
    reportStore.delete(sessionId)
    logFull('session.lookup.fail', {
      requestId: context.requestId || 'n/a',
      endpoint: context.endpoint || 'unknown',
      reasonCode: 'SESSION_EXPIRED',
      sessionId: maskSessionId(sessionId)
    })
    throw createReasonError('SESSION_EXPIRED')
  }

  return session
}

export const getSessionById = (sessionId: string): SessionState | null => {
  const session = sessionStore.get(sessionId)
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    sessionStore.delete(sessionId)
    reportStore.delete(sessionId)
    return null
  }
  return session
}

export const saveReport = (sessionId: string, report: FinalReport) => {
  reportStore.set(sessionId, report)
}

export const getReport = (sessionId: string): FinalReport | null => {
  cleanExpiredSessions()
  return reportStore.get(sessionId) || null
}

export const assertSessionOwnership = (
  session: SessionState,
  token: string,
  context: SessionLogContext = {}
) => {
  if (session.token !== token) {
    logFull('session.lookup.fail', {
      requestId: context.requestId || 'n/a',
      endpoint: context.endpoint || 'unknown',
      reasonCode: 'SESSION_TOKEN_MISMATCH',
      sessionId: maskSessionId(session.id),
      token: maskToken(token)
    })
    throw createReasonError('SESSION_TOKEN_MISMATCH')
  }
}
