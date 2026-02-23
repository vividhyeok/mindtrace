export function useApiClient() {
  const session = useClientSession()

  const handleAuthFailure = async (error: any) => {
    const statusCode = Number(error?.statusCode || error?.data?.statusCode || 0)
    if (statusCode !== 401) return

    session.clearToken()
    session.clearSession()

    if (process.client && window.location.pathname !== '/') {
      await navigateTo('/')
    }
  }

  const post = async <T>(url: string, body: Record<string, unknown>) => {
    const token = session.getToken()
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
      await handleAuthFailure(error)
      throw error
    }
  }

  const get = async <T>(url: string, params: Record<string, string> = {}) => {
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
      await handleAuthFailure(error)
      throw error
    }
  }

  return { post, get }
}
