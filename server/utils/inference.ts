import type {
  FinalizeModelOutput,
  FinalReport,
  MbtiType,
  PublicQuestion,
  Question,
  SessionState,
  TypeCandidate
} from '~/types/mindtrace'
import { sanitizeQuestionForClient } from '~/server/utils/questions'
import {
  deriveQuadra,
  deriveWingFromCandidates,
  getTopCandidates,
  summarizeDistribution
} from '~/server/utils/probability'
import { requestO3Json } from '~/server/utils/openai'
import { ENNEAGRAM_TYPES, MBTI_TYPES } from '~/types/mindtrace'

const round3 = (n: number) => Math.round(n * 1000) / 1000

const ensureText = (value: unknown, fallback: string) => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }
  return fallback
}

const ensureList = (
  value: unknown,
  fallback: string[],
  min = 3,
  max = 5
): string[] => {
  if (!Array.isArray(value)) {
    return fallback.slice(0, max)
  }

  const cleaned = value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(item => item.length > 0)

  if (cleaned.length < min) {
    return fallback.slice(0, max)
  }

  return cleaned.slice(0, max)
}

const clampCaption = (value: string, max = 130) => {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

const ensureOuterPrefix = (value: string) => {
  if (value.startsWith('겉으로는')) return value
  return `겉으로는 이렇게 보일 수 있으나 실제로는 ${value}`
}

const toPct = (p: number) => `${Math.round(Math.max(0, p) * 100)}%`

type QuadraType = 'NT' | 'ST' | 'NF' | 'SF'
type EnneaCore = (typeof ENNEAGRAM_TYPES)[number]

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
    summaryShort: { type: 'string' },
    corePattern: { type: 'string' },
    outerVsInner: { type: 'string' },
    strengthContexts: {
      type: 'array',
      items: { type: 'string' }
    },
    stressPattern: { type: 'string' },
    misreadByOthers: { type: 'string' },
    communicationTips: {
      type: 'array',
      items: { type: 'string' }
    },
    whyThisType: { type: 'string' },
    mbtiCompetitionNote: { type: 'string' },
    enneaCompetitionNote: { type: 'string' },
    growthHint: { type: 'string' },
    decisionStyle: { type: 'string' },
    narrative_ko: { type: 'string' },
    misperception_ko: { type: 'string' },
    short_caption_ko: { type: 'string' },
    deepInsights: {
      type: 'object',
      additionalProperties: false,
      properties: {
        responsePatternSummary: { type: 'string' },
        axisNarratives: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              axis: { type: 'string', enum: ['IE', 'SN', 'TF', 'JP'] },
              leaning: { type: 'string' },
              confidence: { type: 'number' },
              summary: { type: 'string' }
            },
            required: ['axis', 'leaning', 'confidence', 'summary']
          }
        },
        evidenceHighlights: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              question: { type: 'string' },
              answer: { type: 'string', enum: ['yes', 'no'] },
              interpretation: { type: 'string' },
              impact: { type: 'string' }
            },
            required: ['question', 'answer', 'interpretation', 'impact']
          }
        },
        confidenceCommentary: { type: 'string' }
      },
      required: ['responsePatternSummary', 'axisNarratives', 'evidenceHighlights', 'confidenceCommentary']
    },
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
    'summaryShort',
    'corePattern',
    'outerVsInner',
    'strengthContexts',
    'stressPattern',
    'misreadByOthers',
    'communicationTips',
    'whyThisType',
    'mbtiCompetitionNote',
    'enneaCompetitionNote',
    'narrative_ko',
    'misperception_ko',
    'short_caption_ko',
    'style_tags'
  ]
}

const quadraProfiles: Record<
  QuadraType,
  {
    nickname: string
    summary: string
    corePattern: string
    outerVsInner: string
    strengthContexts: string[]
    communicationTips: string[]
    growthHint: string
    decisionStyle: string
  }
> = {
  NT: {
    nickname: '구조 설계자',
    summary: '핵심 원리를 빨리 잡아내고, 기준이 보이면 실행 구조를 스스로 짜는 편입니다.',
    corePattern:
      '새 정보가 들어오면 먼저 구조를 잡고 모순을 찾으려는 반응이 빠른 편입니다. 감정 반응이 없어서가 아니라, 감정과 판단을 분리해 처리하려는 습관이 강합니다. 선택을 앞두면 방향성보다 기준의 일관성을 먼저 확인합니다. 그래서 초반 속도는 느려 보여도, 중간에 흔들릴 가능성은 낮은 편입니다. 반복 업무에서도 작은 개선 포인트를 찾아 흐름을 바꾸는 데 강점이 있습니다. 압박이 높을수록 즉흥 대응보다 프레임 재정의로 문제를 푸는 경향이 또렷합니다.',
    outerVsInner:
      '겉으로는 차갑거나 거리감 있게 보일 수 있습니다. 실제로는 관계를 가볍게 대하지 않기 때문에, 말을 줄이고 정확도를 높여 전달하려는 쪽에 가깝습니다. 공감이 약해서가 아니라 섣부른 위로보다 오래 가는 해결 방식을 선택하는 편입니다.',
    strengthContexts: [
      '목표와 성공 기준이 명확한 프로젝트',
      '정보가 많아 우선순위 정리가 필요한 상황',
      '문제 원인과 구조를 다시 설계해야 하는 상황',
      '감정 소모보다 기준 합의가 중요한 협업'
    ],
    communicationTips: [
      '요청할 때 목적과 제약조건을 함께 말해 주세요.',
      '의견은 좋고 나쁨보다 근거 중심으로 전달해 주세요.',
      '급한 결정이 필요하면 선택 기준을 먼저 맞춰 주세요.',
      '피드백은 포괄적 평가보다 구체 사례가 효과적입니다.'
    ],
    growthHint:
      '정확한 판단을 중시하는 장점은 이미 강합니다. 여기에 "지금 상대가 무엇을 불안해하는지"를 한 문장으로 먼저 짚어주면 협업 속도가 크게 좋아집니다. 기준 설명 전에 감정 온도를 짧게 맞추는 습관이 관계 비용을 줄여 줍니다.',
    decisionStyle:
      '결정은 가능성 자체보다 재현 가능한 기준을 세운 뒤 진행합니다. 선택 이후에는 기준 이탈 여부를 점검하며 미세 조정하는 편입니다. 그래서 늦게 시작해도 최종 완성도는 안정적으로 유지됩니다.'
  },
  ST: {
    nickname: '현장 조율가',
    summary: '현실 조건을 빠르게 읽고, 당장 작동하는 방식으로 정리해 나가는 편입니다.',
    corePattern:
      '새 일을 맡으면 이상적인 답보다 실제로 돌아가는 절차를 먼저 확인합니다. 정보는 추상 요약보다 구체 사실로 정리할 때 안정감을 느끼는 경향이 있습니다. 일정과 역할을 분명히 나누면 성과가 빠르게 올라갑니다. 관계에서도 기준이 모호하면 피로가 커지기 쉬워, 약속과 책임을 분명히 하려는 습관이 강합니다. 급변 상황에서도 우선순위를 다시 정리해 흐름을 복구하는 능력이 좋습니다. 반복적인 개선과 마감 관리에서 신뢰를 얻는 타입입니다.',
    outerVsInner:
      '겉으로는 보수적이거나 융통성이 낮아 보일 수 있습니다. 실제로는 실패 비용을 줄이기 위해 확인 단계를 선호하는 것이고, 무작정 반대하려는 태도와는 거리가 있습니다. 기준이 맞으면 누구보다 빠르게 실행으로 옮기는 편입니다.',
    strengthContexts: [
      '역할과 일정이 선명한 팀 업무',
      '운영 안정성이 중요한 실무 환경',
      '체크리스트와 절차가 필요한 과제',
      '리스크를 줄이며 속도를 내야 하는 마감 구간'
    ],
    communicationTips: [
      '변경 요청은 이유와 마감 영향을 함께 설명해 주세요.',
      '추상 표현보다 구체 사례와 숫자로 이야기해 주세요.',
      '우선순위 충돌 시 기준 하나만 먼저 합의해 주세요.',
      '피드백은 개선 포인트를 단계별로 제시해 주세요.'
    ],
    growthHint:
      '안정성 중심 강점은 큰 자산입니다. 여기에 완성도 기준만큼 탐색 시간을 짧게 허용하면 선택지가 넓어집니다. "검증된 안 1개 + 실험안 1개" 방식이 부담 없이 균형을 만듭니다.',
    decisionStyle:
      '결정은 시행 가능성, 리스크, 책임 구분을 함께 보고 내립니다. 선택 후에는 계획을 세분화해 실행률을 올리는 편입니다. 변수가 생기면 다시 정리해도 기준선은 유지합니다.'
  },
  NF: {
    nickname: '의미 조율가',
    summary: '사람의 의도와 관계 맥락을 읽으면서도, 큰 방향의 의미를 놓치지 않는 편입니다.',
    corePattern:
      '대화를 들을 때 말의 표면보다 의도와 맥락을 먼저 읽는 경향이 있습니다. 선택에서는 효율만큼 관계의 지속 가능성을 중요하게 고려합니다. 사람을 맞추는 능력이 높아 보이지만, 실제로는 내부 기준이 분명한 편입니다. 스스로 납득되는 의미가 있어야 에너지가 오래 갑니다. 충돌 상황에서는 감정 온도를 조정한 뒤 핵심 쟁점을 정리하려는 습관이 있습니다. 가치와 현실 사이 균형점을 찾는 과정에서 강점을 보입니다.',
    outerVsInner:
      '겉으로는 부드럽고 잘 맞춰주는 사람처럼 보일 수 있습니다. 실제로는 상대의 감정을 존중하면서도, 내부적으로는 기준의 타당성을 계속 검토합니다. 그래서 침묵이 길어질 때는 망설임이 아니라 기준 정리 중인 경우가 많습니다.',
    strengthContexts: [
      '의도와 감정 조율이 중요한 협업',
      '여러 이해관계자를 설득해야 하는 상황',
      '방향성 재정의가 필요한 프로젝트 초기',
      '관계 유지와 성과 균형이 필요한 역할'
    ],
    communicationTips: [
      '요청할 때 의도와 기대 결과를 함께 전달해 주세요.',
      '비판은 단정형보다 대안형 표현이 효과적입니다.',
      '충돌 상황에선 감정 정리 시간을 짧게 허용해 주세요.',
      '진행 체크는 관계 피드백과 실행 피드백을 분리해 주세요.'
    ],
    growthHint:
      '관계 감각과 맥락 이해는 이미 강점입니다. 다만 과도한 배려로 결정이 늦어질 때가 있어, 선택 기한을 먼저 정해 두면 피로가 줄어듭니다. 모든 사람을 동시에 만족시키기보다 핵심 기준 2개를 고정해 보세요.',
    decisionStyle:
      '결정은 사실과 감정을 모두 반영하되, 장기 관계에 남는 영향까지 함께 봅니다. 최종 선택 전에는 내부 납득 여부를 꼭 확인합니다. 납득이 끝나면 실행 집중도는 높은 편입니다.'
  },
  SF: {
    nickname: '관계 안정 메이커',
    summary: '주변의 리듬을 세심하게 읽고, 현실적인 도움으로 분위기를 안정시키는 편입니다.',
    corePattern:
      '일상에서는 거창한 해석보다 실제로 도움이 되는 선택을 빠르게 찾습니다. 사람의 감정 변화를 민감하게 읽고, 관계가 무너지지 않도록 조율하는 능력이 강합니다. 다만 즉시 반응을 잘해도 내부적으로는 기준을 꼼꼼히 확인하는 편입니다. 익숙한 방식의 장점을 살리면서 작은 개선을 반복하는 데 강점이 있습니다. 부담이 큰 상황에서는 예측 가능한 루틴을 만들어 안정감을 확보합니다. 주변의 체감 만족도를 끌어올리는 실행력이 높은 타입입니다.',
    outerVsInner:
      '겉으로는 무난하고 순응적으로 보일 수 있습니다. 실제로는 관계를 지키기 위해 표현 수위를 조절하는 것이고, 내부 기준이 약해서는 아닙니다. 선이 넘는 상황에서는 생각보다 단호하게 정리하는 편입니다.',
    strengthContexts: [
      '팀 분위기 관리가 중요한 실무',
      '고객/사용자 체감이 핵심인 업무',
      '작은 개선을 빠르게 반복해야 하는 환경',
      '관계 갈등을 실용적으로 조정해야 하는 상황'
    ],
    communicationTips: [
      '요청은 추상 목표보다 구체 행동 단위로 말해 주세요.',
      '감사/피드백을 짧게라도 즉시 전달해 주세요.',
      '갈등 상황에서는 톤을 낮춘 뒤 사실부터 맞춰 주세요.',
      '변경이 잦을 때는 우선순위 하나를 먼저 확정해 주세요.'
    ],
    growthHint:
      '현실 감각과 배려가 강해 조직 안정에 큰 기여를 합니다. 다만 본인 우선순위를 뒤로 미루면 소진이 빨라질 수 있어, 하루 단위로 "내 기준 1개"를 먼저 지키는 루틴이 필요합니다. 경계선 표현을 짧고 명확하게 연습해 보세요.',
    decisionStyle:
      '결정은 사람의 체감과 실행 가능성을 함께 봅니다. 선택 후에는 관계 마찰을 줄이도록 표현을 조정하는 편입니다. 그래서 결과가 늦어 보여도 실제 만족도는 안정적으로 올라갑니다.'
  }
}

const enneaProfiles: Record<
  EnneaCore,
  {
    stressPattern: string
    misreadByOthers: string
    strengthContexts: string[]
    communicationTips: string[]
  }
> = {
  '1': {
    stressPattern:
      '기준이 흐려지면 마음이 급해지고, 세부 오류가 평소보다 크게 보일 수 있습니다. 이때 스스로에게도 타인에게도 기준을 강하게 적용하는 경향이 생깁니다. 통제 범위를 정해 우선순위 1~2개만 먼저 맞추면 긴장이 빠르게 내려갑니다.',
    misreadByOthers:
      '주변에서는 완벽주의로 보거나 까다롭다고 느낄 수 있습니다. 실제로는 결과보다 과정의 공정성과 품질을 지키려는 의도가 큽니다. 기준이 합의되면 협업 태도는 오히려 매우 안정적입니다.',
    strengthContexts: ['품질 기준이 명확한 업무', '검수/정리/리스크 관리가 필요한 상황'],
    communicationTips: ['기준 변경 시 이유를 먼저 공유해 주세요.']
  },
  '2': {
    stressPattern:
      '관계 신호를 과하게 읽는 시기에는 본인 필요를 뒤로 미루고 과부하가 쌓일 수 있습니다. 도움을 먼저 주고 나중에 지치는 패턴이 반복되면 거리 조절이 필요합니다. 요청의 우선순위를 명확히 하면 소진을 줄일 수 있습니다.',
    misreadByOthers:
      '주변에서는 늘 괜찮아 보인다고 오해하기 쉽습니다. 실제로는 관계를 위해 감정을 정리해 표현하는 경우가 많습니다. 적절한 보상과 인정이 주어지면 집중력이 크게 올라갑니다.',
    strengthContexts: ['돌봄/조율이 중요한 협업', '관계 만족도가 성과에 직결되는 상황'],
    communicationTips: ['요청 전에 "지금 가능한 범위"를 먼저 물어봐 주세요.']
  },
  '3': {
    stressPattern:
      '성과 압박이 높아지면 속도를 유지하려고 감정 신호를 뒤로 미루는 경향이 생깁니다. 단기 성과는 높아도 피로가 누적되면 몰입이 급감할 수 있습니다. 목표를 단계형으로 쪼개면 안정적으로 리듬을 유지할 수 있습니다.',
    misreadByOthers:
      '겉으로는 결과만 중시하는 사람처럼 보일 수 있습니다. 실제로는 팀의 기대를 실망시키지 않으려는 책임감이 크게 작동합니다. 기준이 명확할수록 협업 만족도도 함께 높아집니다.',
    strengthContexts: ['목표 달성 속도가 중요한 프로젝트', '성과 지표가 분명한 업무'],
    communicationTips: ['피드백은 칭찬과 개선점을 함께 짧게 전달해 주세요.']
  },
  '4': {
    stressPattern:
      '정서적으로 과부하가 오면 비교 감정이 커지고, 선택이 늦어질 수 있습니다. 이때 해석이 깊어지면서 행동이 멈추기 쉬워 루틴 복귀가 중요합니다. 감정을 인정한 뒤 실행 단위를 작게 쪼개면 회복이 빠릅니다.',
    misreadByOthers:
      '주변에서는 기복이 크다고만 볼 수 있습니다. 실제로는 의미가 납득되어야 오래 가는 몰입이 나오는 구조입니다. 납득이 끝난 뒤의 집중도는 매우 높은 편입니다.',
    strengthContexts: ['표현/해석이 필요한 기획', '차별화 관점이 필요한 문제 해결'],
    communicationTips: ['평가보다 맥락 설명을 먼저 주면 반응이 좋아집니다.']
  },
  '5': {
    stressPattern:
      '정보 과부하 상황에서는 먼저 거리를 두고 생각을 정리하려는 반응이 강해집니다. 외부에서는 소극적으로 보일 수 있지만 내부에서는 핵심 변수를 빠르게 추리는 중인 경우가 많습니다. 시간 경계를 정해 분석과 실행을 분리하면 지연을 줄일 수 있습니다.',
    misreadByOthers:
      '주변에서는 감정이 적거나 무심하다고 오해할 수 있습니다. 실제로는 섣부른 반응보다 정확한 판단을 책임지려는 태도가 강합니다. 신뢰가 쌓이면 표현 폭도 함께 넓어지는 타입입니다.',
    strengthContexts: ['깊은 탐구와 구조화가 필요한 과제', '복잡한 문제를 단순화해야 하는 상황'],
    communicationTips: ['즉답을 강요하기보다 판단 기한을 함께 정해 주세요.']
  },
  '6': {
    stressPattern:
      '불확실성이 커지면 최악 시나리오를 먼저 점검하는 경향이 강해집니다. 이 과정은 불안 때문이기도 하지만, 실제로 리스크를 조기에 찾는 장점으로도 작동합니다. 책임 범위와 안전장치를 명확히 하면 과경계가 줄어듭니다.',
    misreadByOthers:
      '주변에서는 걱정이 많다고만 볼 수 있습니다. 실제로는 팀을 지키기 위한 대비 성향이 핵심입니다. 신뢰 가능한 기준이 확보되면 실행 전환도 빠른 편입니다.',
    strengthContexts: ['리스크 관리가 중요한 업무', '불확실성이 큰 전환기 프로젝트'],
    communicationTips: ['변경 시 예상 리스크와 대응안을 같이 제시해 주세요.']
  },
  '7': {
    stressPattern:
      '자극이 많은 시기에는 선택지가 계속 늘어나며 집중이 분산될 수 있습니다. 재미와 가능성을 빠르게 보는 장점이 있지만, 마감 직전 피로가 급격히 커질 때가 있습니다. 핵심 1~2개만 남기는 컷오프 규칙이 필요합니다.',
    misreadByOthers:
      '주변에서는 가볍거나 산만하다고 오해할 수 있습니다. 실제로는 막힘을 풀고 대안을 찾는 속도가 빠른 것이 강점입니다. 구조가 잡히면 실행력도 충분히 따라오는 타입입니다.',
    strengthContexts: ['아이디어 확장이 필요한 초기 기획', '새로운 기회를 탐색해야 하는 상황'],
    communicationTips: ['선택지를 줄여 줄 우선순위 기준을 함께 정해 주세요.']
  },
  '8': {
    stressPattern:
      '압박이 커지면 통제 강도가 올라가고 표현이 직설적으로 변할 수 있습니다. 이는 상황을 빨리 정리하려는 반응이지만, 관계 마찰로 이어질 수 있습니다. 역할 위임과 확인 포인트를 분리하면 충돌을 줄일 수 있습니다.',
    misreadByOthers:
      '주변에서는 강압적이라고 느낄 수 있습니다. 실제로는 책임을 회피하지 않고 앞에서 감당하려는 태도가 큽니다. 신뢰 관계에서는 의외로 배려 폭이 넓은 편입니다.',
    strengthContexts: ['의사결정 속도가 필요한 위기 상황', '책임과 권한이 명확한 리더 역할'],
    communicationTips: ['반대 의견은 우회보다 핵심부터 직접 제시해 주세요.']
  },
  '9': {
    stressPattern:
      '긴장 상황이 지속되면 충돌을 피하려고 결정을 미루는 패턴이 생길 수 있습니다. 겉으로는 평온해 보여도 내부 피로는 누적되는 경우가 많습니다. 우선순위를 작게 쪼개 먼저 한 가지를 확정하면 흐름이 살아납니다.',
    misreadByOthers:
      '주변에서는 의지가 약하다고 오해하기 쉽습니다. 실제로는 관계 균형을 무너뜨리지 않으려는 조율 성향이 강한 것입니다. 기준이 선명해지면 꾸준한 실행력이 잘 나오는 편입니다.',
    strengthContexts: ['갈등 완화와 조율이 필요한 팀 상황', '지속 운영과 안정성이 중요한 업무'],
    communicationTips: ['선택지를 줄여 "지금 결정할 것"을 명확히 해 주세요.']
  }
}

const extractEnneaCore = (value: string): EnneaCore => {
  const matched = value.match(/[1-9]/)?.[0] as EnneaCore | undefined
  if (matched && ENNEAGRAM_TYPES.includes(matched)) {
    return matched
  }
  return '5'
}

const axisLabelMap: Record<string, string> = {
  IE: '에너지 방향(I/E)',
  SN: '정보 처리(S/N)',
  TF: '판단 기준(T/F)',
  JP: '생활 리듬(J/P)'
}

const describeAxisLeaning = (axis: string, score: number) => {
  const strong = Math.abs(score) >= 0.92
  if (axis === 'IE') return score >= 0 ? (strong ? '내향 우세' : '내향 약우세') : (strong ? '외향 우세' : '외향 약우세')
  if (axis === 'SN') return score >= 0 ? (strong ? '감각 우세' : '감각 약우세') : (strong ? '직관 우세' : '직관 약우세')
  if (axis === 'TF') return score >= 0 ? (strong ? '사고 우세' : '사고 약우세') : (strong ? '감정 우세' : '감정 약우세')
  return score >= 0 ? (strong ? '계획 우세' : '계획 약우세') : (strong ? '탐색 우세' : '탐색 약우세')
}

const summarizeRecentAnswers = (session: SessionState, limit = 10) => {
  const questionMap = new Map(session.questionHistory.map(question => [question.id, question]))

  return session.answers.slice(-limit).map(answer => {
    const question = questionMap.get(answer.questionId)
    return {
      id: answer.questionId,
      answer: answer.answer === 'yes' ? '그렇다' : '아니다',
      text_ko: question?.text_ko || '',
      targets: question?.targets || answer.targets,
      context: question?.meta?.context || 'daily',
      mode: question?.meta?.mode || 'axis_scan',
      hesitationReason: answer.meta?.hesitationReason || null,
      deferred: Boolean(answer.meta?.deferred),
      confidenceWeight: answer.meta?.confidenceWeight || 1
    }
  })
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

  const topMbti = (mbtiCandidates[0]?.type || 'INFP') as MbtiType
  const secondMbti = (mbtiCandidates[1]?.type || 'ENFP') as MbtiType
  const topEnneaBase = enneaCandidates[0]?.type || '5'
  const secondEnneaBase = enneaCandidates[1]?.type || topEnneaBase
  const wing = deriveWingFromCandidates(topEnneaBase, secondEnneaBase)
  const quadra = deriveQuadra(topMbti)

  const quadraProfile = quadraProfiles[quadra]
  const enneaProfile = enneaProfiles[extractEnneaCore(wing)]

  const mergedStrengthContexts = Array.from(
    new Set([...quadraProfile.strengthContexts, ...enneaProfile.strengthContexts])
  ).slice(0, 5)

  const mergedCommunicationTips = Array.from(
    new Set([...quadraProfile.communicationTips, ...enneaProfile.communicationTips])
  ).slice(0, 5)

  const summaryShort = `${topMbti}와 ${wing} 신호가 가장 높게 모였습니다. ${quadraProfile.summary}`

  const whyThisType = [
    `MBTI 상위 후보는 ${topMbti}(${toPct(mbtiCandidates[0]?.p || 0)})로 가장 높았습니다.`,
    `2순위 ${secondMbti}(${toPct(mbtiCandidates[1]?.p || 0)})와 비교하면, 핵심 차이는 ${quadra} 그룹 특유의 판단 방식 안정성에서 나타났습니다.`,
    `응답 로그에서는 상황마다 기준을 바꾼다기보다, 비슷한 기준으로 반복 판단하는 경향이 관찰되었습니다.`,
    `Enneagram은 ${wing} 축이 우세했고, 특히 스트레스 대응 패턴에서 ${topEnneaBase} 성향이 더 선명했습니다.`
  ].join(' ')

  const mbtiCompetitionNote = [
    `${topMbti}와 ${secondMbti}는 모두 일부 신호가 겹쳤습니다.`,
    `다만 후반 응답에서 판단 우선순위가 더 일관되게 유지되어 ${topMbti} 쪽 가중치가 높게 남았습니다.`
  ].join(' ')

  const enneaCompetitionNote = [
    `${wing}와 ${secondEnneaBase} 계열이 경합했지만,`,
    `압박 상황에서 보이는 반응이 "자극 확장"보다 "안정/정리" 쪽으로 반복되어 ${wing}로 수렴했습니다.`
  ].join(' ')

  const outerVsInner = ensureOuterPrefix(quadraProfile.outerVsInner)
  const recentAnswers = summarizeRecentAnswers(session, 8)
  const axisNarratives = (Object.entries(session.distribution.axisScores) as Array<[string, number]>).map(([axis, score]) => ({
    axis: axis as 'IE' | 'SN' | 'TF' | 'JP',
    leaning: describeAxisLeaning(axis, score),
    confidence: round3(Math.min(1, Math.abs(score) / 1.5)),
    summary: `${axisLabelMap[axis]}에서 ${describeAxisLeaning(axis, score)} 신호가 반복되었습니다.`
  }))
  const evidenceHighlights = recentAnswers.slice(-4).map(item => ({
    question: item.text_ko,
    answer: item.answer === '그렇다' ? 'yes' as const : 'no' as const,
    interpretation: item.answer === '그렇다' ? '해당 성향을 직접 지지하는 응답입니다.' : '반대 선호를 확인하는 보정 응답입니다.',
    impact: `${item.targets.mbtiAxes.join('/')} 축 및 ${item.targets.enneagram.join(', ')} 성향 판별에 반영됨`
  }))

  return {
    sessionId: session.id,
    mbti: {
      top: topMbti,
      candidates: mbtiCandidates
    },
    enneagram: {
      top: wing,
      candidates: enneaCandidates
    },
    nickname_ko: `${quadraProfile.nickname}`,
    summaryShort,
    corePattern: quadraProfile.corePattern,
    outerVsInner,
    strengthContexts: mergedStrengthContexts,
    stressPattern: enneaProfile.stressPattern,
    misreadByOthers: enneaProfile.misreadByOthers,
    communicationTips: mergedCommunicationTips,
    whyThisType,
    mbtiCompetitionNote,
    enneaCompetitionNote,
    growthHint: quadraProfile.growthHint,
    decisionStyle: quadraProfile.decisionStyle,
    narrative_ko: quadraProfile.corePattern,
    misperception_ko: outerVsInner,
    short_caption_ko: clampCaption(`mindtrace 결과: ${topMbti} · ${wing}. ${summaryShort}`),
    deepInsights: {
      responsePatternSummary: '후반 응답에서도 초기 경향이 크게 흔들리지 않아 동일한 판단 프레임이 유지되었습니다.',
      axisNarratives,
      evidenceHighlights,
      confidenceCommentary: `응답 수 ${session.answers.length}개 기준으로 상위 후보 간 격차와 안정성을 함께 검토했습니다.`
    },
    style_tags: {
      quadra,
      tone: 'C'
    }
  }
}

const normalizeMbtiCandidates = (
  candidates: TypeCandidate<string>[],
  fallback: TypeCandidate<MbtiType>[]
): TypeCandidate<MbtiType>[] => {
  const filtered = candidates
    .filter(candidate => MBTI_TYPES.includes(candidate.type as MbtiType))
    .map(candidate => ({
      type: candidate.type as MbtiType,
      p: round3(Number(candidate.p) || 0)
    }))

  return (filtered.length > 0 ? filtered : fallback).slice(0, 3)
}

const normalizeEnneaCandidates = (
  candidates: TypeCandidate<string>[],
  fallback: TypeCandidate<string>[]
): TypeCandidate<string>[] => {
  const filtered = candidates
    .filter(candidate => /^(?:[1-9]|[1-9]w[1-9])$/.test(candidate.type))
    .map(candidate => ({
      type: candidate.type,
      p: round3(Number(candidate.p) || 0)
    }))

  return (filtered.length > 0 ? filtered : fallback).slice(0, 3)
}

export const finalizeWithModel = async (
  session: SessionState,
  options: InferenceRequestOptions = {}
): Promise<FinalReport> => {
  const fallback = fallbackReport(session)

  const promptData = {
    answerCount: session.answers.length,
    recentAnswers: summarizeRecentAnswers(session, 12),
    distribution: {
      axisScores: session.distribution.axisScores,
      axisEvidence: session.distribution.axisEvidence,
      conflicts: session.distribution.conflicts,
      summary: summarizeDistribution(session.distribution),
      topMbti: getTopCandidates(session.distribution.mbtiProbs16, 3),
      topEnneagram: getTopCandidates(session.distribution.enneagramProbs9, 3)
    },
    stopSnapshotsRecent: session.stopSnapshots.slice(-5)
  }

  const system = [
    '당신은 한국어 성향 해석 리포트를 작성하는 분석가입니다.',
    '출력 톤은 C(analysis 60 + counseling 40)이며 의료/진단 어투를 금지합니다.',
    '추상적인 칭찬(예: 창의적/똑똑함 반복) 대신 행동/판단/반응 패턴을 구체적으로 서술하세요.',
    '겉으로 보이는 모습과 내부 기준의 차이를 자연스럽게 설명하세요.',
    '경합 후보와 갈린 이유를 데이터 근거로 설명하세요.',
    '운세체/단정형 과장 문장은 금지합니다.',
    'JSON만 출력하세요.'
  ].join(' ')

  const user = [
    '다음 JSON 데이터를 바탕으로 최종 리포트를 작성하세요.',
    JSON.stringify(promptData),
    '작성 규칙:',
    '- summaryShort: 1~2문장',
    '- corePattern: 5~8문장',
    '- outerVsInner: 3~5문장 (겉/속 차이 설명)',
    '- strengthContexts: 3~5개',
    '- stressPattern: 3~5문장',
    '- misreadByOthers: 3~5문장',
    '- communicationTips: 3~5개',
    '- whyThisType: 4~6문장',
    '- mbtiCompetitionNote: 2~4문장',
    '- enneaCompetitionNote: 2~4문장',
    '- growthHint/decisionStyle: 각 2~4문장 (가능하면 제공)',
    '- short_caption_ko는 공유용으로 1~2문장으로 짧게 유지',
    '- mbti.candidates / enneagram.candidates 확률은 입력 분포와 크게 어긋나지 않게 작성',
    '- enneagram.top은 wing 형태(예: 5w6)로 작성',
    '- nickname_ko는 은유 기반이되 과장 없이 간결하게 작성',
    '- deepInsights.responsePatternSummary: 4~6문장',
    '- deepInsights.axisNarratives: 4개 축 모두 포함, confidence는 0~1',
    '- deepInsights.evidenceHighlights: 최근 답변 중 4~6개를 인용해서 질문/응답/해석/영향을 작성',
    '- deepInsights.confidenceCommentary: 3~5문장으로 신뢰도/한계/추가 확인 포인트 정리',
    '- hesitationReason/deferred/confidenceWeight가 있는 답변은 "판단 유보" 또는 "해석 난이도" 신호로 해석해 반영 강도를 구분'
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
      summaryShort: fallback.summaryShort,
      corePattern: fallback.corePattern,
      outerVsInner: fallback.outerVsInner,
      strengthContexts: fallback.strengthContexts,
      stressPattern: fallback.stressPattern,
      misreadByOthers: fallback.misreadByOthers,
      communicationTips: fallback.communicationTips,
      whyThisType: fallback.whyThisType,
      mbtiCompetitionNote: fallback.mbtiCompetitionNote,
      enneaCompetitionNote: fallback.enneaCompetitionNote,
      growthHint: fallback.growthHint,
      decisionStyle: fallback.decisionStyle,
      narrative_ko: fallback.narrative_ko,
      misperception_ko: fallback.misperception_ko,
      short_caption_ko: fallback.short_caption_ko,
      deepInsights: fallback.deepInsights,
      style_tags: fallback.style_tags
    })
  })

  const safeMbtiCandidates = normalizeMbtiCandidates(
    model.mbti?.candidates || [],
    fallback.mbti.candidates
  )
  const safeEnneaCandidates = normalizeEnneaCandidates(
    model.enneagram?.candidates || [],
    fallback.enneagram.candidates
  )

  const topEnneaType = model.enneagram?.top || safeEnneaCandidates[0]?.type || fallback.enneagram.top
  const normalizedTopEnnea = topEnneaType.includes('w')
    ? topEnneaType
    : deriveWingFromCandidates(topEnneaType, safeEnneaCandidates[1]?.type || '6')

  const safeSummaryShort = ensureText(model.summaryShort, fallback.summaryShort)
  const safeCorePattern = ensureText(model.corePattern, fallback.corePattern)
  const safeOuterVsInner = ensureOuterPrefix(ensureText(model.outerVsInner, fallback.outerVsInner))

  const safeStrengthContexts = ensureList(model.strengthContexts, fallback.strengthContexts, 3, 5)
  const safeCommunicationTips = ensureList(model.communicationTips, fallback.communicationTips, 3, 5)

  const safeStressPattern = ensureText(model.stressPattern, fallback.stressPattern)
  const safeMisread = ensureText(model.misreadByOthers, fallback.misreadByOthers)
  const safeWhy = ensureText(model.whyThisType, fallback.whyThisType)
  const safeMbtiCompetition = ensureText(model.mbtiCompetitionNote, fallback.mbtiCompetitionNote)
  const safeEnneaCompetition = ensureText(model.enneaCompetitionNote, fallback.enneaCompetitionNote)
  const safeGrowthHint = ensureText(model.growthHint, fallback.growthHint || '')
  const safeDecisionStyle = ensureText(model.decisionStyle, fallback.decisionStyle || '')

  const safeNarrative = ensureText(model.narrative_ko, safeCorePattern)
  const safeMisperception = ensureOuterPrefix(
    ensureText(model.misperception_ko, safeOuterVsInner)
  )
  const safeDeepInsights = model.deepInsights || fallback.deepInsights

  const safeCaption = clampCaption(
    ensureText(
      model.short_caption_ko,
      `mindtrace 결과: ${(safeMbtiCandidates[0]?.type || fallback.mbti.top)} · ${normalizedTopEnnea}. ${safeSummaryShort}`
    )
  )

  const resolvedMbtiTop = MBTI_TYPES.includes(model.mbti?.top as MbtiType)
    ? (model.mbti.top as MbtiType)
    : (safeMbtiCandidates[0]?.type || fallback.mbti.top)

  const resolvedQuadra = (model.style_tags?.quadra || fallback.style_tags.quadra) as QuadraType

  return {
    sessionId: session.id,
    mbti: {
      top: resolvedMbtiTop,
      candidates: safeMbtiCandidates
    },
    enneagram: {
      top: normalizedTopEnnea,
      candidates: safeEnneaCandidates
    },
    nickname_ko: ensureText(model.nickname_ko, fallback.nickname_ko),
    summaryShort: safeSummaryShort,
    corePattern: safeCorePattern,
    outerVsInner: safeOuterVsInner,
    strengthContexts: safeStrengthContexts,
    stressPattern: safeStressPattern,
    misreadByOthers: safeMisread,
    communicationTips: safeCommunicationTips,
    whyThisType: safeWhy,
    mbtiCompetitionNote: safeMbtiCompetition,
    enneaCompetitionNote: safeEnneaCompetition,
    growthHint: safeGrowthHint,
    decisionStyle: safeDecisionStyle,
    narrative_ko: safeNarrative,
    misperception_ko: safeMisperception,
    short_caption_ko: safeCaption,
    deepInsights: safeDeepInsights,
    style_tags: {
      quadra: ['NT', 'ST', 'NF', 'SF'].includes(resolvedQuadra)
        ? resolvedQuadra
        : fallback.style_tags.quadra,
      tone: 'C'
    }
  }
}

export const toPublicQuestion = (question: Question): PublicQuestion => sanitizeQuestionForClient(question)
