export function useApiClient() {
  const session = useClientSession()

  const post = async <T>(url: string, body: Record<string, unknown>) => {
    const token = session.getToken()
    return await $fetch<T>(url, {
      method: 'POST',
      body: {
        ...body,
        token
      }
    })
  }

  const get = async <T>(url: string, params: Record<string, string> = {}) => {
    const token = session.getToken()
    return await $fetch<T>(url, {
      method: 'GET',
      query: {
        ...params,
        token
      }
    })
  }

  return { post, get }
}
