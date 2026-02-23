import type { H3Event } from 'h3'
import { logBasic, logFull } from '~/server/utils/logger'
import { getClientIp } from '~/server/utils/observability'

interface AuthIpState {
  attempts: number[]
  failureStreak: number
  lastFailureAt: number
  blockedUntil: number
}

interface SessionBurstState {
  hits: number[]
  lastAt: number
}

const authIpMap = new Map<string, AuthIpState>()
const sessionBurstMap = new Map<string, SessionBurstState>()

const AUTH_WINDOW_MS = 60_000
const AUTH_MAX_ATTEMPTS_PER_WINDOW = 12
const AUTH_FAILURE_STREAK_LIMIT = 4
const AUTH_COOLDOWN_MS = 45_000
const AUTH_FAILURE_RESET_MS = 5 * 60_000

const SESSION_WINDOW_MS = 2_000
const SESSION_MAX_HITS_PER_WINDOW = 5
const SESSION_MIN_INTERVAL_MS = 260

const now = () => Date.now()

const getOrCreateAuthState = (ip: string): AuthIpState => {
  const existing = authIpMap.get(ip)
  if (existing) return existing

  const created: AuthIpState = {
    attempts: [],
    failureStreak: 0,
    lastFailureAt: 0,
    blockedUntil: 0
  }
  authIpMap.set(ip, created)
  return created
}

const pruneAuthState = (state: AuthIpState, current: number) => {
  state.attempts = state.attempts.filter(ts => current - ts <= AUTH_WINDOW_MS)

  if (state.lastFailureAt > 0 && current - state.lastFailureAt > AUTH_FAILURE_RESET_MS) {
    state.failureStreak = 0
  }

  if (state.blockedUntil > 0 && current >= state.blockedUntil) {
    state.blockedUntil = 0
  }
}

const cleanupAuthMap = (current: number) => {
  for (const [ip, state] of authIpMap.entries()) {
    pruneAuthState(state, current)
    const idleMs = current - Math.max(state.lastFailureAt || 0, state.attempts[state.attempts.length - 1] || 0)
    if (idleMs > AUTH_FAILURE_RESET_MS && state.attempts.length === 0 && state.blockedUntil === 0) {
      authIpMap.delete(ip)
    }
  }
}

export const assertAuthAttemptAllowed = (event: H3Event, requestId: string): string => {
  const ip = getClientIp(event)
  const current = now()
  cleanupAuthMap(current)

  const state = getOrCreateAuthState(ip)
  pruneAuthState(state, current)

  if (state.blockedUntil > current) {
    const retryAfterMs = state.blockedUntil - current
    logBasic('rate_limit.block', {
      requestId,
      type: 'auth',
      ip,
      reason: 'cooldown',
      retryAfterMs
    })

    throw createError({
      statusCode: 429,
      statusMessage: `요청이 잠시 제한되었습니다. ${Math.ceil(retryAfterMs / 1000)}초 후 다시 시도해 주세요.`
    })
  }

  if (state.attempts.length >= AUTH_MAX_ATTEMPTS_PER_WINDOW) {
    const retryAfterMs = AUTH_WINDOW_MS - (current - state.attempts[0])
    logBasic('rate_limit.block', {
      requestId,
      type: 'auth',
      ip,
      reason: 'too_many_attempts',
      retryAfterMs: Math.max(1, retryAfterMs)
    })

    throw createError({
      statusCode: 429,
      statusMessage: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.'
    })
  }

  state.attempts.push(current)
  return ip
}

export const recordAuthFailure = (ip: string, requestId: string) => {
  const current = now()
  const state = getOrCreateAuthState(ip)
  pruneAuthState(state, current)

  state.failureStreak += 1
  state.lastFailureAt = current

  if (state.failureStreak >= AUTH_FAILURE_STREAK_LIMIT) {
    state.failureStreak = 0
    state.blockedUntil = current + AUTH_COOLDOWN_MS

    logBasic('rate_limit.cooldown', {
      requestId,
      type: 'auth',
      ip,
      cooldownMs: AUTH_COOLDOWN_MS
    })
  }

  logFull('rate_limit.auth_failure', {
    requestId,
    ip,
    failureStreak: state.failureStreak,
    blockedUntil: state.blockedUntil
  })
}

export const clearAuthFailures = (ip: string) => {
  const state = authIpMap.get(ip)
  if (!state) return
  state.failureStreak = 0
  state.lastFailureAt = 0
  state.blockedUntil = 0
}

const getOrCreateSessionBurst = (key: string): SessionBurstState => {
  const existing = sessionBurstMap.get(key)
  if (existing) return existing

  const created: SessionBurstState = {
    hits: [],
    lastAt: 0
  }

  sessionBurstMap.set(key, created)
  return created
}

const cleanupSessionMap = (current: number) => {
  for (const [key, state] of sessionBurstMap.entries()) {
    state.hits = state.hits.filter(ts => current - ts <= SESSION_WINDOW_MS)
    if (state.hits.length === 0 && current - state.lastAt > SESSION_WINDOW_MS) {
      sessionBurstMap.delete(key)
    }
  }
}

export const assertSessionBurstAllowed = (
  action: 'answer' | 'finalize',
  sessionId: string,
  requestId: string
) => {
  const current = now()
  cleanupSessionMap(current)

  const key = `${action}:${sessionId}`
  const state = getOrCreateSessionBurst(key)
  state.hits = state.hits.filter(ts => current - ts <= SESSION_WINDOW_MS)

  if (state.lastAt > 0 && current - state.lastAt < SESSION_MIN_INTERVAL_MS) {
    logBasic('rate_limit.block', {
      requestId,
      type: 'session',
      action,
      sessionId,
      reason: 'too_fast'
    })

    throw createError({
      statusCode: 429,
      statusMessage: '입력이 너무 빠릅니다. 잠시만 기다려 주세요.'
    })
  }

  if (state.hits.length >= SESSION_MAX_HITS_PER_WINDOW) {
    logBasic('rate_limit.block', {
      requestId,
      type: 'session',
      action,
      sessionId,
      reason: 'burst'
    })

    throw createError({
      statusCode: 429,
      statusMessage: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.'
    })
  }

  state.hits.push(current)
  state.lastAt = current
}
