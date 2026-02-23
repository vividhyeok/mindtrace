export const MBTI_TYPES = [
  'ISTJ',
  'ISFJ',
  'INFJ',
  'INTJ',
  'ISTP',
  'ISFP',
  'INFP',
  'INTP',
  'ESTP',
  'ESFP',
  'ENFP',
  'ENTP',
  'ESTJ',
  'ESFJ',
  'ENFJ',
  'ENTJ'
] as const

export const ENNEAGRAM_TYPES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

export const MBTI_AXES = ['IE', 'SN', 'TF', 'JP'] as const

export type MbtiType = (typeof MBTI_TYPES)[number]
export type EnneagramType = (typeof ENNEAGRAM_TYPES)[number]
export type MbtiAxis = (typeof MBTI_AXES)[number]
export type YesNo = 'yes' | 'no'

export interface QuestionTargets {
  mbtiAxes: MbtiAxis[]
  enneagram: EnneagramType[]
}

export interface QuestionScoring {
  mbti?: Partial<Record<MbtiAxis, number>>
  enneagram?: Partial<Record<EnneagramType, number>>
}

export interface Question {
  id: string
  text_ko: string
  targets: QuestionTargets
  rationale_short: string
  scoring?: QuestionScoring
}

export interface PublicQuestion {
  id: string
  text_ko: string
  targets: QuestionTargets
  rationale_short: string
}

export interface AxisEvidence {
  positive: number
  negative: number
}

export interface DistributionState {
  axisScores: Record<MbtiAxis, number>
  axisEvidence: Record<MbtiAxis, AxisEvidence>
  mbtiProbs16: Record<MbtiType, number>
  enneagramScores: Record<EnneagramType, number>
  enneagramProbs9: Record<EnneagramType, number>
  conflicts: string[]
}

export interface AnswerRecord {
  questionId: string
  answer: YesNo
  answeredAt: string
  targets: QuestionTargets
}

export interface TypeCandidate<T extends string = string> {
  type: T
  p: number
}

export interface FinalReport {
  sessionId: string
  mbti: {
    top: MbtiType
    candidates: TypeCandidate<MbtiType>[]
  }
  enneagram: {
    top: string
    candidates: TypeCandidate<string>[]
  }
  nickname_ko: string
  narrative_ko: string
  misperception_ko: string
  short_caption_ko: string
  style_tags: {
    quadra: 'NT' | 'ST' | 'NF' | 'SF'
    tone: 'C'
  }
}

export interface SessionState {
  id: string
  token: string
  createdAt: number
  expiresAt: number
  lastUpdatedAt: number
  done: boolean
  finalized: boolean
  questionHistory: Question[]
  answers: AnswerRecord[]
  distribution: DistributionState
  report?: FinalReport
}

export interface StartResponse {
  sessionId: string
  firstQuestion: PublicQuestion
  maxQuestions: number
}

export interface AnswerResponse {
  done: boolean
  nextQuestion?: PublicQuestion
  progress: {
    current: number
    max: number
    ratio: number
  }
  distributionsSummary?: {
    mbtiTop3: TypeCandidate<MbtiType>[]
    enneagramTop2: TypeCandidate<string>[]
    conflicts: string[]
  }
}

export interface UpdateModelOutput {
  mbtiProbs16: Record<MbtiType, number>
  enneagramProbs9: Record<EnneagramType, number>
  conflicts: string[]
}

export interface FinalizeModelOutput {
  mbti: {
    top: MbtiType
    candidates: TypeCandidate<MbtiType>[]
  }
  enneagram: {
    top: string
    candidates: TypeCandidate<string>[]
  }
  nickname_ko: string
  narrative_ko: string
  misperception_ko: string
  short_caption_ko: string
  style_tags: {
    quadra: 'NT' | 'ST' | 'NF' | 'SF'
    tone: 'C'
  }
}
