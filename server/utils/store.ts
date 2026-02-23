import type { FinalReport, SessionState } from '~/types/mindtrace'

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

export const getSessionOrThrow = (sessionId: string): SessionState => {
  cleanExpiredSessions()
  const session = sessionStore.get(sessionId)
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: '세션을 찾을 수 없습니다.' })
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

export const assertSessionOwnership = (session: SessionState, token: string) => {
  if (session.token !== token) {
    throw createError({ statusCode: 403, statusMessage: '세션 권한이 없습니다.' })
  }
}
