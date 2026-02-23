import { getAppConfig } from '~/server/utils/config'

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value)
  }
  catch {
    return '[unserializable]'
  }
}

const mask = (value: string, visibleLeft = 4, visibleRight = 3) => {
  if (!value) return ''
  if (value.length <= visibleLeft + visibleRight) {
    return `${value.slice(0, 1)}***`
  }
  return `${value.slice(0, visibleLeft)}***${value.slice(-visibleRight)}`
}

export const maskToken = (token?: string) => mask(String(token || ''), 4, 3)

export const maskSessionId = (sessionId?: string) => mask(String(sessionId || ''), 8, 4)

export const logBasic = (label: string, payload?: unknown) => {
  const { logLevel } = getAppConfig()
  if (process.env.NODE_ENV === 'production' && logLevel !== 'basic') {
    console.info(`[mindtrace/basic] ${label} ${payload ? safeJson(payload) : ''}`)
    return
  }

  if (logLevel === 'basic' || logLevel === 'full') {
    console.info(`[mindtrace/basic] ${label} ${payload ? safeJson(payload) : ''}`)
  }
}

export const logFull = (label: string, payload?: unknown) => {
  const { logLevel } = getAppConfig()
  if (process.env.NODE_ENV === 'production') {
    return
  }

  if (logLevel === 'full') {
    console.info(`[mindtrace/full] ${label} ${payload ? safeJson(payload) : ''}`)
  }
}
