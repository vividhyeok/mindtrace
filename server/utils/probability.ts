import {
  ENNEAGRAM_TYPES,
  MBTI_AXES,
  MBTI_TYPES,
  type DistributionState,
  type EnneagramType,
  type MbtiAxis,
  type MbtiType,
  type Question,
  type QuestionPhase,
  type StopCheckDecision,
  type StopSnapshot,
  type TypeCandidate,
  type UpdateModelOutput,
  type YesNo
} from '~/types/mindtrace'
import { AXIS_LETTERS, EARLY_STOP } from '~/server/utils/constants'

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

const normalizeRecord = <T extends string>(record: Record<T, number>): Record<T, number> => {
  const total = Object.values(record).reduce((sum, current) => sum + Math.max(0, current), 0)
  const fallback = 1 / Object.keys(record).length
  const entries = Object.entries(record) as Array<[T, number]>

  if (!Number.isFinite(total) || total <= 0) {
    return Object.fromEntries(entries.map(([key]) => [key, fallback])) as Record<T, number>
  }

  return Object.fromEntries(entries.map(([key, value]) => [key, Math.max(0, value) / total])) as Record<T, number>
}

const softmax = <T extends string>(scores: Record<T, number>): Record<T, number> => {
  const entries = Object.entries(scores) as Array<[T, number]>
  const max = Math.max(...entries.map(([, value]) => value))
  const exp = entries.map(([key, value]) => [key, Math.exp(value - max)] as const)
  const sum = exp.reduce((acc, [, value]) => acc + value, 0)
  if (!Number.isFinite(sum) || sum <= 0) {
    return normalizeRecord(scores)
  }
  return Object.fromEntries(exp.map(([key, value]) => [key, value / sum])) as Record<T, number>
}

export const makeUniformMbti = (): Record<MbtiType, number> => {
  const value = 1 / MBTI_TYPES.length
  return Object.fromEntries(MBTI_TYPES.map(type => [type, value])) as Record<MbtiType, number>
}

export const makeUniformEnnea = (): Record<EnneagramType, number> => {
  const value = 1 / ENNEAGRAM_TYPES.length
  return Object.fromEntries(ENNEAGRAM_TYPES.map(type => [type, value])) as Record<EnneagramType, number>
}

export const initDistribution = (): DistributionState => ({
  axisScores: {
    IE: 0,
    SN: 0,
    TF: 0,
    JP: 0
  },
  axisEvidence: {
    IE: { positive: 0, negative: 0 },
    SN: { positive: 0, negative: 0 },
    TF: { positive: 0, negative: 0 },
    JP: { positive: 0, negative: 0 }
  },
  mbtiProbs16: makeUniformMbti(),
  enneagramScores: {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
    '6': 0,
    '7': 0,
    '8': 0,
    '9': 0
  },
  enneagramProbs9: makeUniformEnnea(),
  conflicts: []
})

const mbtiFromAxisScores = (axisScores: Record<MbtiAxis, number>): Record<MbtiType, number> => {
  const letterProbByAxis = Object.fromEntries(
    MBTI_AXES.map((axis) => {
      const probabilityForFirstLetter = sigmoid(axisScores[axis])
      return [axis, probabilityForFirstLetter]
    })
  ) as Record<MbtiAxis, number>

  const raw: Record<MbtiType, number> = {} as Record<MbtiType, number>

  for (const type of MBTI_TYPES) {
    const iOrE = type[0]
    const sOrN = type[1]
    const tOrF = type[2]
    const jOrP = type[3]

    const pIE = iOrE === AXIS_LETTERS.IE[0] ? letterProbByAxis.IE : 1 - letterProbByAxis.IE
    const pSN = sOrN === AXIS_LETTERS.SN[0] ? letterProbByAxis.SN : 1 - letterProbByAxis.SN
    const pTF = tOrF === AXIS_LETTERS.TF[0] ? letterProbByAxis.TF : 1 - letterProbByAxis.TF
    const pJP = jOrP === AXIS_LETTERS.JP[0] ? letterProbByAxis.JP : 1 - letterProbByAxis.JP

    raw[type] = pIE * pSN * pTF * pJP
  }

  return normalizeRecord(raw)
}

const detectConflicts = (distribution: DistributionState): string[] => {
  const conflictMessages: string[] = []

  for (const axis of MBTI_AXES) {
    const evidence = distribution.axisEvidence[axis]
    if (evidence.positive >= 2 && evidence.negative >= 2) {
      conflictMessages.push(`${axis} 축에서 상반된 신호가 반복됨`)
    }
  }

  const tf = distribution.axisScores.TF
  if (Math.abs(tf) < 0.25 && distribution.axisEvidence.TF.positive + distribution.axisEvidence.TF.negative >= 4) {
    conflictMessages.push('사고/감정(T/F) 판단 기준이 상황에 따라 교차함')
  }

  const topEnnea = getTopCandidates(distribution.enneagramProbs9, 2)
  if (topEnnea.length >= 2 && topEnnea[0].p - topEnnea[1].p < 0.04) {
    conflictMessages.push('Enneagram 상위 후보 간 간격이 매우 좁음')
  }

  return Array.from(new Set(conflictMessages))
}

export const getTopCandidates = <T extends string>(
  probs: Record<T, number>,
  count: number
): TypeCandidate<T>[] => {
  return (Object.entries(probs) as Array<[T, number]>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([type, p]) => ({ type, p }))
}

const toFallbackDelta = (question: Question, answer: YesNo) => {
  const signed = answer === 'yes' ? 1 : -1
  const mbtiDelta: Partial<Record<MbtiAxis, number>> = {}
  const enneaDelta: Partial<Record<EnneagramType, number>> = {}

  const mbtiWeight = question.scoring?.mbti || {}
  const enneaWeight = question.scoring?.enneagram || {}

  for (const axis of Object.keys(mbtiWeight) as MbtiAxis[]) {
    mbtiDelta[axis] = (mbtiWeight[axis] || 0) * signed
  }

  for (const type of Object.keys(enneaWeight) as EnneagramType[]) {
    enneaDelta[type] = (enneaWeight[type] || 0) * signed
  }

  return { mbtiDelta, enneaDelta }
}

const resolveAnswerDelta = (question: Question, answer: YesNo) => {
  if (question.transitions?.[answer]) {
    return {
      mbtiDelta: question.transitions[answer].mbti || {},
      enneaDelta: question.transitions[answer].enneagram || {}
    }
  }
  return toFallbackDelta(question, answer)
}

export const applyAnswerToDistribution = (
  distribution: DistributionState,
  question: Question,
  answer: YesNo,
  confidenceWeight = 1
): DistributionState => {
  const safeWeight = Math.max(0, Math.min(1, confidenceWeight || 0))
  const { mbtiDelta, enneaDelta } = resolveAnswerDelta(question, answer)

  for (const axis of Object.keys(mbtiDelta) as MbtiAxis[]) {
    const delta = Number(mbtiDelta[axis] || 0) * safeWeight
    distribution.axisScores[axis] += delta

    if (delta > 0) {
      distribution.axisEvidence[axis].positive += 1
    }
    else if (delta < 0) {
      distribution.axisEvidence[axis].negative += 1
    }
  }

  for (const ennea of Object.keys(enneaDelta) as EnneagramType[]) {
    const delta = Number(enneaDelta[ennea] || 0) * safeWeight
    distribution.enneagramScores[ennea] += delta
  }

  distribution.mbtiProbs16 = mbtiFromAxisScores(distribution.axisScores)
  distribution.enneagramProbs9 = softmax(distribution.enneagramScores)
  distribution.conflicts = detectConflicts(distribution)

  return distribution
}

const sanitizedMbti = (incoming: Partial<Record<MbtiType, number>>): Record<MbtiType, number> => {
  const merged = Object.fromEntries(MBTI_TYPES.map(type => [type, Number(incoming[type] || 0)])) as Record<MbtiType, number>
  return normalizeRecord(merged)
}

const sanitizedEnnea = (incoming: Partial<Record<EnneagramType, number>>): Record<EnneagramType, number> => {
  const merged = Object.fromEntries(
    ENNEAGRAM_TYPES.map(type => [type, Number(incoming[type] || 0)])
  ) as Record<EnneagramType, number>
  return normalizeRecord(merged)
}

export const blendWithModelUpdate = (
  distribution: DistributionState,
  modelUpdate: UpdateModelOutput | null,
  modelWeight = 0.3
): DistributionState => {
  if (!modelUpdate) {
    return distribution
  }

  const safeModelMbti = sanitizedMbti(modelUpdate.mbtiProbs16)
  const safeModelEnnea = sanitizedEnnea(modelUpdate.enneagramProbs9)

  const blendedMbti: Record<MbtiType, number> = {} as Record<MbtiType, number>
  const blendedEnnea: Record<EnneagramType, number> = {} as Record<EnneagramType, number>

  for (const type of MBTI_TYPES) {
    blendedMbti[type] =
      distribution.mbtiProbs16[type] * (1 - modelWeight) + safeModelMbti[type] * modelWeight
  }

  for (const type of ENNEAGRAM_TYPES) {
    blendedEnnea[type] =
      distribution.enneagramProbs9[type] * (1 - modelWeight) + safeModelEnnea[type] * modelWeight
  }

  distribution.mbtiProbs16 = normalizeRecord(blendedMbti)
  distribution.enneagramProbs9 = normalizeRecord(blendedEnnea)
  distribution.conflicts = Array.from(new Set([...distribution.conflicts, ...(modelUpdate.conflicts || [])]))

  return distribution
}

const variation = (values: number[]) => {
  if (values.length === 0) return 0
  return Math.max(...values) - Math.min(...values)
}

const buildStopSnapshot = (distribution: DistributionState): StopSnapshot => {
  const [mbtiTop1, mbtiTop2] = getTopCandidates(distribution.mbtiProbs16, 2)
  const [enneaTop1, enneaTop2] = getTopCandidates(distribution.enneagramProbs9, 2)

  return {
    mbtiTop: (mbtiTop1?.type || 'INFP') as MbtiType,
    mbtiTopProb: mbtiTop1?.p || 0,
    mbtiGap: Math.max(0, (mbtiTop1?.p || 0) - (mbtiTop2?.p || 0)),
    enneaTop: enneaTop1?.type || '5',
    enneaTopProb: enneaTop1?.p || 0,
    enneaGap: Math.max(0, (enneaTop1?.p || 0) - (enneaTop2?.p || 0))
  }
}

const computeStabilityScore = (snapshots: StopSnapshot[]): number => {
  const recent = snapshots.slice(-3)
  if (recent.length < 3) return 0

  const sameMbtiTop = recent.every(snapshot => snapshot.mbtiTop === recent[0].mbtiTop)
  const sameEnneaTop = recent.every(snapshot => snapshot.enneaTop === recent[0].enneaTop)
  const mbtiProbStable = variation(recent.map(snapshot => snapshot.mbtiTopProb)) <= 0.05
  const enneaProbStable = variation(recent.map(snapshot => snapshot.enneaTopProb)) <= 0.055
  const mbtiGapStable = variation(recent.map(snapshot => snapshot.mbtiGap)) <= 0.055
  const enneaGapStable = variation(recent.map(snapshot => snapshot.enneaGap)) <= 0.055

  const checks = [
    sameMbtiTop,
    sameEnneaTop,
    mbtiProbStable,
    enneaProbStable,
    mbtiGapStable,
    enneaGapStable
  ]

  return checks.filter(Boolean).length / checks.length
}

interface StopRuntimeOptions {
  phase?: QuestionPhase
  validationCount?: number
  requiredValidationCount?: number
}

export const shouldStop = (
  distribution: DistributionState,
  answerCount: number,
  minQuestions: number,
  maxQuestions: number,
  previousSnapshots: StopSnapshot[],
  options: StopRuntimeOptions = {}
): StopCheckDecision => {
  const snapshot = buildStopSnapshot(distribution)
  const composedSnapshots = [...previousSnapshots, snapshot]
  const stabilityScore = computeStabilityScore(composedSnapshots)
  const conflictCount = distribution.conflicts.length
  const validationCount = options.validationCount || 0
  const requiredValidationCount = options.requiredValidationCount || 0

  const metrics = {
    answerCount,
    minQuestions,
    maxQuestions,
    mbtiTop1: snapshot.mbtiTopProb,
    mbtiGap: snapshot.mbtiGap,
    enneaTop1: snapshot.enneaTopProb,
    enneaGap: snapshot.enneaGap,
    conflictCount,
    stabilityScore,
    phase: options.phase,
    validationCount,
    requiredValidationCount
  }

  if (answerCount >= maxQuestions) {
    return {
      done: true,
      reason: 'cap',
      detail: 'max_cap',
      snapshot,
      metrics
    }
  }

  if (answerCount < minQuestions) {
    return {
      done: false,
      reason: 'continue',
      detail: 'min_questions',
      snapshot,
      metrics
    }
  }

  if (options.phase && options.phase !== 'C') {
    return {
      done: false,
      reason: 'continue',
      detail: 'phase_not_ready',
      snapshot,
      metrics
    }
  }

  if (requiredValidationCount > 0 && validationCount < requiredValidationCount) {
    return {
      done: false,
      reason: 'continue',
      detail: 'validation_incomplete',
      snapshot,
      metrics
    }
  }

  const mbtiConfident =
    snapshot.mbtiTopProb >= EARLY_STOP.mbtiTop1
    && snapshot.mbtiGap >= EARLY_STOP.mbtiGap
  const enneaConfident =
    snapshot.enneaTopProb >= EARLY_STOP.enneaTop1
    && snapshot.enneaGap >= EARLY_STOP.enneaGap

  if (!mbtiConfident || !enneaConfident) {
    return {
      done: false,
      reason: 'continue',
      detail: 'low_confidence',
      snapshot,
      metrics
    }
  }

  if (conflictCount > 1) {
    return {
      done: false,
      reason: 'continue',
      detail: 'conflict_high',
      snapshot,
      metrics
    }
  }

  if (stabilityScore < 0.58) {
    return {
      done: false,
      reason: 'continue',
      detail: 'unstable',
      snapshot,
      metrics
    }
  }

  return {
    done: true,
    reason: 'early_stop',
    detail: 'threshold_met',
    snapshot,
    metrics
  }
}

export const summarizeDistribution = (distribution: DistributionState) => {
  return {
    mbtiTop3: getTopCandidates(distribution.mbtiProbs16, 3),
    enneagramTop2: getTopCandidates(distribution.enneagramProbs9, 2),
    conflicts: distribution.conflicts
  }
}

export const getMostUncertainAxis = (distribution: DistributionState): MbtiAxis => {
  const axisPairs = MBTI_AXES.map(axis => ({ axis, value: Math.abs(distribution.axisScores[axis]) }))
  axisPairs.sort((a, b) => a.value - b.value)
  return axisPairs[0]?.axis || 'IE'
}

const isAdjacentEnnea = (a: number, b: number) => {
  return Math.abs(a - b) === 1 || Math.abs(a - b) === 8
}

export const deriveWingFromCandidates = (topType: string, secondType: string): string => {
  const top = Number(topType)
  const second = Number(secondType)

  if (!Number.isFinite(top) || !Number.isFinite(second)) {
    return `${topType}w${topType}`
  }

  if (isAdjacentEnnea(top, second)) {
    return `${top}w${second}`
  }

  const left = top === 1 ? 9 : top - 1
  const right = top === 9 ? 1 : top + 1
  const wing = Math.abs(second - left) <= Math.abs(second - right) ? left : right
  return `${top}w${wing}`
}

export const deriveQuadra = (mbti: string): 'NT' | 'ST' | 'NF' | 'SF' => {
  const second = mbti[1]
  const third = mbti[2]

  if (second === 'N' && third === 'T') return 'NT'
  if (second === 'S' && third === 'T') return 'ST'
  if (second === 'N' && third === 'F') return 'NF'
  return 'SF'
}
