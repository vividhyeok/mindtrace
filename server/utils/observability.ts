import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { getErrorReasonCode } from '~/server/utils/error-codes'
import { logBasic, logFull } from '~/server/utils/logger'

export interface ApiRequestContext {
  requestId: string
  endpoint: string
  method: string
  ip: string
  startedAt: number
}

export const getClientIp = (event: H3Event): string => {
  const forwardedFor = getHeader(event, 'x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = getHeader(event, 'x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  return event.node.req.socket.remoteAddress || 'unknown'
}

const getErrorInfo = (error: any) => ({
  statusCode: Number(error?.statusCode || error?.status || 500),
  statusMessage: String(error?.statusMessage || error?.message || 'internal error')
})

export const beginApiRequest = (event: H3Event, endpoint: string): ApiRequestContext => {
  const requestId = randomUUID().slice(0, 12)
  const ctx: ApiRequestContext = {
    requestId,
    endpoint,
    method: event.node.req.method || 'UNKNOWN',
    ip: getClientIp(event),
    startedAt: Date.now()
  }

  setHeader(event, 'x-request-id', requestId)

  logBasic('api.request', {
    requestId: ctx.requestId,
    endpoint: ctx.endpoint,
    method: ctx.method,
    ip: ctx.ip
  })

  return ctx
}

export const endApiRequest = (
  ctx: ApiRequestContext,
  payload: Record<string, unknown> = {}
) => {
  logBasic('api.response', {
    requestId: ctx.requestId,
    endpoint: ctx.endpoint,
    latencyMs: Date.now() - ctx.startedAt,
    ...payload
  })
}

export const failApiRequest = (
  ctx: ApiRequestContext,
  error: any,
  payload: Record<string, unknown> = {}
) => {
  const errorInfo = getErrorInfo(error)
  const reasonCode = getErrorReasonCode(error) || undefined
  const latencyMs = Date.now() - ctx.startedAt

  logBasic('api.error', {
    requestId: ctx.requestId,
    endpoint: ctx.endpoint,
    latencyMs,
    statusCode: errorInfo.statusCode,
    statusMessage: errorInfo.statusMessage,
    reasonCode,
    ...payload
  })

  logFull('api.error.detail', {
    requestId: ctx.requestId,
    endpoint: ctx.endpoint,
    stack: String(error?.stack || 'no stack')
  })
}
