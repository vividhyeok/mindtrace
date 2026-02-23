export interface AppConfig {
  openaiApiKey: string
  appPasscode: string
  logLevel: 'basic' | 'full'
  maxQuestions: number
  minQuestions: number
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
  const maxQuestions = toPositiveInt(runtime.maxQuestions, 28)
  const minQuestions = Math.min(toPositiveInt(runtime.minQuestions, 9), maxQuestions)

  return {
    openaiApiKey: String(runtime.openaiApiKey || ''),
    appPasscode: String(runtime.appPasscode || ''),
    logLevel: runtime.logLevel === 'full' ? 'full' : 'basic',
    maxQuestions,
    minQuestions,
    sessionTtlMinutes: toPositiveInt(runtime.sessionTtlMinutes, 180)
  }
}
