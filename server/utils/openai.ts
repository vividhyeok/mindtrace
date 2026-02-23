import { getAppConfig } from '~/server/utils/config'
import { parseJsonRepairWithMeta } from '~/server/utils/json'
import { logBasic, logFull } from '~/server/utils/logger'

interface O3JsonOptions<T> {
  label: string
  system: string
  user: string
  schema?: Record<string, unknown>
  fallback: () => T
  requestId?: string
  promptMeta?: Record<string, unknown>
}

const OPENAI_URL = 'https://api.openai.com/v1/responses'

const extractOutputText = (payload: any): string => {
  if (typeof payload?.output_text === 'string' && payload.output_text.length > 0) {
    return payload.output_text
  }

  if (Array.isArray(payload?.output)) {
    const chunks: string[] = []
    for (const node of payload.output) {
      if (!Array.isArray(node?.content)) continue
      for (const content of node.content) {
        if (typeof content?.text === 'string') {
          chunks.push(content.text)
        }
      }
    }
    if (chunks.length > 0) {
      return chunks.join('\n').trim()
    }
  }

  if (typeof payload?.content === 'string') {
    return payload.content
  }

  return ''
}

const buildInput = (system: string, user: string) => ([
  {
    role: 'system',
    content: [
      {
        type: 'input_text',
        text: system
      }
    ]
  },
  {
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: user
      }
    ]
  }
])

const shorten = (text: string, max = 200) => {
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

const callOpenAI = async (
  apiKey: string,
  payload: Record<string, unknown>,
  label: string
): Promise<{ text: string, latencyMs: number }> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  const startedAt = Date.now()

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI ${label} failed: ${response.status} ${shorten(errorText, 280)}`)
    }

    const json = await response.json()
    const text = extractOutputText(json)
    return {
      text,
      latencyMs: Date.now() - startedAt
    }
  }
  finally {
    clearTimeout(timeout)
  }
}

export const requestO3Json = async <T>(options: O3JsonOptions<T>): Promise<T> => {
  const { openaiApiKey } = getAppConfig()
  const promptChars = options.system.length + options.user.length
  const promptTokensEst = Math.ceil(promptChars / 3.2)

  if (!openaiApiKey) {
    logBasic('openai.mock_fallback', {
      requestId: options.requestId || 'n/a',
      label: options.label,
      reason: 'missing OPENAI_API_KEY',
      fallbackUsed: true,
      promptChars,
      promptTokensEst
    })
    return options.fallback()
  }

  try {
    const payloadWithSchema: Record<string, unknown> = {
      model: 'o3',
      input: buildInput(options.system, options.user)
    }

    if (options.schema) {
      payloadWithSchema.text = {
        format: {
          type: 'json_schema',
          name: `${options.label.replace(/\s+/g, '_')}_schema`,
          schema: options.schema,
          strict: false
        }
      }
    }

    logFull('openai.request', {
      requestId: options.requestId || 'n/a',
      label: options.label,
      schema: !!options.schema,
      promptChars,
      promptTokensEst,
      ...options.promptMeta
    })

    const firstCall = await callOpenAI(openaiApiKey, payloadWithSchema, options.label)
    const firstParse = parseJsonRepairWithMeta<T>(firstCall.text)

    if (firstParse.value) {
      logBasic('openai.success', {
        requestId: options.requestId || 'n/a',
        label: options.label,
        latencyMs: firstCall.latencyMs,
        repairedJson: firstParse.repaired,
        parseLatencyMs: firstParse.rawParseLatencyMs + firstParse.repairParseLatencyMs,
        repairLatencyMs: firstParse.repairParseLatencyMs,
        repairApplied: firstParse.repairApplied,
        fallbackUsed: false,
        retry: false,
        promptChars,
        promptTokensEst
      })
      return firstParse.value
    }

    logFull('openai.parse_failed', {
      requestId: options.requestId || 'n/a',
      label: options.label,
      stage: firstParse.stage,
      error: firstParse.error || 'unknown',
      parseLatencyMs: firstParse.rawParseLatencyMs + firstParse.repairParseLatencyMs,
      repairLatencyMs: firstParse.repairParseLatencyMs,
      responsePreview: shorten(firstCall.text)
    })

    const payloadSimple = {
      model: 'o3',
      input: buildInput(options.system, options.user)
    }

    const secondCall = await callOpenAI(openaiApiKey, payloadSimple, options.label)
    const secondParse = parseJsonRepairWithMeta<T>(secondCall.text)

    if (secondParse.value) {
      logBasic('openai.success', {
        requestId: options.requestId || 'n/a',
        label: options.label,
        latencyMs: firstCall.latencyMs + secondCall.latencyMs,
        repairedJson: secondParse.repaired,
        parseLatencyMs: secondParse.rawParseLatencyMs + secondParse.repairParseLatencyMs,
        repairLatencyMs: secondParse.repairParseLatencyMs,
        repairApplied: secondParse.repairApplied,
        fallbackUsed: false,
        retry: true,
        promptChars,
        promptTokensEst
      })
      return secondParse.value
    }

    logFull('openai.parse_failed_retry', {
      requestId: options.requestId || 'n/a',
      label: options.label,
      stage: secondParse.stage,
      error: secondParse.error || 'unknown',
      parseLatencyMs: secondParse.rawParseLatencyMs + secondParse.repairParseLatencyMs,
      repairLatencyMs: secondParse.repairParseLatencyMs,
      responsePreview: shorten(secondCall.text)
    })

    throw new Error(`OpenAI ${options.label} returned malformed JSON after retry`)
  }
  catch (error: any) {
    logBasic('openai.fallback', {
      requestId: options.requestId || 'n/a',
      label: options.label,
      fallbackUsed: true,
      reason: error?.message || 'unknown error',
      promptChars,
      promptTokensEst
    })
    return options.fallback()
  }
}
