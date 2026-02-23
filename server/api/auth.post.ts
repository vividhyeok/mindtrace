import { getAppConfig } from '~/server/utils/config'
import { issueAuthToken, verifyPasscode } from '~/server/utils/auth'
import { logBasic } from '~/server/utils/logger'
import { beginApiRequest, endApiRequest, failApiRequest } from '~/server/utils/observability'
import { assertAuthAttemptAllowed, clearAuthFailures, recordAuthFailure } from '~/server/utils/rate-limit'

export default defineEventHandler(async (event) => {
  const request = beginApiRequest(event, 'POST /api/auth')

  try {
    const body = await readBody<{ passcode?: string }>(event)
    const passcode = (body.passcode || '').trim()

    const ip = assertAuthAttemptAllowed(event, request.requestId)

    if (!passcode) {
      throw createError({ statusCode: 400, statusMessage: '초대 코드를 입력해 주세요.' })
    }

    const { appPasscode } = getAppConfig()
    if (!appPasscode) {
      throw createError({
        statusCode: 500,
        statusMessage: '서버 APP_PASSCODE가 설정되지 않았습니다.'
      })
    }

    if (!verifyPasscode(passcode)) {
      recordAuthFailure(ip, request.requestId)
      throw createError({ statusCode: 401, statusMessage: '초대 코드가 올바르지 않습니다.' })
    }

    clearAuthFailures(ip)

    const issued = issueAuthToken()
    logBasic('auth.success', {
      requestId: request.requestId,
      expiresAt: issued.expiresAt
    })

    endApiRequest(request, {
      status: 'ok'
    })

    return issued
  }
  catch (error: any) {
    failApiRequest(request, error)
    throw error
  }
})
