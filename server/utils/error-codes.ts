import type { ApiReasonCode } from '~/types/mindtrace'

const reasonMessageMap: Record<ApiReasonCode, string> = {
  AUTH_TOKEN_MISSING: '인증 토큰이 없습니다. 초대코드를 다시 입력해 주세요.',
  AUTH_TOKEN_INVALID: '인증 토큰이 유효하지 않습니다. 초대코드를 다시 입력해 주세요.',
  AUTH_TOKEN_EXPIRED: '인증 토큰이 만료되었습니다. 초대코드를 다시 입력해 주세요.',
  SESSION_NOT_FOUND: '세션이 만료되었거나 서버가 재시작되었습니다. 새로 시작해 주세요.',
  SESSION_EXPIRED: '세션이 만료되었거나 서버가 재시작되었습니다. 새로 시작해 주세요.',
  SESSION_TOKEN_MISMATCH: '세션 정보가 일치하지 않습니다. 새로 시작해 주세요.',
  SESSION_ALREADY_FINALIZED: '이미 결과가 확정된 세션입니다. 결과 페이지를 확인해 주세요.'
}

export const getReasonMessage = (code: ApiReasonCode): string => reasonMessageMap[code]

export const createReasonError = (
  code: ApiReasonCode,
  statusCode = 401,
  statusMessage = getReasonMessage(code)
) => {
  return createError({
    statusCode,
    statusMessage,
    data: {
      code,
      userMessage: statusMessage
    }
  })
}

export const getErrorReasonCode = (error: any): string => {
  const direct = error?.data?.code
  if (typeof direct === 'string') {
    return direct
  }

  const nested = error?.data?.data?.code
  if (typeof nested === 'string') {
    return nested
  }

  return ''
}

