export interface AppConfig {
  openaiApiKey: string
  appPasscode: string
  logLevel: 'basic' | 'full'
  maxQuestions: number
  sessionTtlMinutes: number
}

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.floor(parsed)
}

export const getAppConfig = (): AppConfig => {
  const runtime = useRuntimeConfig()

  return {
    openaiApiKey: String(runtime.openaiApiKey || ''),
    appPasscode: String(runtime.appPasscode || ''),
    logLevel: runtime.logLevel === 'full' ? 'full' : 'basic',
    maxQuestions: toPositiveInt(runtime.maxQuestions, 28),
    sessionTtlMinutes: toPositiveInt(runtime.sessionTtlMinutes, 180)
  }
}
