import { getAppConfig } from '~/server/utils/config'

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value)
  }
  catch {
    return '[unserializable]'
  }
}

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
