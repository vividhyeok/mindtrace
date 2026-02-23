export function useApiClient() {
  const session = useClientSession()

  type AuthBehavior = 'redirect' | 'stay'

  interface RequestOptions {
    authBehavior?: AuthBehavior
  }

  const maskToken = (value: string) => {
    if (!value) return ''
    if (value.length <= 7) {
      return `${value.slice(0, 1)}***`
    }
    return `${value.slice(0, 4)}***${value.slice(-3)}`
  }

  const getReasonCode = (error: any) => {
    return String(error?.data?.code || error?.data?.data?.code || '')
  }

  const handleAuthFailure = async (error: any, authBehavior: AuthBehavior = 'redirect') => {
    const statusCode = Number(error?.statusCode || error?.data?.statusCode || 0)
    if (statusCode !== 401) return

    const reasonCode = getReasonCode(error)

    if (process.dev) {
      console.info('[mindtrace/dev] auth.failure', {
        reasonCode,
        path: process.client ? window.location.pathname : ''
      })
    }

    if (reasonCode.startsWith('AUTH_')) {
      session.clearToken()
      session.clearSession()
    }
    else {
      session.clearSession()
    }

    if (authBehavior === 'redirect' && process.client && window.location.pathname !== '/') {
      await navigateTo('/')
    }
  }

  const post = async <T>(
    url: string,
    body: Record<string, unknown>,
    options: RequestOptions = {}
  ) => {
    const token = session.getToken()

    if (process.dev && process.client && url === '/api/answer') {
      console.info('[mindtrace/dev] answer.payload', {
        hasSessionId: Boolean(body.sessionId),
        hasToken: Boolean(token),
        token: maskToken(token),
        answer: body.answer
      })
    }

    try {
      return await $fetch<T>(url, {
        method: 'POST',
        body: {
          ...body,
          token
        }
      })
    }
    catch (error: any) {
      await handleAuthFailure(error, options.authBehavior || 'redirect')
      throw error
    }
  }

  const get = async <T>(
    url: string,
    params: Record<string, string> = {},
    options: RequestOptions = {}
  ) => {
    const token = session.getToken()
    try {
      return await $fetch<T>(url, {
        method: 'GET',
        query: {
          ...params,
          token
        }
      })
    }
    catch (error: any) {
      await handleAuthFailure(error, options.authBehavior || 'redirect')
      throw error
    }
  }

  return { post, get }
}
