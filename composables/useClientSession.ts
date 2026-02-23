import type { FinalReport } from '~/types/mindtrace'

const TOKEN_KEY = 'mindtrace_token'
const TOKEN_EXP_KEY = 'mindtrace_token_exp'
const SESSION_KEY = 'mindtrace_session_id'

export function useClientSession() {
  const isClient = process.client

  const getToken = () => {
    if (!isClient) return ''
    return localStorage.getItem(TOKEN_KEY) || ''
  }

  const setToken = (token: string, expiresAt: string) => {
    if (!isClient) return
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(TOKEN_EXP_KEY, expiresAt)
  }

  const clearToken = () => {
    if (!isClient) return
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXP_KEY)
  }

  const isTokenExpired = () => {
    if (!isClient) return true
    const expiresAt = localStorage.getItem(TOKEN_EXP_KEY)
    if (!expiresAt) return true
    return Date.now() >= Number(expiresAt)
  }

  const getSessionId = () => {
    if (!isClient) return ''
    return localStorage.getItem(SESSION_KEY) || ''
  }

  const setSessionId = (sessionId: string) => {
    if (!isClient) return
    localStorage.setItem(SESSION_KEY, sessionId)
  }

  const clearSession = () => {
    if (!isClient) return
    const current = localStorage.getItem(SESSION_KEY)
    if (current) {
      localStorage.removeItem(`mindtrace_report_${current}`)
    }
    localStorage.removeItem(SESSION_KEY)
  }

  const saveReport = (sessionId: string, report: FinalReport) => {
    if (!isClient) return
    localStorage.setItem(`mindtrace_report_${sessionId}`, JSON.stringify(report))
  }

  const loadReport = (sessionId: string): FinalReport | null => {
    if (!isClient) return null
    const raw = localStorage.getItem(`mindtrace_report_${sessionId}`)
    if (!raw) return null
    try {
      return JSON.parse(raw) as FinalReport
    }
    catch {
      return null
    }
  }

  return {
    getToken,
    setToken,
    clearToken,
    isTokenExpired,
    getSessionId,
    setSessionId,
    clearSession,
    saveReport,
    loadReport
  }
}
