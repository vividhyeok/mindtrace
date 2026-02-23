export default defineNuxtRouteMiddleware((to) => {
  if (!process.client) return

  const session = useClientSession()
  const token = session.getToken()

  if (!token || session.isTokenExpired()) {
    session.clearToken()
    session.clearSession()
    if (to.path !== '/') {
      return navigateTo('/')
    }
  }
})
