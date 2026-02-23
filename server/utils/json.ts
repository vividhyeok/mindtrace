const stripMarkdownFence = (input: string) => {
  return input
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
}

const extractJsonLike = (input: string) => {
  const firstObject = input.indexOf('{')
  const lastObject = input.lastIndexOf('}')
  if (firstObject !== -1 && lastObject > firstObject) {
    return input.slice(firstObject, lastObject + 1)
  }

  const firstArray = input.indexOf('[')
  const lastArray = input.lastIndexOf(']')
  if (firstArray !== -1 && lastArray > firstArray) {
    return input.slice(firstArray, lastArray + 1)
  }

  return input
}

const removeTrailingCommas = (input: string) => input.replace(/,\s*([}\]])/g, '$1')

export const parseJsonRepair = <T>(raw: string): T | null => {
  if (!raw) {
    return null
  }

  const firstTry = raw.trim()
  try {
    return JSON.parse(firstTry) as T
  }
  catch {
    // noop
  }

  const repaired = removeTrailingCommas(extractJsonLike(stripMarkdownFence(firstTry)))

  try {
    return JSON.parse(repaired) as T
  }
  catch {
    return null
  }
}

export interface JsonParseMeta<T> {
  value: T | null
  repaired: boolean
  stage: 'raw' | 'repaired' | 'failed'
  error?: string
}

export const parseJsonRepairWithMeta = <T>(raw: string): JsonParseMeta<T> => {
  if (!raw) {
    return {
      value: null,
      repaired: false,
      stage: 'failed',
      error: 'empty response'
    }
  }

  const firstTry = raw.trim()
  try {
    return {
      value: JSON.parse(firstTry) as T,
      repaired: false,
      stage: 'raw'
    }
  }
  catch (error: any) {
    const repaired = removeTrailingCommas(extractJsonLike(stripMarkdownFence(firstTry)))
    try {
      return {
        value: JSON.parse(repaired) as T,
        repaired: true,
        stage: 'repaired'
      }
    }
    catch (repairError: any) {
      return {
        value: null,
        repaired: true,
        stage: 'failed',
        error: repairError?.message || error?.message || 'json parse failed'
      }
    }
  }
}

export const toSafeJsonString = (value: unknown) => {
  try {
    return JSON.stringify(value)
  }
  catch {
    return ''
  }
}
