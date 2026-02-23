import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { getAppConfig } from '~/server/utils/config'

interface AuthTokenRecord {
  token: string
  expiresAt: number
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

const resolveToken = (event: H3Event, tokenFromBody?: string): string => {
  if (tokenFromBody && tokenFromBody.length > 0) {
    return tokenFromBody
  }

  const queryToken = getQuery(event).token
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken
  }

  const authHeader = getHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim()
  }

  return ''
}

export const requireValidToken = (event: H3Event, tokenFromBody?: string): string => {
  cleanupExpired()

  const token = resolveToken(event, tokenFromBody)
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: '인증 토큰이 없습니다.' })
  }

  const found = authTokenStore.get(token)
  if (!found || found.expiresAt <= Date.now()) {
    authTokenStore.delete(token)
    throw createError({ statusCode: 401, statusMessage: '세션이 만료되었습니다. 다시 입장해 주세요.' })
  }

  return token
}
