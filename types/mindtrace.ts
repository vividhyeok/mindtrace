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

export const AUTH_REASON_CODES = [
  'AUTH_TOKEN_MISSING',
  'AUTH_TOKEN_INVALID',
  'AUTH_TOKEN_EXPIRED'
] as const

export const SESSION_REASON_CODES = [
  'SESSION_NOT_FOUND',
  'SESSION_EXPIRED',
  'SESSION_TOKEN_MISMATCH',
  'SESSION_ALREADY_FINALIZED'
] as const

export type AuthReasonCode = (typeof AUTH_REASON_CODES)[number]
export type SessionReasonCode = (typeof SESSION_REASON_CODES)[number]
export type ApiReasonCode = AuthReasonCode | SessionReasonCode

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

export interface StopSnapshot {
  mbtiTop: MbtiType
  mbtiTopProb: number
  mbtiGap: number
  enneaTop: string
  enneaTopProb: number
  enneaGap: number
}

export interface StopCheckDecision {
  done: boolean
  reason: 'early_stop' | 'cap' | 'continue'
  detail:
    | 'min_questions'
    | 'unstable'
    | 'low_confidence'
    | 'conflict_high'
    | 'max_cap'
    | 'threshold_met'
  snapshot: StopSnapshot
  metrics: {
    answerCount: number
    minQuestions: number
    maxQuestions: number
    mbtiTop1: number
    mbtiGap: number
    enneaTop1: number
    enneaGap: number
    conflictCount: number
    stabilityScore: number
  }
}

export interface PrefetchBranch {
  answer: YesNo
  done: boolean
  reason: 'early_stop' | 'cap' | 'continue'
  detail: string
  nextQuestion?: Question
  distribution: DistributionState
  summary: {
    mbtiTop3: TypeCandidate<MbtiType>[]
    enneagramTop2: TypeCandidate<string>[]
    conflicts: string[]
  }
  snapshot: StopSnapshot
  latencyMs: number
  modelCalibration: {
    attempted: boolean
    applied: boolean
  }
  questionGeneration?: {
    usedModel: boolean
    retryCount: number
    usedFallback: boolean
  }
}

export interface PrefetchEntry {
  questionId: string
  baseAnswerCount: number
  createdAt: number
  inFlight: boolean
  completedAt?: number
  branches: Partial<Record<YesNo, PrefetchBranch>>
  errors: Partial<Record<YesNo, string>>
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
  stopSnapshots: StopSnapshot[]
  prefetchByQuestionId: Record<string, PrefetchEntry>
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
