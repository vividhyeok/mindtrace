import type {
  DistributionState,
  FinalizeModelOutput,
  FinalReport,
  MbtiAxis,
  MbtiType,
  PublicQuestion,
  Question,
  SessionState,
  UpdateModelOutput,
  YesNo
} from '~/types/mindtrace'
import {
  ensureQuestionScoring,
  getCuratedFallbackQuestion,
  sanitizeQuestionForClient,
  shouldUseIncongruenceFollowup,
  validateGeneratedQuestionQuality
} from '~/server/utils/questions'
import {
  deriveQuadra,
  deriveWingFromCandidates,
  getMostUncertainAxis,
  getTopCandidates,
  summarizeDistribution
} from '~/server/utils/probability'
import { requestO3Json } from '~/server/utils/openai'
import { logFull } from '~/server/utils/logger'
import { MBTI_TYPES, ENNEAGRAM_TYPES } from '~/types/mindtrace'

const round3 = (n: number) => Math.round(n * 1000) / 1000
const MAX_QUESTION_REGENERATIONS = 2

interface InferenceRequestOptions {
  requestId?: string
}

const distributionSummary = (distribution: DistributionState) => ({
  axisScores: distribution.axisScores,
  mbtiTop3: getTopCandidates(distribution.mbtiProbs16, 3),
  enneagramTop3: getTopCandidates(distribution.enneagramProbs9, 3),
  conflicts: distribution.conflicts
})

const nextQuestionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    text_ko: { type: 'string' },
    targets: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mbtiAxes: {
          type: 'array',
          items: { type: 'string', enum: ['IE', 'SN', 'TF', 'JP'] }
        },
        enneagram: {
          type: 'array',
          items: { type: 'string', enum: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] }
        }
      },
      required: ['mbtiAxes', 'enneagram']
    },
    rationale_short: { type: 'string' },
    scoring: {
      type: 'object',
      properties: {
        mbti: {
          type: 'object',
          additionalProperties: { type: 'number' }
        },
        enneagram: {
          type: 'object',
          additionalProperties: { type: 'number' }
        }
      },
      required: ['mbti', 'enneagram']
    }
  },
  required: ['id', 'text_ko', 'targets', 'rationale_short', 'scoring']
}

const updateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mbtiProbs16: {
      type: 'object',
      additionalProperties: { type: 'number' }
    },
    enneagramProbs9: {
      type: 'object',
      additionalProperties: { type: 'number' }
    },
    conflicts: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['mbtiProbs16', 'enneagramProbs9', 'conflicts']
}

const finalizeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mbti: {
      type: 'object',
      additionalProperties: false,
      properties: {
        top: { type: 'string' },
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string' },
              p: { type: 'number' }
            },
            required: ['type', 'p']
          }
        }
      },
      required: ['top', 'candidates']
    },
    enneagram: {
      type: 'object',
      additionalProperties: false,
      properties: {
        top: { type: 'string' },
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string' },
              p: { type: 'number' }
            },
            required: ['type', 'p']
          }
        }
      },
      required: ['top', 'candidates']
    },
    nickname_ko: { type: 'string' },
    narrative_ko: { type: 'string' },
    misperception_ko: { type: 'string' },
    short_caption_ko: { type: 'string' },
    style_tags: {
      type: 'object',
      additionalProperties: false,
      properties: {
        quadra: { type: 'string', enum: ['NT', 'ST', 'NF', 'SF'] },
        tone: { type: 'string', enum: ['C'] }
      },
      required: ['quadra', 'tone']
    }
  },
  required: [
    'mbti',
    'enneagram',
    'nickname_ko',
    'narrative_ko',
    'misperception_ko',
    'short_caption_ko',
    'style_tags'
  ]
}

const defaultModelUpdate = (distribution: DistributionState): UpdateModelOutput => ({
  mbtiProbs16: { ...distribution.mbtiProbs16 },
  enneagramProbs9: { ...distribution.enneagramProbs9 },
  conflicts: [...distribution.conflicts]
})

const normalizeProbMap = <T extends string>(values: Record<T, number>, allowed: readonly T[]): Record<T, number> => {
  const safe = Object.fromEntries(allowed.map(key => [key, Number(values?.[key] || 0)])) as Record<T, number>
  const sum = Object.values(safe).reduce((acc, value) => acc + Math.max(0, value), 0)
  if (sum <= 0) {
    const fallback = 1 / allowed.length
    return Object.fromEntries(allowed.map(key => [key, fallback])) as Record<T, number>
  }

  return Object.fromEntries(
    allowed.map(key => [key, Math.max(0, safe[key]) / sum])
  ) as Record<T, number>
}

export const generateAdaptiveQuestion = async (
  session: SessionState,
  options: InferenceRequestOptions = {}
): Promise<Question> => {
  const allowIncongruence = shouldUseIncongruenceFollowup(session)
  const fallback = ensureQuestionScoring(
    getCuratedFallbackQuestion(session, { allowIncongruence })
  )
  const uncertainAxis: MbtiAxis = getMostUncertainAxis(session.distribution)
  const recentQuestions = session.questionHistory.slice(-8)
  const recentQuestionTexts = recentQuestions.map(question => question.text_ko)

  const system = [
    'You generate one Korean yes/no scenario question for personality inference.',
    'Must be answerable with yes/no only (no neutral).',
    'Question text must be 18~70 Korean characters and concise.',
    'Use exactly one psychological angle per question: behavior OR internal reaction OR judgment criterion.',
    'Do not mix outer behavior, inner feeling, and decision criterion in one sentence.',
    'If situational, lock context clearly to one of: 업무/공식, 사적 관계, 일반 일상.',
    'Avoid ambiguous context labels like 갈등 회의, 중요한 상황.',
    'Comparison (A vs B) is allowed only within one axis.',
    'Avoid moral framing and socially desirable cues.',
    'Avoid abstract definition statements and avoid translation-like awkward wording.',
    'Forbidden expressions: 보통, 가끔, 대체로, 상황에 따라, 사람마다, 케바케, 종종, 때때로.',
    allowIncongruence
      ? 'Conflict mode is enabled: one incongruence check question is allowed (outer expression vs real judgment), but keep sentence short and concrete.'
      : 'Conflict mode is disabled: avoid incongruence framing.',
    'Question must be habit/reaction oriented and concise.',
    'Return strict JSON only.'
  ].join(' ')

  const previousFailures: string[] = []

  for (let attempt = 0; attempt <= MAX_QUESTION_REGENERATIONS; attempt += 1) {
    const user = [
      `Current uncertainty axis: ${uncertainAxis}`,
      `Conflict signals: ${session.distribution.conflicts.join(' | ') || 'none'}`,
      `Top MBTI: ${JSON.stringify(getTopCandidates(session.distribution.mbtiProbs16, 3))}`,
      `Top Enneagram: ${JSON.stringify(getTopCandidates(session.distribution.enneagramProbs9, 3))}`,
      `Recent questions (avoid overlap): ${JSON.stringify(recentQuestionTexts)}`,
      `Question mode: ${allowIncongruence ? 'single_dimension_or_incongruence' : 'single_dimension_only'}`,
      previousFailures.length > 0
        ? `Previous filter failures: ${previousFailures.join('; ')}`
        : 'Previous filter failures: none',
      'Provide one discriminative question in Korean.',
      'targets.mbtiAxes must include exactly one axis only.',
      'scoring.mbti should use IE/SN/TF/JP with positive value meaning yes -> first letter (I/S/T/J).',
      'scoring.enneagram should contain one to three types with positive weights.',
      'JSON keys: id, text_ko, targets, rationale_short, scoring.'
    ].join('\n')

    const modelQuestion = await requestO3Json<Question>({
      label: 'next_question',
      system,
      user,
      schema: nextQuestionSchema,
      requestId: options.requestId,
      fallback: () => fallback
    })

    const ensured = ensureQuestionScoring({
      ...modelQuestion,
      id: modelQuestion.id || fallback.id
    })

    const quality = validateGeneratedQuestionQuality(ensured, recentQuestions, {
      allowIncongruence
    })

    if (quality.valid) {
      logFull('question.filter.pass', {
        requestId: options.requestId || 'n/a',
        attempt,
        questionId: ensured.id,
        text: ensured.text_ko
      })
      return ensured
    }

    previousFailures.push(`attempt_${attempt}: ${quality.reasons.join(', ')}`)
    logFull('question.filter.reject', {
      requestId: options.requestId || 'n/a',
      attempt,
      questionId: ensured.id,
      text: ensured.text_ko,
      reasons: quality.reasons,
      similarity: quality.similarity
    })

    if (quality.ambiguityFlags.length > 0) {
      logFull('question.ambiguity.flag', {
        requestId: options.requestId || 'n/a',
        attempt,
        questionId: ensured.id,
        flags: quality.ambiguityFlags,
        text: ensured.text_ko
      })
    }

    if (attempt < MAX_QUESTION_REGENERATIONS) {
      logFull('question.filter.retry', {
        requestId: options.requestId || 'n/a',
        attemptFrom: attempt,
        attemptTo: attempt + 1,
        reasonCount: quality.reasons.length
      })
    }
  }

  logFull('question.filter.fallback', {
    requestId: options.requestId || 'n/a',
    regenerationCount: MAX_QUESTION_REGENERATIONS,
    fallbackQuestionId: fallback.id,
    fallbackText: fallback.text_ko,
    reasonSummary: previousFailures
  })

  return fallback
}

export const requestDistributionUpdate = async (
  session: SessionState,
  question: Question,
  answer: YesNo,
  options: InferenceRequestOptions = {}
): Promise<UpdateModelOutput | null> => {
  const dist = session.distribution

  const system = [
    'You are calibrating MBTI16 and Enneagram9 posterior distributions.',
    'Return valid JSON only.',
    'Respect current posterior and answer signal; adjust smoothly, not abruptly.'
  ].join(' ')

  const user = [
    `Question text: ${question.text_ko}`,
    `Targets: ${JSON.stringify(question.targets)}`,
    `Scoring reference: ${JSON.stringify(question.scoring || {})}`,
    `Answer: ${answer}`,
    `Current distribution summary: ${JSON.stringify(distributionSummary(dist))}`,
    'Return JSON with mbtiProbs16(16 types), enneagramProbs9(types 1-9), conflicts(list).',
    'Probabilities must each sum to 1.0 approximately.'
  ].join('\n')

  const raw = await requestO3Json<UpdateModelOutput>({
    label: 'distribution_update',
    system,
    user,
    schema: updateSchema,
    requestId: options.requestId,
    fallback: () => defaultModelUpdate(dist)
  })

  return {
    mbtiProbs16: normalizeProbMap(raw.mbtiProbs16, MBTI_TYPES),
    enneagramProbs9: normalizeProbMap(raw.enneagramProbs9, ENNEAGRAM_TYPES),
    conflicts: Array.isArray(raw.conflicts) ? raw.conflicts.slice(0, 6) : []
  }
}

const fallbackReport = (session: SessionState): FinalReport => {
  const mbtiCandidates = getTopCandidates(session.distribution.mbtiProbs16, 3).map(item => ({
    type: item.type,
    p: round3(item.p)
  }))

  const enneaCandidates = getTopCandidates(session.distribution.enneagramProbs9, 3).map(item => ({
    type: item.type,
    p: round3(item.p)
  }))

  const topMbti = mbtiCandidates[0]?.type || 'INFP'
  const topEnnea = enneaCandidates[0]?.type || '5'
  const secondEnnea = enneaCandidates[1]?.type || topEnnea
  const wing = deriveWingFromCandidates(topEnnea, secondEnnea)
  const quadra = deriveQuadra(topMbti)

  return {
    sessionId: session.id,
    mbti: {
      top: topMbti as MbtiType,
      candidates: mbtiCandidates
    },
    enneagram: {
      top: wing,
      candidates: enneaCandidates
    },
    nickname_ko: `${quadra} 탐색가`,
    narrative_ko:
      '당신은 상황을 해석할 때 큰 구조를 먼저 보고, 실행에서는 현실적인 제약을 함께 점검하는 편입니다. 관계에서는 거리를 조절하며 신뢰를 쌓고, 판단 순간에는 감정의 맥락과 논리적 정합성을 동시에 고려합니다. 무리하게 자신을 바꾸기보다, 자신이 잘 작동하는 리듬을 설계할 때 성과가 안정적으로 커집니다.',
    misperception_ko:
      '겉으로는 차갑거나 느리게 보일 수 있으나 실제로는 섣부른 결정보다 오래 가는 선택을 만들기 위해 속도를 조절하는 타입입니다.',
    short_caption_ko: `mindtrace 결과: ${topMbti} · ${wing}. 겉보기보다 깊게 설계하고, 천천히 확실하게 움직이는 편.`,
    style_tags: {
      quadra,
      tone: 'C'
    }
  }
}

export const finalizeWithModel = async (
  session: SessionState,
  options: InferenceRequestOptions = {}
): Promise<FinalReport> => {
  const fallback = fallbackReport(session)

  const promptData = {
    answers: session.answers.slice(-12),
    summary: summarizeDistribution(session.distribution),
    topMbti: getTopCandidates(session.distribution.mbtiProbs16, 3),
    topEnneagram: getTopCandidates(session.distribution.enneagramProbs9, 3)
  }

  const system = [
    'You produce a Korean personality summary report (non-medical).',
    'Tone C: analysis 60 + counseling 40.',
    'Avoid diagnosis or clinical claims.',
    'Return JSON only.'
  ].join(' ')

  const user = [
    'Input data follows as JSON.',
    JSON.stringify(promptData),
    'Requirements:',
    '- MBTI candidates should reflect probabilities and include 2-3 items.',
    '- Enneagram top should include wing string like 5w6.',
    '- Include section for misperception vs reality starting with phrase similar to "겉으로는 이렇게 보일 수 있으나 실제로는".',
    '- nickname should be metaphorical but not overly specific.'
  ].join('\n')

  const model = await requestO3Json<FinalizeModelOutput>({
    label: 'final_report',
    system,
    user,
    schema: finalizeSchema,
    requestId: options.requestId,
    fallback: () => ({
      mbti: fallback.mbti,
      enneagram: fallback.enneagram,
      nickname_ko: fallback.nickname_ko,
      narrative_ko: fallback.narrative_ko,
      misperception_ko: fallback.misperception_ko,
      short_caption_ko: fallback.short_caption_ko,
      style_tags: fallback.style_tags
    })
  })

  const mbtiCandidates = (model.mbti.candidates || []).filter(candidate => MBTI_TYPES.includes(candidate.type as MbtiType))
  const enneaCandidates = (model.enneagram.candidates || []).filter(candidate => /^(?:[1-9]|[1-9]w[1-9])$/.test(candidate.type))

  const safeMbtiCandidates = mbtiCandidates.length > 0 ? mbtiCandidates : fallback.mbti.candidates
  const safeEnneaCandidates = enneaCandidates.length > 0 ? enneaCandidates : fallback.enneagram.candidates

  const topEnneaType = safeEnneaCandidates[0]?.type || fallback.enneagram.top
  const normalizedTopEnnea = topEnneaType.includes('w')
    ? topEnneaType
    : deriveWingFromCandidates(topEnneaType, safeEnneaCandidates[1]?.type || '6')

  return {
    sessionId: session.id,
    mbti: {
      top: (MBTI_TYPES.includes(model.mbti.top as MbtiType)
        ? model.mbti.top
        : safeMbtiCandidates[0]?.type) as MbtiType,
      candidates: safeMbtiCandidates.slice(0, 3).map(item => ({
        type: item.type as MbtiType,
        p: round3(item.p)
      }))
    },
    enneagram: {
      top: normalizedTopEnnea,
      candidates: safeEnneaCandidates.slice(0, 3).map(item => ({
        type: item.type,
        p: round3(item.p)
      }))
    },
    nickname_ko: model.nickname_ko || fallback.nickname_ko,
    narrative_ko: model.narrative_ko || fallback.narrative_ko,
    misperception_ko:
      model.misperception_ko.startsWith('겉으로는')
        ? model.misperception_ko
        : `겉으로는 이렇게 보일 수 있으나 실제로는 ${model.misperception_ko}`,
    short_caption_ko: model.short_caption_ko || fallback.short_caption_ko,
    style_tags: {
      quadra: model.style_tags.quadra || fallback.style_tags.quadra,
      tone: 'C'
    }
  }
}

export const toPublicQuestion = (question: Question): PublicQuestion => sanitizeQuestionForClient(question)
