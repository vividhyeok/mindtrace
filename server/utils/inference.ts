import type {
  FinalizeModelOutput,
  FinalReport,
  MbtiType,
  PublicQuestion,
  Question,
  SessionState
} from '~/types/mindtrace'
import { sanitizeQuestionForClient } from '~/server/utils/questions'
import {
  deriveQuadra,
  deriveWingFromCandidates,
  getTopCandidates,
  summarizeDistribution
} from '~/server/utils/probability'
import { requestO3Json } from '~/server/utils/openai'
import { MBTI_TYPES } from '~/types/mindtrace'

const round3 = (n: number) => Math.round(n * 1000) / 1000

interface InferenceRequestOptions {
  requestId?: string
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
      '당신은 상황을 해석할 때 큰 구조와 현실 조건을 함께 본 뒤, 실행에서 리듬을 조절해 안정적으로 완성해 가는 편입니다. 관계에서는 표현과 판단을 분리해 신중히 움직이며, 선택 순간에는 즉흥보다 일관성을 유지하려는 경향이 강합니다. 압박이 큰 환경에서도 기준이 선명해질수록 강점이 더 잘 드러납니다.',
    misperception_ko:
      '겉으로는 느리거나 조심스럽게 보일 수 있으나 실제로는 오래 가는 선택을 만들기 위해 검증 단계를 의도적으로 거치는 타입입니다.',
    short_caption_ko: `mindtrace 결과: ${topMbti} · ${wing}. 보여지는 반응보다 내부 기준이 더 단단한 편.`,
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
    answers: session.answers.slice(-14),
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
