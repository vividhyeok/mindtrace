import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { getAppConfig } from '~/server/utils/config'
import { createReasonError } from '~/server/utils/error-codes'
import { logFull, maskToken } from '~/server/utils/logger'

interface AuthTokenRecord {
  token: string
  expiresAt: number
}

interface AuthCheckContext {
  requestId?: string
  endpoint?: string
}

const authTokenStore = new Map<string, AuthTokenRecord>()

const hashValue = (input: string) => createHash('sha256').update(input).digest()

const cleanupExpired = () => {
  const now = Date.now()
  for (const [token, value] of authTokenStore.entries()) {
    if (value.expiresAt <= now) {
      authTokenStore.delete(token)
    }
  }
}

export const verifyPasscode = (candidate: string): boolean => {
  const { appPasscode } = getAppConfig()
  if (!appPasscode) {
    return false
  }

  const left = hashValue(candidate)
  const right = hashValue(appPasscode)
  return timingSafeEqual(left, right)
}

export const issueAuthToken = (): { token: string, expiresAt: string } => {
  cleanupExpired()

  const { sessionTtlMinutes } = getAppConfig()
  const token = randomBytes(24).toString('base64url')
  const expiresAt = Date.now() + sessionTtlMinutes * 60 * 1000

  authTokenStore.set(token, {
    token,
    expiresAt
  })

  return {
    token,
    expiresAt: String(expiresAt)
  }
}

const resolveToken = (
  event: H3Event,
  tokenFromBody?: string
): { token: string, source: 'body' | 'query' | 'header' | 'none' } => {
  if (tokenFromBody && tokenFromBody.length > 0) {
    return { token: tokenFromBody, source: 'body' }
  }

  const queryToken = getQuery(event).token
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return { token: queryToken, source: 'query' }
  }

  const authHeader = getHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return { token: authHeader.slice(7).trim(), source: 'header' }
  }

  return { token: '', source: 'none' }
}

export const requireValidToken = (
  event: H3Event,
  tokenFromBody?: string,
  context: AuthCheckContext = {}
): string => {
  cleanupExpired()

  const resolved = resolveToken(event, tokenFromBody)
  const token = resolved.token

  logFull('auth.check.start', {
    requestId: context.requestId || 'n/a',
    endpoint: context.endpoint || 'unknown',
    tokenSource: resolved.source,
    hasToken: token.length > 0
  })

  if (!token) {
    logFull('auth.check.fail', {
      requestId: context.requestId || 'n/a',
      endpoint: context.endpoint || 'unknown',
      reasonCode: 'AUTH_TOKEN_MISSING'
    })
    throw createReasonError('AUTH_TOKEN_MISSING')
  }

  const found = authTokenStore.get(token)
  if (!found) {
    logFull('auth.check.fail', {
      requestId: context.requestId || 'n/a',
      endpoint: context.endpoint || 'unknown',
      reasonCode: 'AUTH_TOKEN_INVALID',
      token: maskToken(token)
    })
    throw createReasonError('AUTH_TOKEN_INVALID')
  }

  if (found.expiresAt <= Date.now()) {
    authTokenStore.delete(token)
    logFull('auth.check.fail', {
      requestId: context.requestId || 'n/a',
      endpoint: context.endpoint || 'unknown',
      reasonCode: 'AUTH_TOKEN_EXPIRED',
      token: maskToken(token),
      expiresAt: found.expiresAt
    })
    throw createReasonError('AUTH_TOKEN_EXPIRED')
  }

  return token
}
