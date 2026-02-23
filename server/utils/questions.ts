import { randomUUID } from 'node:crypto'
import type { DistributionState, MbtiAxis, Question, SessionState } from '~/types/mindtrace'
import { BASE_CURATED_QUESTION_COUNT } from '~/server/utils/constants'
import { getMostUncertainAxis, getTopCandidates } from '~/server/utils/probability'

const curatedQuestions: Question[] = [
  {
    id: 'q_seed_01',
    text_ko: '새로운 모임에 들어가면 먼저 소수와 깊게 이야기할 자리를 찾는다.',
    targets: { mbtiAxes: ['IE'], enneagram: ['4', '5', '9'] },
    rationale_short: 'I/E 에너지 방향과 관계 접근 방식을 구분',
    scoring: { mbti: { IE: 1.05 }, enneagram: { '4': 0.3, '5': 0.35, '9': 0.25 } }
  },
  {
    id: 'q_seed_02',
    text_ko: '약속이 생기면 즉흥 변경보다 미리 정한 순서를 끝까지 지키는 편이다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['1', '6'] },
    rationale_short: 'J/P 계획 선호와 규범 안정 욕구 확인',
    scoring: { mbti: { JP: 1.1 }, enneagram: { '1': 0.35, '6': 0.25 } }
  },
  {
    id: 'q_seed_03',
    text_ko: '설명을 할 때 구체 사례보다 원리와 구조를 먼저 꺼내는 편이다.',
    targets: { mbtiAxes: ['SN'], enneagram: ['5'] },
    rationale_short: 'S/N 정보 처리 방향을 분리',
    scoring: { mbti: { SN: -1.05 }, enneagram: { '5': 0.35 } }
  },
  {
    id: 'q_seed_04',
    text_ko: '친구 고민을 들으면 공감 표현보다 해결 순서 정리부터 해준다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['1', '3', '8'] },
    rationale_short: 'T/F 의사결정 기준 확인',
    scoring: { mbti: { TF: 1.1 }, enneagram: { '1': 0.25, '3': 0.25, '8': 0.2 } }
  },
  {
    id: 'q_seed_05',
    text_ko: '역할이 모호한 팀 과제는 시작 전에 기준부터 맞춰야 마음이 편하다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['1', '6'] },
    rationale_short: '구조 선호와 불확실성 민감도 점검',
    scoring: { mbti: { JP: 0.95 }, enneagram: { '1': 0.3, '6': 0.35 } }
  },
  {
    id: 'q_seed_06',
    text_ko: '새 아이디어를 들으면 현실 점검보다 가능성 그림이 먼저 떠오른다.',
    targets: { mbtiAxes: ['SN'], enneagram: ['7', '4'] },
    rationale_short: '추상적 가능성 탐색 경향 확인',
    scoring: { mbti: { SN: -0.95 }, enneagram: { '7': 0.35, '4': 0.3 } }
  }
]

const axisFallback: Record<MbtiAxis, Omit<Question, 'id'>> = {
  IE: {
    text_ko: '휴일이 생기면 사람들과 약속을 늘리기보다 혼자 회복 시간을 먼저 확보한다.',
    targets: { mbtiAxes: ['IE'], enneagram: ['5', '9'] },
    rationale_short: '사회 에너지 회복 방식 재확인',
    scoring: { mbti: { IE: 0.95 }, enneagram: { '5': 0.25, '9': 0.2 } }
  },
  SN: {
    text_ko: '결정을 내릴 때 눈앞의 데이터보다 장기 패턴과 함의를 더 크게 본다.',
    targets: { mbtiAxes: ['SN'], enneagram: ['5', '7'] },
    rationale_short: '구체 감각 vs 패턴 추론 분리',
    scoring: { mbti: { SN: -1.0 }, enneagram: { '5': 0.2, '7': 0.2 } }
  },
  TF: {
    text_ko: '의견 충돌 상황에서 관계 온도보다 논리 일관성을 먼저 지킨다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['1', '8'] },
    rationale_short: '판단 우선순위 충돌 해소',
    scoring: { mbti: { TF: 1.0 }, enneagram: { '1': 0.2, '8': 0.3 } }
  },
  JP: {
    text_ko: '프로젝트가 진행 중일 때 새 아이디어가 떠오르면 기존 계획보다 즉시 실험을 택한다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['7', '3'] },
    rationale_short: '계획 고정성 vs 유연성 분해',
    scoring: { mbti: { JP: -1.0 }, enneagram: { '7': 0.35, '3': 0.25 } }
  }
}

const enneagramFallbackQuestions: Record<string, Omit<Question, 'id'>> = {
  '1': {
    text_ko: '작은 실수라도 기준에서 벗어나면 스스로 오래 곱씹는 편이다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['1'] },
    rationale_short: '완결성/올바름 동기 확인',
    scoring: { mbti: { JP: 0.4 }, enneagram: { '1': 0.55 } }
  },
  '2': {
    text_ko: '내가 지칠 때도 상대가 필요하면 먼저 도와야 안심된다.',
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
    text_ko: '평범하게 잘하는 것보다 나만의 결을 지키는 쪽이 더 중요하다.',
    targets: { mbtiAxes: ['SN', 'TF'], enneagram: ['4'] },
    rationale_short: '정체성 고유성 동기 확인',
    scoring: { mbti: { SN: -0.3, TF: -0.3 }, enneagram: { '4': 0.55 } }
  },
  '5': {
    text_ko: '바쁘더라도 먼저 충분히 파악해야 움직일 수 있다.',
    targets: { mbtiAxes: ['SN', 'IE'], enneagram: ['5'] },
    rationale_short: '인지적 준비 욕구 확인',
    scoring: { mbti: { SN: -0.3, IE: 0.3 }, enneagram: { '5': 0.55 } }
  },
  '6': {
    text_ko: '결정을 내릴 때 최악의 변수부터 점검해야 마음이 놓인다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['6'] },
    rationale_short: '리스크 대비 성향 확인',
    scoring: { mbti: { JP: 0.25 }, enneagram: { '6': 0.55 } }
  },
  '7': {
    text_ko: '일이 답답해지면 한 가지를 붙들기보다 새 선택지를 즉시 늘린다.',
    targets: { mbtiAxes: ['JP', 'SN'], enneagram: ['7'] },
    rationale_short: '확장/회피 패턴 확인',
    scoring: { mbti: { JP: -0.35, SN: -0.25 }, enneagram: { '7': 0.55 } }
  },
  '8': {
    text_ko: '중요한 장면에서는 분위기보다 주도권을 직접 잡는 편이다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['8'] },
    rationale_short: '통제/주도 동기 확인',
    scoring: { mbti: { TF: 0.45 }, enneagram: { '8': 0.55 } }
  },
  '9': {
    text_ko: '갈등 조짐이 보이면 내 입장보다 전체 분위기 안정부터 챙긴다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['9'] },
    rationale_short: '갈등 완충 경향 확인',
    scoring: { mbti: { TF: -0.35 }, enneagram: { '9': 0.55 } }
  }
}

const curatedFallbackPool: Array<Omit<Question, 'id'>> = [
  {
    text_ko: '친구들과 여행 계획을 짤 때 이동 동선부터 확정해야 마음이 놓인다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['1', '6'] },
    rationale_short: '계획 선호를 안정적으로 재확인',
    scoring: { mbti: { JP: 0.9 }, enneagram: { '1': 0.25, '6': 0.3 } }
  },
  {
    text_ko: '예상 못 한 일정 변경이 생기면 바로 다른 선택지를 찾는 편이다.',
    targets: { mbtiAxes: ['JP'], enneagram: ['7', '3'] },
    rationale_short: '유연 대응 vs 계획 고정성 확인',
    scoring: { mbti: { JP: -0.85 }, enneagram: { '7': 0.35, '3': 0.2 } }
  },
  {
    text_ko: '처음 만난 사람과도 금방 대화를 넓히며 분위기를 여는 편이다.',
    targets: { mbtiAxes: ['IE'], enneagram: ['3', '7'] },
    rationale_short: '외향적 에너지 발산 확인',
    scoring: { mbti: { IE: -0.9 }, enneagram: { '3': 0.2, '7': 0.25 } }
  },
  {
    text_ko: '의견이 다를 때는 감정보다 근거 순서부터 맞추려는 편이다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['1', '8'] },
    rationale_short: '판단 기준 우선순위 재확인',
    scoring: { mbti: { TF: 0.95 }, enneagram: { '1': 0.2, '8': 0.25 } }
  },
  {
    text_ko: '새로운 아이디어를 들으면 바로 현실 적용 장면을 떠올리는 편이다.',
    targets: { mbtiAxes: ['SN'], enneagram: ['3', '6'] },
    rationale_short: '구체 적용 중심 성향 확인',
    scoring: { mbti: { SN: 0.85 }, enneagram: { '3': 0.2, '6': 0.2 } }
  },
  {
    text_ko: '업무가 몰려도 필요한 정보가 충분해야 행동을 시작할 수 있다.',
    targets: { mbtiAxes: ['IE', 'SN'], enneagram: ['5'] },
    rationale_short: '인지적 준비 욕구와 내향성 확인',
    scoring: { mbti: { IE: 0.35, SN: -0.35 }, enneagram: { '5': 0.45 } }
  },
  {
    text_ko: '팀이 흔들릴 때는 내 주장보다 갈등을 줄이는 쪽을 먼저 택한다.',
    targets: { mbtiAxes: ['TF'], enneagram: ['9', '2'] },
    rationale_short: '관계 안정 우선 경향 확인',
    scoring: { mbti: { TF: -0.8 }, enneagram: { '9': 0.4, '2': 0.2 } }
  },
  {
    text_ko: '모호한 지시를 받으면 스스로 기준을 정해 끝까지 밀어붙인다.',
    targets: { mbtiAxes: ['JP', 'TF'], enneagram: ['8', '3'] },
    rationale_short: '주도적 실행 성향 확인',
    scoring: { mbti: { JP: 0.6, TF: 0.5 }, enneagram: { '8': 0.35, '3': 0.2 } }
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

export const buildDeterministicAdaptiveQuestion = (session: SessionState): Question => {
  const usedIds = usedQuestionIds(session)
  const conflictAxis = findConflictAxis(session.distribution)

  let candidate: Question
  if (conflictAxis) {
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
const SCENARIO_MARKERS = [
  '하면',
  '할 때',
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
const ACTION_PATTERN = /(한다|한다\.|지킨다|찾는다|정리한다|확보한다|점검한다|고른다|늘린다|시작한다|챙긴다|떠올린다|밀어붙인다|움직인다|놓인다)/
const LENGTH_MIN = 18
const LENGTH_MAX = 70

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
}

export const validateGeneratedQuestionQuality = (
  question: Question,
  recentQuestions: Question[]
): QuestionQualityValidation => {
  const reasons: string[] = []
  const text = (question.text_ko || '').trim()

  if (text.length < LENGTH_MIN || text.length > LENGTH_MAX) {
    reasons.push(`length_out_of_range:${text.length}`)
  }

  if (FORBIDDEN_EXPRESSIONS.some(word => text.includes(word))) {
    reasons.push('contains_forbidden_expression')
  }

  if (INTERROGATIVE_PATTERNS.some(pattern => pattern.test(text)) || text.includes('?')) {
    reasons.push('not_yes_no_style')
  }

  if (ABSTRACT_PATTERNS.some(pattern => pattern.test(text))) {
    reasons.push('too_abstract_definition_style')
  }

  const hasScenario = SCENARIO_MARKERS.some(marker => text.includes(marker))
  const hasAction = ACTION_PATTERN.test(text)

  if (!hasScenario || !hasAction) {
    reasons.push('insufficient_behavioral_specificity')
  }

  const similarity = getMaxSimilarity(text, recentQuestions)
  if (similarity >= 0.78) {
    reasons.push(`too_similar_to_recent:${similarity.toFixed(2)}`)
  }

  return {
    valid: reasons.length === 0,
    reasons,
    similarity
  }
}

export const getCuratedFallbackQuestion = (session: SessionState): Question => {
  const seed = session.answers.length % curatedFallbackPool.length
  const recent = session.questionHistory.slice(-8)

  for (let offset = 0; offset < curatedFallbackPool.length; offset += 1) {
    const candidate = curatedFallbackPool[(seed + offset) % curatedFallbackPool.length]
    const nextQuestion = ensureQuestionScoring({
      ...structuredClone(candidate),
      id: makeAutoId()
    })

    const check = validateGeneratedQuestionQuality(nextQuestion, recent)
    if (check.similarity < 0.78) {
      return nextQuestion
    }
  }

  return ensureQuestionScoring({
    ...structuredClone(curatedFallbackPool[seed]),
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
