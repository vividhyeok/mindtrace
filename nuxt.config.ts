// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@unocss/nuxt'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    appPasscode: process.env.APP_PASSCODE,
    logLevel: process.env.LOG_LEVEL || 'basic',
    maxQuestions: process.env.MAX_QUESTIONS || '20',
    minQuestions: process.env.MIN_QUESTIONS || '8',
    sessionTtlMinutes: process.env.SESSION_TTL_MINUTES || '180',
    public: {
      appName: 'mindtrace'
    }
  },
  app: {
    head: {
      title: 'mindtrace',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }]
    }
  },
  typescript: {
    strict: true,
    typeCheck: false
  },
  nitro: {
    experimental: {
      openAPI: false
    }
  }
})
