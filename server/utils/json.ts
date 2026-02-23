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
  rawParseLatencyMs: number
  repairParseLatencyMs: number
  repairApplied: boolean
  error?: string
}

export const parseJsonRepairWithMeta = <T>(raw: string): JsonParseMeta<T> => {
  const startedAt = Date.now()
  if (!raw) {
    return {
      value: null,
      repaired: false,
      stage: 'failed',
      rawParseLatencyMs: Date.now() - startedAt,
      repairParseLatencyMs: 0,
      repairApplied: false,
      error: 'empty response'
    }
  }

  const firstTry = raw.trim()
  const rawParseStarted = Date.now()
  try {
    const parsed = JSON.parse(firstTry) as T
    return {
      value: parsed,
      repaired: false,
      stage: 'raw',
      rawParseLatencyMs: Date.now() - rawParseStarted,
      repairParseLatencyMs: 0,
      repairApplied: false
    }
  }
  catch (error: any) {
    const rawParseLatencyMs = Date.now() - rawParseStarted
    const repaired = removeTrailingCommas(extractJsonLike(stripMarkdownFence(firstTry)))
    const repairParseStarted = Date.now()
    try {
      const parsed = JSON.parse(repaired) as T
      return {
        value: parsed,
        repaired: true,
        stage: 'repaired',
        rawParseLatencyMs,
        repairParseLatencyMs: Date.now() - repairParseStarted,
        repairApplied: true
      }
    }
    catch (repairError: any) {
      return {
        value: null,
        repaired: true,
        stage: 'failed',
        rawParseLatencyMs,
        repairParseLatencyMs: Date.now() - repairParseStarted,
        repairApplied: true,
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
