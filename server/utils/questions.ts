import { randomUUID } from 'node:crypto'
import type { DistributionState, MbtiAxis, Question, SessionState } from '~/types/mindtrace'
import { BASE_CURATED_QUESTION_COUNT } from '~/server/utils/constants'
import { getMostUncertainAxis, getTopCandidates } from '~/server/utils/probability'

const curatedQuestions: Question[] = [
  {
    id: 'q_seed_01',
    text_ko: '처음 만난 모임에서는 말을 늘리기보다 먼저 분위기를 살핀다.',
    targets: { mbtiAxes: ['IE'], enneagram: ['4', '5', '9'] },
    rationale_short: 'I/E 에너지 방향 확인',
    scoring: { mbti: { IE: 1.05 }, enneagram: { '4': 0.3, '5': 0.35, '9': 0.25 } }
  },
  {
    id: 'q_seed_02',
    text_ko: '일정이 갑자기 바뀌어도 원래 계획을 지키려는 편이다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['1', '6'] },
    rationale_short: 'J/P 계획 고정성 확인',
    scoring: { mbti: { JP: 1.1 }, enneagram: { '1': 0.35, '6': 0.25 } }
  },
  {
    id: 'q_seed_03',
    text_ko: '설명할 때 사례보다 원리부터 말하는 편이다.',
    targets: { mbtiAxes: ['SN'], enneagram: ['5'] },
    rationale_short: 'S/N 정보 처리 우선순위 확인',
    scoring: { mbti: { SN: -1.05 }, enneagram: { '5': 0.35 } }
  },
  {
    id: 'q_seed_04',
    text_ko: '의견 충돌이 생기면 감정보다 기준 정리부터 하는 편이다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['1', '3', '8'] },
    rationale_short: 'T/F 판단 기준 확인',
    scoring: { mbti: { TF: 1.1 }, enneagram: { '1': 0.25, '3': 0.25, '8': 0.2 } }
  },
  {
    id: 'q_seed_05',
    text_ko: '역할이 모호하면 바로 기준표를 만들어 정리하는 편이다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['1', '6'] },
    rationale_short: '구조화 습관 확인',
    scoring: { mbti: { JP: 0.95 }, enneagram: { '1': 0.3, '6': 0.35 } }
  },
  {
    id: 'q_seed_06',
    text_ko: '새 아이디어를 들으면 적용법보다 가능성부터 떠오른다.',
    targets: { mbtiAxes: ['SN'], enneagram: ['7', '4'] },
    rationale_short: '추상적 가능성 탐색 경향 확인',
    scoring: { mbti: { SN: -0.95 }, enneagram: { '7': 0.35, '4': 0.3 } }
  }
]

const axisFallback: Record<MbtiAxis, Omit<Question, 'id'>> = {
  IE: {
    text_ko: '휴일이 생기면 약속보다 혼자 쉬는 시간을 먼저 잡는다.',
    targets: { mbtiAxes: ['IE'], enneagram: ['5', '9'] },
    rationale_short: '사회 에너지 회복 습관 확인',
    scoring: { mbti: { IE: 0.95 }, enneagram: { '5': 0.25, '9': 0.2 } }
  },
  SN: {
    text_ko: '결정을 할 때 지금 정보보다 큰 흐름부터 보는 편이다.',
    targets: { mbtiAxes: ['SN'], enneagram: ['5', '7'] },
    rationale_short: '구체 정보 vs 패턴 우선순위 확인',
    scoring: { mbti: { SN: -1.0 }, enneagram: { '5': 0.2, '7': 0.2 } }
  },
  TF: {
    text_ko: '의견 충돌 때 관계보다 논리 일관성을 먼저 지키는 편이다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['1', '8'] },
    rationale_short: '판단 기준 우선순위 확인',
    scoring: { mbti: { TF: 1.0 }, enneagram: { '1': 0.2, '8': 0.3 } }
  },
  JP: {
    text_ko: '진행 중에 새 아이디어가 떠오르면 계획보다 바로 실험하는 편이다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['7', '3'] },
    rationale_short: '계획 고정성 vs 즉시 실험 성향 확인',
    scoring: { mbti: { JP: -1.0 }, enneagram: { '7': 0.35, '3': 0.25 } }
  }
}

const enneagramFallbackQuestions: Record<string, Omit<Question, 'id'>> = {
  '1': {
    text_ko: '작은 실수도 기준에서 벗어나면 오래 신경 쓰는 편이다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['1'] },
    rationale_short: '완결성/올바름 동기 확인',
    scoring: { mbti: { JP: 0.4 }, enneagram: { '1': 0.55 } }
  },
  '2': {
    text_ko: '내 일정이 밀려도 부탁을 받으면 먼저 응답하는 편이다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['2'] },
    rationale_short: '관계 기여 동기 확인',
    scoring: { mbti: { TF: -0.4 }, enneagram: { '2': 0.55 } }
  },
  '3': {
    text_ko: '성과가 눈에 보이지 않으면 쉬는 시간에도 마음이 급해진다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['3'] },
    rationale_short: '성취 중심 드라이브 확인',
    scoring: { mbti: { JP: 0.3 }, enneagram: { '3': 0.55 } }
  },
  '4': {
    text_ko: '무난한 선택보다 내 취향이 분명한 선택이 더 편하다.',
    targets: { mbtiAxes: ['SN'], enneagram: ['4'] },
    rationale_short: '정체성 고유성 동기 확인',
    scoring: { mbti: { SN: -0.35 }, enneagram: { '4': 0.55 } }
  },
  '5': {
    text_ko: '바빠도 정보를 충분히 파악해야 움직일 수 있는 편이다.',
    targets: { mbtiAxes: ['SN'], enneagram: ['5'] },
    rationale_short: '인지적 준비 욕구 확인',
    scoring: { mbti: { SN: -0.35 }, enneagram: { '5': 0.55 } }
  },
  '6': {
    text_ko: '결정을 내릴 때 최악의 변수부터 점검해야 마음이 놓인다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['6'] },
    rationale_short: '리스크 대비 성향 확인',
    scoring: { mbti: { JP: 0.25 }, enneagram: { '6': 0.55 } }
  },
  '7': {
    text_ko: '일이 막히면 한 가지를 밀기보다 새 선택지를 바로 찾는다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['7'] },
    rationale_short: '확장/회피 패턴 확인',
    scoring: { mbti: { JP: -0.4 }, enneagram: { '7': 0.55 } }
  },
  '8': {
    text_ko: '중요한 장면에서는 분위기보다 주도권을 직접 잡는 편이다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['8'] },
    rationale_short: '통제/주도 동기 확인',
    scoring: { mbti: { TF: 0.45 }, enneagram: { '8': 0.55 } }
  },
  '9': {
    text_ko: '갈등 조짐이 보이면 내 주장보다 분위기 안정부터 챙긴다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['9'] },
    rationale_short: '갈등 완충 경향 확인',
    scoring: { mbti: { TF: -0.35 }, enneagram: { '9': 0.55 } }
  }
}

const curatedFallbackPool: Array<Omit<Question, 'id'>> = [
  {
    text_ko: '여행 계획을 세울 때 동선부터 먼저 확정하는 편이다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['1', '6'] },
    rationale_short: '계획 선호를 안정적으로 재확인',
    scoring: { mbti: { JP: 0.9 }, enneagram: { '1': 0.25, '6': 0.3 } }
  },
  {
    text_ko: '예상 못 한 변경이 생기면 바로 대안을 찾는 편이다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['7', '3'] },
    rationale_short: '유연 대응 vs 계획 고정성 확인',
    scoring: { mbti: { JP: -0.85 }, enneagram: { '7': 0.35, '3': 0.2 } }
  },
  {
    text_ko: '처음 만난 사람과도 대화를 먼저 시작하는 편이다.',
    targets: { mbtiAxes: ['IE'], enneagram: ['3', '7'] },
    rationale_short: '외향적 에너지 발산 확인',
    scoring: { mbti: { IE: -0.9 }, enneagram: { '3': 0.2, '7': 0.25 } }
  },
  {
    text_ko: '의견이 다를 때 감정보다 근거 정리부터 하는 편이다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['1', '8'] },
    rationale_short: '판단 기준 우선순위 재확인',
    scoring: { mbti: { TF: 0.95 }, enneagram: { '1': 0.2, '8': 0.25 } }
  },
  {
    text_ko: '새 아이디어를 들으면 실제 적용 장면이 먼저 떠오른다.',
    targets: { mbtiAxes: ['SN'], enneagram: ['3', '6'] },
    rationale_short: '구체 적용 중심 성향 확인',
    scoring: { mbti: { SN: 0.85 }, enneagram: { '3': 0.2, '6': 0.2 } }
  },
  {
    text_ko: '업무가 몰려도 정보가 충분해야 시작할 수 있는 편이다.',
    targets: { mbtiAxes: ['SN'], enneagram: ['5'] },
    rationale_short: '인지적 준비 욕구와 내향성 확인',
    scoring: { mbti: { SN: -0.45 }, enneagram: { '5': 0.45 } }
  },
  {
    text_ko: '팀 분위기가 흔들리면 갈등을 줄이는 선택을 먼저 한다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['9', '2'] },
    rationale_short: '관계 안정 우선 경향 확인',
    scoring: { mbti: { TF: -0.8 }, enneagram: { '9': 0.4, '2': 0.2 } }
  },
  {
    text_ko: '지시가 모호해도 기준을 정하면 끝까지 밀어붙이는 편이다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['8', '3'] },
    rationale_short: '주도적 실행 성향 확인',
    scoring: { mbti: { JP: 0.7 }, enneagram: { '8': 0.35, '3': 0.2 } }
  }
]

const incongruenceFollowupPool: Array<Omit<Question, 'id'>> = [
  {
    text_ko: '겉으로 공감 표현을 해도 실제 판단은 해결 순서로 정리되는 편이다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['1', '3', '5'] },
    rationale_short: '표현과 판단 기준 불일치 확인',
    scoring: { mbti: { TF: 0.8 }, enneagram: { '1': 0.2, '3': 0.15, '5': 0.15 } }
  },
  {
    text_ko: '상대에게 맞춰 말해도 속으로는 기준의 타당성을 먼저 따지는 편이다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['1', '6'] },
    rationale_short: '관계 배려 표현과 내부 판단 분리 확인',
    scoring: { mbti: { TF: 0.75 }, enneagram: { '1': 0.2, '6': 0.15 } }
  },
  {
    text_ko: '겉으로는 유연하게 보여도 실제 선택은 익숙한 방식으로 돌아오는 편이다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['6', '9'] },
    rationale_short: '표면 유연성 vs 실제 선택 고정성 확인',
    scoring: { mbti: { JP: 0.75 }, enneagram: { '6': 0.2, '9': 0.2 } }
  },
  {
    text_ko: '밝게 반응해도 속으로는 혼자 정리할 시간이 꼭 필요한 편이다.',
    targets: { mbtiAxes: ['IE'], enneagram: ['5', '9'] },
    rationale_short: '외부 표현과 에너지 회복 방식 불일치 확인',
    scoring: { mbti: { IE: 0.75 }, enneagram: { '5': 0.2, '9': 0.2 } }
  }
]

const makeAutoId = () => `q_auto_${randomUUID().slice(0, 8)}`

export const getCuratedQuestionByIndex = (index: number): Question | null => {
  if (index < 0 || index >= curatedQuestions.length) {
    return null
  }

  return structuredClone(curatedQuestions[index])
}

export const sanitizeQuestionForClient = (question: Question) => ({
  id: question.id,
  text_ko: question.text_ko,
  targets: question.targets,
  rationale_short: question.rationale_short
})

const usedQuestionIds = (session: SessionState) => new Set(session.questionHistory.map(q => q.id))

export const ensureQuestionScoring = (question: Question): Question => {
  const safeQuestion = structuredClone(question)
  safeQuestion.scoring ||= {}
  safeQuestion.scoring.mbti ||= {}
  safeQuestion.scoring.enneagram ||= {}

  for (const axis of safeQuestion.targets.mbtiAxes) {
    if (safeQuestion.scoring.mbti[axis] === undefined) {
      safeQuestion.scoring.mbti[axis] = axis === 'SN' ? -0.85 : 0.85
    }
  }

  for (const enneagramType of safeQuestion.targets.enneagram) {
    if (safeQuestion.scoring.enneagram[enneagramType] === undefined) {
      safeQuestion.scoring.enneagram[enneagramType] = 0.3
    }
  }

  return safeQuestion
}

const makeAxisQuestion = (axis: MbtiAxis): Question => {
  const template = axisFallback[axis]
  return {
    ...structuredClone(template),
    id: makeAutoId()
  }
}

const makeEnneaQuestion = (type: string): Question => {
  const template = enneagramFallbackQuestions[type] || enneagramFallbackQuestions['5']
  return {
    ...structuredClone(template),
    id: makeAutoId()
  }
}

const findConflictAxis = (distribution: DistributionState): MbtiAxis | null => {
  for (const conflict of distribution.conflicts) {
    if (conflict.includes('IE')) return 'IE'
    if (conflict.includes('SN')) return 'SN'
    if (conflict.includes('TF')) return 'TF'
    if (conflict.includes('JP')) return 'JP'
  }
  return null
}

export const shouldUseIncongruenceFollowup = (session: SessionState) => {
  const tfEvidence = session.distribution.axisEvidence.TF
  const tfMixed = tfEvidence.positive >= 2 && tfEvidence.negative >= 2
  return session.distribution.conflicts.length > 0 || tfMixed
}

export const buildDeterministicAdaptiveQuestion = (session: SessionState): Question => {
  const usedIds = usedQuestionIds(session)
  const conflictAxis = findConflictAxis(session.distribution)

  let candidate: Question
  if (conflictAxis && shouldUseIncongruenceFollowup(session)) {
    candidate = getCuratedFallbackQuestion(session, { allowIncongruence: true })
  }
  else if (conflictAxis) {
    candidate = makeAxisQuestion(conflictAxis)
  }
  else if (session.answers.length % 2 === 0) {
    candidate = makeAxisQuestion(getMostUncertainAxis(session.distribution))
  }
  else {
    const topEnnea = getTopCandidates(session.distribution.enneagramProbs9, 1)[0]
    candidate = makeEnneaQuestion(topEnnea?.type || '5')
  }

  while (usedIds.has(candidate.id)) {
    candidate.id = makeAutoId()
  }

  return ensureQuestionScoring(candidate)
}

export const curatedQuestionCount = () => BASE_CURATED_QUESTION_COUNT

const FORBIDDEN_EXPRESSIONS = ['보통', '가끔', '대체로', '상황에 따라', '사람마다', '케바케', '종종', '때때로']
const ABSTRACT_PATTERNS = [
  /성격이란/,
  /정의/,
  /본질/,
  /의미는?/,
  /일반적으로/,
  /보편적으로/,
  /누구나/,
  /모든 사람/
]
const INTERROGATIVE_PATTERNS = [/왜/, /무엇/, /어떻게/, /언제/, /어디/, /누구/, /몇/]
const AMBIGUOUS_CONTEXT_PATTERNS = [/갈등 회의/, /중요한 상황/, /복잡한 상황/, /민감한 상황/, /어떤 상황/]
const SOCIAL_DESIRABILITY_PATTERNS = [
  /반드시/,
  /당연히/,
  /무조건/,
  /올바른/,
  /옳은/,
  /착한/,
  /예의/,
  /도와야/,
  /배려해야/
]
const COMPARISON_MARKERS = ['보다', '대신', '하지만', '반면', '동시에', '한편', '면서도']
const SCENARIO_MARKERS = [
  '하면',
  '할 때',
  '해도',
  '보여도',
  '때도',
  '때',
  '상황',
  '모임',
  '약속',
  '프로젝트',
  '과제',
  '갈등',
  '결정',
  '휴일',
  '팀',
  '친구',
  '일정'
]
const ACTION_PATTERN = /(한다|하는|된다|되는|지킨다|찾는다|정리한다|정리되는|확보한다|점검한다|고른다|늘린다|시작한다|챙긴다|떠오른다|떠올린다|밀어붙인다|움직인다|돌아온다|따진다|잡는다|말한다)/
const INTERNAL_MARKERS = ['속으로', '마음속', '내심', '불안', '긴장', '안심', '편하다', '부담']
const JUDGMENT_MARKERS = ['기준', '논리', '근거', '타당', '원칙', '정합', '우선']
const INCONGRUENCE_MARKERS = ['겉으로', '속으로', '실제로', '보여도']
const WORK_CONTEXT_MARKERS = ['업무', '회사', '팀', '프로젝트', '회의', '협업', '보고']
const PRIVATE_CONTEXT_MARKERS = ['친구', '가족', '연인', '지인', '가까운 사람']
const GENERAL_CONTEXT_MARKERS = ['일상', '평소', '갈등 상황', '보통 하루']
const LENGTH_MIN = 18
const LENGTH_MAX = 70
const MAX_WORD_TOKENS = 20
const MAX_COMPARISON_MARKERS = 2
const SIMILARITY_THRESHOLD = 0.72

const normalizeText = (text: string) => text.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

const tokenize = (text: string) => normalizeText(text).split(' ').filter(token => token.length >= 2)

const tokenOverlap = (a: string, b: string) => {
  const aSet = new Set(tokenize(a))
  const bSet = new Set(tokenize(b))

  if (aSet.size === 0 || bSet.size === 0) return 0

  let intersection = 0
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1
  }

  const union = new Set([...aSet, ...bSet]).size
  const overlapByMin = intersection / Math.min(aSet.size, bSet.size)
  const jaccard = union > 0 ? intersection / union : 0

  return Math.max(overlapByMin, jaccard)
}

const getMaxSimilarity = (text: string, recentQuestions: Question[]) => {
  if (recentQuestions.length === 0) return 0

  const normalized = normalizeText(text)
  let maxScore = 0

  for (const recentQuestion of recentQuestions) {
    const recentText = recentQuestion.text_ko
    const recentNormalized = normalizeText(recentText)

    if (!recentNormalized) continue

    if (normalized.includes(recentNormalized) || recentNormalized.includes(normalized)) {
      return 1
    }

    const score = tokenOverlap(text, recentText)
    if (score > maxScore) {
      maxScore = score
    }
  }

  return maxScore
}

export interface QuestionQualityValidation {
  valid: boolean
  reasons: string[]
  similarity: number
  ambiguityFlags: string[]
}

export interface QuestionValidationOptions {
  allowIncongruence?: boolean
}

const includesAny = (text: string, markers: string[]) => markers.some(marker => text.includes(marker))

const categoryCount = (text: string) => {
  const hasBehavior = ACTION_PATTERN.test(text)
  const hasInternal = includesAny(text, INTERNAL_MARKERS)
  const hasJudgment = includesAny(text, JUDGMENT_MARKERS)
  return Number(hasBehavior) + Number(hasInternal) + Number(hasJudgment)
}

const detectContextScope = (text: string): 'work' | 'private' | 'general' | 'none' | 'mixed' => {
  const hasWork = includesAny(text, WORK_CONTEXT_MARKERS)
  const hasPrivate = includesAny(text, PRIVATE_CONTEXT_MARKERS)
  const hasGeneral = includesAny(text, GENERAL_CONTEXT_MARKERS)
  const activeCount = Number(hasWork) + Number(hasPrivate) + Number(hasGeneral)

  if (activeCount === 0) return 'none'
  if (activeCount >= 2) return 'mixed'
  if (hasWork) return 'work'
  if (hasPrivate) return 'private'
  return 'general'
}

export const validateGeneratedQuestionQuality = (
  question: Question,
  recentQuestions: Question[],
  options: QuestionValidationOptions = {}
): QuestionQualityValidation => {
  const reasons: string[] = []
  const ambiguityFlags: string[] = []
  const text = (question.text_ko || '').trim()
  const normalized = normalizeText(text)
  const tokenCount = tokenize(text).length
  const comparisonCount = COMPARISON_MARKERS.filter(marker => text.includes(marker)).length
  const mixedCategoryCount = categoryCount(text)
  const contextScope = detectContextScope(text)
  const hasIncongruencePattern = INCONGRUENCE_MARKERS.filter(marker => text.includes(marker)).length >= 2

  if (!question.targets?.mbtiAxes || question.targets.mbtiAxes.length !== 1) {
    reasons.push('mbti_axis_must_be_single')
  }

  if (text.length < LENGTH_MIN || text.length > LENGTH_MAX) {
    reasons.push(`length_out_of_range:${text.length}`)
  }

  if (tokenCount > MAX_WORD_TOKENS) {
    reasons.push(`too_wordy:${tokenCount}`)
  }

  if (FORBIDDEN_EXPRESSIONS.some(word => text.includes(word))) {
    reasons.push('contains_forbidden_expression')
  }

  if (SOCIAL_DESIRABILITY_PATTERNS.some(pattern => pattern.test(text))) {
    reasons.push('social_desirability_bias')
  }

  if (INTERROGATIVE_PATTERNS.some(pattern => pattern.test(text)) || text.includes('?')) {
    reasons.push('not_yes_no_style')
  }

  if (ABSTRACT_PATTERNS.some(pattern => pattern.test(text))) {
    reasons.push('too_abstract_definition_style')
  }

  if (AMBIGUOUS_CONTEXT_PATTERNS.some(pattern => pattern.test(text))) {
    reasons.push('ambiguous_context_phrase')
    ambiguityFlags.push('ambiguous_context_phrase')
  }

  if (!normalized) {
    reasons.push('empty_or_invalid_text')
  }

  if (comparisonCount > MAX_COMPARISON_MARKERS) {
    reasons.push(`too_many_comparisons:${comparisonCount}`)
  }

  if (comparisonCount >= 1 && mixedCategoryCount >= 2 && !options.allowIncongruence) {
    reasons.push('comparison_cross_axis_mix')
  }

  if (mixedCategoryCount >= 3) {
    reasons.push('too_many_psych_dimensions')
  }

  if (mixedCategoryCount >= 2 && !options.allowIncongruence) {
    reasons.push('mixed_behavior_internal_judgment')
  }

  if (options.allowIncongruence && mixedCategoryCount >= 2 && !hasIncongruencePattern) {
    reasons.push('incongruence_pattern_not_clear')
  }

  if (!options.allowIncongruence && hasIncongruencePattern) {
    reasons.push('incongruence_not_allowed_in_normal_mode')
  }

  if (contextScope === 'mixed') {
    reasons.push('mixed_context_scope')
    ambiguityFlags.push('mixed_context_scope')
  }

  if (text.includes('갈등') && contextScope === 'none' && !text.includes('갈등 상황')) {
    reasons.push('conflict_context_not_fixed')
    ambiguityFlags.push('conflict_context_not_fixed')
  }

  const hasScenario = SCENARIO_MARKERS.some(marker => text.includes(marker))
  const hasAction = ACTION_PATTERN.test(text)

  if (!hasScenario || !hasAction) {
    reasons.push('insufficient_behavioral_specificity')
  }

  const similarity = getMaxSimilarity(text, recentQuestions)
  if (similarity >= SIMILARITY_THRESHOLD) {
    reasons.push(`too_similar_to_recent:${similarity.toFixed(2)}`)
  }

  return {
    valid: reasons.length === 0,
    reasons,
    similarity,
    ambiguityFlags
  }
}

interface CuratedFallbackOptions {
  allowIncongruence?: boolean
}

const getFallbackPool = (allowIncongruence: boolean) =>
  allowIncongruence ? incongruenceFollowupPool : curatedFallbackPool

export const getCuratedFallbackQuestion = (
  session: SessionState,
  options: CuratedFallbackOptions = {}
): Question => {
  const allowIncongruence = !!options.allowIncongruence
  const pool = getFallbackPool(allowIncongruence)
  const seed = session.answers.length % pool.length
  const recent = session.questionHistory.slice(-8)

  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = pool[(seed + offset) % pool.length]
    const nextQuestion = ensureQuestionScoring({
      ...structuredClone(candidate),
      id: makeAutoId()
    })

    const check = validateGeneratedQuestionQuality(nextQuestion, recent, {
      allowIncongruence
    })
    if (check.valid && check.similarity < SIMILARITY_THRESHOLD) {
      return nextQuestion
    }
  }

  return ensureQuestionScoring({
    ...structuredClone(pool[seed]),
    id: makeAutoId()
  })
}

export const validateQuestionText = (text: string): boolean => {
  const pseudoQuestion: Question = {
    id: 'tmp',
    text_ko: text,
    targets: { mbtiAxes: ['IE'], enneagram: ['5'] },
    rationale_short: 'tmp'
  }

  return validateGeneratedQuestionQuality(pseudoQuestion, []).valid
}
