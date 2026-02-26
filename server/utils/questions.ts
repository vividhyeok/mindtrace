import type {
  EnneagramType,
  MbtiAxis,
  MbtiType,
  Question,
  QuestionContext,
  QuestionMode,
  QuestionPattern,
  QuestionPhase,
  QuestionSelectionCandidate,
  QuestionSelectionResult,
  SessionState,
  TypeCandidate
} from '~/types/mindtrace'
import { AXIS_LETTERS, BASE_CURATED_QUESTION_COUNT } from '~/server/utils/constants'
import { getTopCandidates } from '~/server/utils/probability'

const AXIS_INDEX: Record<MbtiAxis, number> = {
  IE: 0,
  SN: 1,
  TF: 2,
  JP: 3
}

const PHASE_MODE_ALLOW: Record<QuestionPhase, QuestionMode[]> = {
  A: ['axis_scan'],
  B: ['axis_scan', 'tie_break'],
  C: ['tie_break', 'validation']
}

const cloneQuestion = (question: Question): Question => structuredClone(question)

const invertRecord = <T extends string>(record: Partial<Record<T, number>>): Partial<Record<T, number>> => {
  const out: Partial<Record<T, number>> = {}
  for (const [key, value] of Object.entries(record) as Array<[T, number]>) {
    out[key] = -Number(value || 0)
  }
  return out
}

const symmetricTransitions = (
  yesMbti: Partial<Record<MbtiAxis, number>>,
  yesEnnea: Partial<Record<EnneagramType, number>>
) => {
  return {
    yes: {
      mbti: yesMbti,
      enneagram: yesEnnea
    },
    no: {
      mbti: invertRecord(yesMbti),
      enneagram: invertRecord(yesEnnea)
    }
  }
}

interface QuestionDraft {
  id: string
  text_ko: string
  rationale_short: string
  mbtiAxes: MbtiAxis[]
  enneagram: EnneagramType[]
  mode: QuestionMode
  context: QuestionContext
  pattern: QuestionPattern
  cooldownGroup: string
  ambiguityScore: number
  qualityScore: number
  expressionSignal?: number
  judgmentSignal?: number
  phaseHints?: QuestionPhase[]
  transitions: ReturnType<typeof symmetricTransitions>
}

const buildQuestion = (draft: QuestionDraft): Question => {
  return {
    id: draft.id,
    text_ko: draft.text_ko,
    rationale_short: draft.rationale_short,
    targets: {
      mbtiAxes: draft.mbtiAxes,
      enneagram: draft.enneagram
    },
    transitions: draft.transitions,
    meta: {
      context: draft.context,
      mode: draft.mode,
      pattern: draft.pattern,
      cooldownGroup: draft.cooldownGroup,
      ambiguityScore: draft.ambiguityScore,
      qualityScore: draft.qualityScore,
      expressionSignal: draft.expressionSignal,
      judgmentSignal: draft.judgmentSignal,
      phaseHints: draft.phaseHints
    }
  }
}

const QUESTION_BANK: Question[] = [
  buildQuestion({
    id: 'bank_a_01',
    text_ko: '나는 처음 만난 모임에서는 말하기보다 분위기를 먼저 살피는 편인가요?',
    rationale_short: '에너지 방향 스캔',
    mbtiAxes: ['IE'],
    enneagram: ['5', '9'],
    mode: 'axis_scan',
    context: 'daily',
    pattern: 'behavior',
    cooldownGroup: 'ie_energy_1',
    ambiguityScore: 0.16,
    qualityScore: 0.88,
    transitions: symmetricTransitions({ IE: 1.0 }, { '5': 0.2, '9': 0.16 })
  }),
  buildQuestion({
    id: 'bank_a_02',
    text_ko: '나는 지친 날에도 사람을 만나면 오히려 에너지가 살아나는 편인가요?',
    rationale_short: '외향 회복성 스캔',
    mbtiAxes: ['IE'],
    enneagram: ['3', '7'],
    mode: 'axis_scan',
    context: 'daily',
    pattern: 'internal',
    cooldownGroup: 'ie_energy_2',
    ambiguityScore: 0.2,
    qualityScore: 0.84,
    transitions: symmetricTransitions({ IE: -0.96 }, { '3': 0.15, '7': 0.2 })
  }),
  buildQuestion({
    id: 'bank_a_03',
    text_ko: '나는 새 주제를 배울 때 개념보다 예시부터 확인해야 이해가 빠른 편인가요?',
    rationale_short: '정보 처리 방향 스캔',
    mbtiAxes: ['SN'],
    enneagram: ['6'],
    mode: 'axis_scan',
    context: 'daily',
    pattern: 'judgment',
    cooldownGroup: 'sn_info_1',
    ambiguityScore: 0.14,
    qualityScore: 0.9,
    transitions: symmetricTransitions({ SN: 1.02 }, { '6': 0.2 })
  }),
  buildQuestion({
    id: 'bank_a_04',
    text_ko: '나는 새 아이디어를 들으면 적용법보다 가능성부터 먼저 떠오르는 편인가요?',
    rationale_short: '추상 확장 스캔',
    mbtiAxes: ['SN'],
    enneagram: ['7', '4'],
    mode: 'axis_scan',
    context: 'daily',
    pattern: 'internal',
    cooldownGroup: 'sn_info_2',
    ambiguityScore: 0.18,
    qualityScore: 0.86,
    transitions: symmetricTransitions({ SN: -0.98 }, { '7': 0.2, '4': 0.16 })
  }),
  buildQuestion({
    id: 'bank_a_05',
    text_ko: '나는 의견 충돌이 생기면 관계보다 기준 정리부터 하는 편인가요?',
    rationale_short: '판단 기준 스캔',
    mbtiAxes: ['TF'],
    enneagram: ['1', '8'],
    mode: 'axis_scan',
    context: 'work',
    pattern: 'judgment',
    cooldownGroup: 'tf_judgment_1',
    ambiguityScore: 0.14,
    qualityScore: 0.9,
    judgmentSignal: 0.9,
    transitions: symmetricTransitions({ TF: 1.05 }, { '1': 0.2, '8': 0.16 })
  }),
  buildQuestion({
    id: 'bank_a_06',
    text_ko: '나는 가까운 사람이 힘들어하면 해결보다 감정 반응부터 맞춰주는 편인가요?',
    rationale_short: '공감 우선 스캔',
    mbtiAxes: ['TF'],
    enneagram: ['2', '9'],
    mode: 'axis_scan',
    context: 'private',
    pattern: 'behavior',
    cooldownGroup: 'tf_judgment_2',
    ambiguityScore: 0.18,
    qualityScore: 0.86,
    expressionSignal: 0.8,
    transitions: symmetricTransitions({ TF: -1.0 }, { '2': 0.2, '9': 0.12 })
  }),
  buildQuestion({
    id: 'bank_a_07',
    text_ko: '나는 일을 시작하기 전에 순서표를 먼저 만드는 편인가요?',
    rationale_short: '계획 선호 스캔',
    mbtiAxes: ['JP'],
    enneagram: ['1', '6'],
    mode: 'axis_scan',
    context: 'work',
    pattern: 'behavior',
    cooldownGroup: 'jp_plan_1',
    ambiguityScore: 0.12,
    qualityScore: 0.92,
    transitions: symmetricTransitions({ JP: 1.0 }, { '1': 0.18, '6': 0.18 })
  }),
  buildQuestion({
    id: 'bank_a_08',
    text_ko: '나는 계획이 있어도 더 나은 아이디어가 보이면 바로 바꾸는 편인가요?',
    rationale_short: '유연 전환 스캔',
    mbtiAxes: ['JP'],
    enneagram: ['7', '3'],
    mode: 'axis_scan',
    context: 'daily',
    pattern: 'behavior',
    cooldownGroup: 'jp_plan_2',
    ambiguityScore: 0.16,
    qualityScore: 0.88,
    transitions: symmetricTransitions({ JP: -0.96 }, { '7': 0.18, '3': 0.14 })
  }),

  buildQuestion({
    id: 'bank_b_01',
    text_ko: '나는 업무 회의에서 충돌이 나면 말하기 전에 근거를 메모로 정리하나요?',
    rationale_short: 'TF 경합 분리',
    mbtiAxes: ['TF'],
    enneagram: ['1', '5'],
    mode: 'tie_break',
    context: 'work',
    pattern: 'behavior',
    cooldownGroup: 'tf_tie_1',
    ambiguityScore: 0.14,
    qualityScore: 0.9,
    judgmentSignal: 0.86,
    phaseHints: ['B', 'C'],
    transitions: symmetricTransitions({ TF: 0.92 }, { '1': 0.18, '5': 0.12 })
  }),
  buildQuestion({
    id: 'bank_b_02',
    text_ko: '나는 업무 요청을 받으면 기대효과보다 리스크부터 먼저 점검하나요?',
    rationale_short: 'SN/JP 경합 분리',
    mbtiAxes: ['SN', 'JP'],
    enneagram: ['6'],
    mode: 'tie_break',
    context: 'work',
    pattern: 'judgment',
    cooldownGroup: 'snjp_tie_1',
    ambiguityScore: 0.2,
    qualityScore: 0.84,
    phaseHints: ['B'],
    transitions: symmetricTransitions({ SN: 0.4, JP: 0.6 }, { '6': 0.24 })
  }),
  buildQuestion({
    id: 'bank_b_03',
    text_ko: '나는 주말 계획이 비면 즉흥 약속보다 혼자 정리 시간을 먼저 잡나요?',
    rationale_short: 'IE/JP 경합 분리',
    mbtiAxes: ['IE', 'JP'],
    enneagram: ['5', '9'],
    mode: 'tie_break',
    context: 'private',
    pattern: 'behavior',
    cooldownGroup: 'ie_tie_1',
    ambiguityScore: 0.16,
    qualityScore: 0.88,
    phaseHints: ['B'],
    transitions: symmetricTransitions({ IE: 0.78, JP: 0.35 }, { '5': 0.18, '9': 0.16 })
  }),
  buildQuestion({
    id: 'bank_b_04',
    text_ko: '나는 정보를 설명할 때 큰 방향보다 세부 사실을 먼저 말하는 편인가요?',
    rationale_short: 'SN 경합 분리',
    mbtiAxes: ['SN'],
    enneagram: ['6', '1'],
    mode: 'tie_break',
    context: 'work',
    pattern: 'behavior',
    cooldownGroup: 'sn_tie_1',
    ambiguityScore: 0.14,
    qualityScore: 0.9,
    phaseHints: ['B', 'C'],
    transitions: symmetricTransitions({ SN: 0.9 }, { '6': 0.16, '1': 0.14 })
  }),
  buildQuestion({
    id: 'bank_b_05',
    text_ko: '나는 결정 직전에 가능성보다 실행 조건이 맞는지 먼저 보나요?',
    rationale_short: 'SN/JP 실행 분리',
    mbtiAxes: ['SN', 'JP'],
    enneagram: ['3', '6'],
    mode: 'tie_break',
    context: 'daily',
    pattern: 'judgment',
    cooldownGroup: 'snjp_tie_2',
    ambiguityScore: 0.18,
    qualityScore: 0.86,
    phaseHints: ['B', 'C'],
    transitions: symmetricTransitions({ SN: 0.55, JP: 0.35 }, { '3': 0.1, '6': 0.14 })
  }),
  buildQuestion({
    id: 'bank_b_06',
    text_ko: '나는 친구 고민을 들으면 공감보다 해결 순서를 먼저 떠올리는 편인가요?',
    rationale_short: 'TF 경합 분리',
    mbtiAxes: ['TF'],
    enneagram: ['1', '3'],
    mode: 'tie_break',
    context: 'private',
    pattern: 'internal',
    cooldownGroup: 'tf_tie_2',
    ambiguityScore: 0.15,
    qualityScore: 0.9,
    phaseHints: ['B', 'C'],
    transitions: symmetricTransitions({ TF: 0.82 }, { '1': 0.12, '3': 0.14 })
  }),
  buildQuestion({
    id: 'bank_b_07',
    text_ko: '나는 팀에서 아이디어를 낼 때 완성형보다 초안부터 먼저 공유하는 편인가요?',
    rationale_short: 'IE/JP 공개 반응 분리',
    mbtiAxes: ['IE', 'JP'],
    enneagram: ['7', '3'],
    mode: 'tie_break',
    context: 'work',
    pattern: 'behavior',
    cooldownGroup: 'ie_tie_2',
    ambiguityScore: 0.2,
    qualityScore: 0.82,
    phaseHints: ['B'],
    transitions: symmetricTransitions({ IE: -0.45, JP: -0.52 }, { '7': 0.18, '3': 0.14 })
  }),
  buildQuestion({
    id: 'bank_b_08',
    text_ko: '나는 정리되지 않은 상태로 시작하는 것보다 준비가 늦어도 구조를 맞추나요?',
    rationale_short: 'JP 안정성 분리',
    mbtiAxes: ['JP'],
    enneagram: ['1', '6'],
    mode: 'tie_break',
    context: 'work',
    pattern: 'judgment',
    cooldownGroup: 'jp_tie_1',
    ambiguityScore: 0.12,
    qualityScore: 0.92,
    phaseHints: ['B', 'C'],
    transitions: symmetricTransitions({ JP: 0.9 }, { '1': 0.2, '6': 0.12 })
  }),
  buildQuestion({
    id: 'bank_b_09',
    text_ko: '나는 관계가 걸려 있어도 기준이 어긋나면 그대로 지적하는 편인가요?',
    rationale_short: 'TF 강도 확인',
    mbtiAxes: ['TF'],
    enneagram: ['8', '1'],
    mode: 'tie_break',
    context: 'private',
    pattern: 'behavior',
    cooldownGroup: 'tf_tie_3',
    ambiguityScore: 0.18,
    qualityScore: 0.85,
    phaseHints: ['B', 'C'],
    transitions: symmetricTransitions({ TF: 0.88 }, { '8': 0.18, '1': 0.1 })
  }),
  buildQuestion({
    id: 'bank_b_10',
    text_ko: '나는 대화가 길어지면 생각을 정리하려고 잠깐 거리를 두는 편인가요?',
    rationale_short: 'IE 회복 리듬 확인',
    mbtiAxes: ['IE'],
    enneagram: ['5', '4'],
    mode: 'tie_break',
    context: 'daily',
    pattern: 'internal',
    cooldownGroup: 'ie_tie_3',
    ambiguityScore: 0.16,
    qualityScore: 0.87,
    phaseHints: ['B'],
    transitions: symmetricTransitions({ IE: 0.82 }, { '5': 0.2, '4': 0.12 })
  }),
  buildQuestion({
    id: 'bank_b_11',
    text_ko: '나는 상황이 바뀌면 계획 수정표를 바로 만들어 흐름을 다시 맞추나요?',
    rationale_short: 'JP 조정 방식 분리',
    mbtiAxes: ['JP'],
    enneagram: ['1', '3'],
    mode: 'tie_break',
    context: 'work',
    pattern: 'behavior',
    cooldownGroup: 'jp_tie_2',
    ambiguityScore: 0.14,
    qualityScore: 0.9,
    phaseHints: ['B', 'C'],
    transitions: symmetricTransitions({ JP: 0.84 }, { '1': 0.18, '3': 0.12 })
  }),
  buildQuestion({
    id: 'bank_b_12',
    text_ko: '나는 새로운 방식을 볼 때 구체 장면보다 원리부터 이해하려는 편인가요?',
    rationale_short: 'SN 재확인',
    mbtiAxes: ['SN'],
    enneagram: ['5', '7'],
    mode: 'tie_break',
    context: 'daily',
    pattern: 'judgment',
    cooldownGroup: 'sn_tie_2',
    ambiguityScore: 0.15,
    qualityScore: 0.9,
    phaseHints: ['B', 'C'],
    transitions: symmetricTransitions({ SN: -0.84 }, { '5': 0.2, '7': 0.14 })
  }),

  buildQuestion({
    id: 'bank_c_01',
    text_ko: '나는 겉으로 공감해도 실제 판단은 해결 순서로 정리되는 편인가요?',
    rationale_short: '겉/속 불일치 검증',
    mbtiAxes: ['TF'],
    enneagram: ['1', '3', '5'],
    mode: 'validation',
    context: 'daily',
    pattern: 'incongruence',
    cooldownGroup: 'val_incon_1',
    ambiguityScore: 0.24,
    qualityScore: 0.82,
    expressionSignal: 0.7,
    judgmentSignal: 0.82,
    phaseHints: ['C'],
    transitions: symmetricTransitions({ TF: 0.74 }, { '1': 0.14, '3': 0.1, '5': 0.12 })
  }),
  buildQuestion({
    id: 'bank_c_02',
    text_ko: '나는 맞춰서 대화해도 속으로는 기준의 타당성을 계속 확인하는 편인가요?',
    rationale_short: '내적 판단 검증',
    mbtiAxes: ['TF'],
    enneagram: ['1', '6'],
    mode: 'validation',
    context: 'private',
    pattern: 'incongruence',
    cooldownGroup: 'val_incon_2',
    ambiguityScore: 0.24,
    qualityScore: 0.8,
    expressionSignal: 0.65,
    judgmentSignal: 0.84,
    phaseHints: ['C'],
    transitions: symmetricTransitions({ TF: 0.7 }, { '1': 0.14, '6': 0.12 })
  }),
  buildQuestion({
    id: 'bank_c_03',
    text_ko: '나는 유연해 보이려 해도 최종 선택은 익숙한 방식으로 돌아오는 편인가요?',
    rationale_short: '표면 유연성 검증',
    mbtiAxes: ['JP'],
    enneagram: ['6', '9'],
    mode: 'validation',
    context: 'daily',
    pattern: 'incongruence',
    cooldownGroup: 'val_incon_3',
    ambiguityScore: 0.22,
    qualityScore: 0.82,
    phaseHints: ['C'],
    transitions: symmetricTransitions({ JP: 0.7 }, { '6': 0.14, '9': 0.14 })
  }),
  buildQuestion({
    id: 'bank_c_04',
    text_ko: '나는 밝게 반응해도 결정 직전에는 혼자 정리 시간이 꼭 필요한 편인가요?',
    rationale_short: '표현/회복 분리 검증',
    mbtiAxes: ['IE'],
    enneagram: ['5', '9'],
    mode: 'validation',
    context: 'daily',
    pattern: 'incongruence',
    cooldownGroup: 'val_incon_4',
    ambiguityScore: 0.22,
    qualityScore: 0.84,
    phaseHints: ['C'],
    transitions: symmetricTransitions({ IE: 0.72 }, { '5': 0.18, '9': 0.12 })
  }),
  buildQuestion({
    id: 'bank_c_05',
    text_ko: '나는 사적인 갈등에서도 감정 공감보다 원인 분해가 먼저 떠오르는 편인가요?',
    rationale_short: '맥락 전이 검증',
    mbtiAxes: ['TF'],
    enneagram: ['1', '5'],
    mode: 'validation',
    context: 'private',
    pattern: 'judgment',
    cooldownGroup: 'val_tf_1',
    ambiguityScore: 0.18,
    qualityScore: 0.86,
    phaseHints: ['C'],
    transitions: symmetricTransitions({ TF: 0.76 }, { '1': 0.14, '5': 0.12 })
  }),
  buildQuestion({
    id: 'bank_c_06',
    text_ko: '나는 업무에서는 공감 표현을 해도 실행 체크리스트를 끝까지 붙드는 편인가요?',
    rationale_short: '실행 일관성 검증',
    mbtiAxes: ['JP', 'TF'],
    enneagram: ['1', '3'],
    mode: 'validation',
    context: 'work',
    pattern: 'behavior',
    cooldownGroup: 'val_exec_1',
    ambiguityScore: 0.2,
    qualityScore: 0.86,
    phaseHints: ['C'],
    transitions: symmetricTransitions({ JP: 0.56, TF: 0.4 }, { '1': 0.16, '3': 0.12 })
  }),
  buildQuestion({
    id: 'bank_c_07',
    text_ko: '나는 즉흥적으로 보이는 날에도 중요한 결정은 기준표를 다시 확인하는 편인가요?',
    rationale_short: '즉흥/기준 분리 검증',
    mbtiAxes: ['JP'],
    enneagram: ['6', '1'],
    mode: 'validation',
    context: 'daily',
    pattern: 'incongruence',
    cooldownGroup: 'val_incon_5',
    ambiguityScore: 0.21,
    qualityScore: 0.82,
    phaseHints: ['C'],
    transitions: symmetricTransitions({ JP: 0.64 }, { '6': 0.14, '1': 0.1 })
  }),
  buildQuestion({
    id: 'bank_c_08',
    text_ko: '나는 겉으로는 맞춰도 결론은 내 기준과 근거가 맞아야 선택하는 편인가요?',
    rationale_short: '판단 고정성 검증',
    mbtiAxes: ['TF'],
    enneagram: ['1', '8'],
    mode: 'validation',
    context: 'daily',
    pattern: 'incongruence',
    cooldownGroup: 'val_incon_6',
    ambiguityScore: 0.23,
    qualityScore: 0.81,
    phaseHints: ['C'],
    transitions: symmetricTransitions({ TF: 0.74 }, { '1': 0.14, '8': 0.14 })
  })
]

const BANK_BY_ID = new Map(QUESTION_BANK.map(question => [question.id, question]))

const INITIAL_QUESTION_IDS = [
  'bank_a_01',
  'bank_a_03',
  'bank_a_05',
  'bank_a_07',
  'bank_a_04',
  'bank_a_06'
]

export const curatedQuestionCount = () => BASE_CURATED_QUESTION_COUNT

export const getCuratedQuestionByIndex = (index: number): Question | null => {
  if (index < 0 || index >= INITIAL_QUESTION_IDS.length) {
    return null
  }
  const id = INITIAL_QUESTION_IDS[index]
  const found = BANK_BY_ID.get(id)
  return found ? cloneQuestion(found) : null
}

export const sanitizeQuestionForClient = (question: Question) => ({
  id: question.id,
  text_ko: question.text_ko,
  targets: question.targets,
  rationale_short: question.rationale_short
})

const safeMeta = (question: Question) => {
  return question.meta || {
    context: 'daily' as QuestionContext,
    mode: 'tie_break' as QuestionMode,
    pattern: 'behavior' as QuestionPattern,
    cooldownGroup: 'unknown',
    ambiguityScore: 0.3,
    qualityScore: 0.6
  }
}

const getAnsweredQuestionByIndex = (session: SessionState, index: number) => {
  return session.questionHistory[index]
}

export const countValidationAnswers = (session: SessionState): number => {
  let count = 0
  for (let index = 0; index < session.answers.length; index += 1) {
    const question = getAnsweredQuestionByIndex(session, index)
    if (question?.meta?.mode === 'validation') {
      count += 1
    }
  }
  return count
}

const countRecentMode = (session: SessionState, mode: QuestionMode, recent = 6): number => {
  let count = 0
  const from = Math.max(0, session.answers.length - recent)
  for (let index = from; index < session.answers.length; index += 1) {
    const question = getAnsweredQuestionByIndex(session, index)
    if (question?.meta?.mode === mode) {
      count += 1
    }
  }
  return count
}

export const determinePhase = (session: SessionState, maxQuestions: number): QuestionPhase => {
  const answerCount = session.answers.length
  const uncertainAxisCount = Object.values(session.distribution.axisScores)
    .filter(value => Math.abs(value) < 0.58)
    .length

  if (answerCount < 5) return 'A'

  if (answerCount < 8 && uncertainAxisCount >= 3) {
    return 'B'
  }

  if (answerCount >= Math.min(maxQuestions - 3, 8) || uncertainAxisCount <= 1) {
    return 'C'
  }

  return 'B'
}

const isTypeFirstLetter = (type: MbtiType, axis: MbtiAxis) => {
  const index = AXIS_INDEX[axis]
  const firstLetter = AXIS_LETTERS[axis][0]
  return type[index] === firstLetter
}

const getMostUncertainAxis = (session: SessionState): MbtiAxis => {
  const entries = Object.entries(session.distribution.axisScores) as Array<[MbtiAxis, number]>
  entries.sort((left, right) => Math.abs(left[1]) - Math.abs(right[1]))
  return entries[0]?.[0] || 'IE'
}

const calcAxisUncertainty = (session: SessionState, axis: MbtiAxis) => {
  const axisScore = Math.abs(session.distribution.axisScores[axis] || 0)
  return 1 - Math.min(1, axisScore / 1.6)
}

const calcMbtiSplit = (mbtiTop: TypeCandidate<MbtiType>[], axis: MbtiAxis) => {
  const firstProb = mbtiTop
    .filter(candidate => isTypeFirstLetter(candidate.type, axis))
    .reduce((acc, candidate) => acc + candidate.p, 0)
  return 1 - Math.min(1, Math.abs(0.5 - firstProb) * 2)
}

const calcEnneaSplit = (enneaTop: TypeCandidate<string>[], targets: EnneagramType[]) => {
  if (targets.length === 0) return 0

  const targetSet = new Set(targets)
  const mass = enneaTop
    .filter(candidate => targetSet.has(candidate.type as EnneagramType))
    .reduce((acc, candidate) => acc + candidate.p, 0)

  return 1 - Math.min(1, Math.abs(0.5 - mass) * 2)
}

const isAllowedInPhase = (mode: QuestionMode, phase: QuestionPhase) => {
  return PHASE_MODE_ALLOW[phase].includes(mode)
}

const collectRecentQuestions = (session: SessionState, count: number) => {
  return session.questionHistory.slice(-count)
}

const filterBankCandidates = (
  session: SessionState,
  phase: QuestionPhase,
  relaxed: boolean
): Question[] => {
  const askedIds = new Set(session.questionHistory.map(question => question.id))
  const recentQuestions = collectRecentQuestions(session, 3)
  const recentGroups = new Set(recentQuestions.map(question => question.meta?.cooldownGroup).filter(Boolean))
  const lastContext = recentQuestions[recentQuestions.length - 1]?.meta?.context
  const lastPattern = recentQuestions[recentQuestions.length - 1]?.meta?.pattern

  return QUESTION_BANK.filter((question) => {
    if (askedIds.has(question.id)) return false

    const meta = safeMeta(question)
    if (!isAllowedInPhase(meta.mode, phase)) return false

    if (meta.phaseHints && meta.phaseHints.length > 0 && !meta.phaseHints.includes(phase)) {
      return false
    }

    if (!relaxed) {
      if (recentGroups.has(meta.cooldownGroup)) return false
      if (lastContext && meta.context === lastContext && meta.mode !== 'validation') return false
      if (lastPattern && meta.pattern === lastPattern && meta.mode === 'axis_scan') return false
    }

    return true
  })
}

const scoreCandidate = (
  question: Question,
  session: SessionState,
  phase: QuestionPhase,
  mbtiTop: TypeCandidate<MbtiType>[],
  enneaTop: TypeCandidate<string>[]
): QuestionSelectionCandidate => {
  const meta = safeMeta(question)
  const uncertainAxis = getMostUncertainAxis(session)

  const axisUncertainty = question.targets.mbtiAxes.length === 0
    ? 0
    : question.targets.mbtiAxes
      .map(axis => calcAxisUncertainty(session, axis))
      .reduce((acc, current) => acc + current, 0) / question.targets.mbtiAxes.length

  const mbtiSplit = question.targets.mbtiAxes.length === 0
    ? 0
    : question.targets.mbtiAxes
      .map(axis => calcMbtiSplit(mbtiTop, axis))
      .reduce((acc, current) => acc + current, 0) / question.targets.mbtiAxes.length

  const enneaSplit = calcEnneaSplit(enneaTop, question.targets.enneagram)

  let noveltyPenalty = 0
  const recentQuestions = collectRecentQuestions(session, 3)
  const recentGroups = new Set(recentQuestions.map(item => item.meta?.cooldownGroup))
  const last = recentQuestions[recentQuestions.length - 1]
  if (recentGroups.has(meta.cooldownGroup)) noveltyPenalty += 0.26
  if (last?.meta?.context === meta.context) noveltyPenalty += 0.1
  if (last?.meta?.pattern === meta.pattern) noveltyPenalty += 0.08

  const ambiguityPenalty = meta.ambiguityScore * 0.45
  const qualityBoost = meta.qualityScore * 0.35

  let phaseBonus = 0
  if (phase === 'A' && meta.mode === 'axis_scan') phaseBonus += 0.28
  if (phase === 'B' && meta.mode === 'tie_break') phaseBonus += 0.25
  if (phase === 'C' && meta.mode === 'validation') phaseBonus += 0.34
  if (question.targets.mbtiAxes.includes(uncertainAxis)) phaseBonus += 0.24
  if (phase === 'C' && countRecentMode(session, 'validation', 5) === 0 && meta.mode === 'validation') {
    phaseBonus += 0.14
  }

  const score =
    axisUncertainty * 1.9
    + mbtiSplit * 1.8
    + enneaSplit * 1.2
    + qualityBoost
    + phaseBonus
    - noveltyPenalty
    - ambiguityPenalty

  return {
    id: question.id,
    score: Math.round(score * 1000) / 1000,
    breakdown: {
      axisUncertainty: Math.round(axisUncertainty * 1000) / 1000,
      mbtiSplit: Math.round(mbtiSplit * 1000) / 1000,
      enneaSplit: Math.round(enneaSplit * 1000) / 1000,
      noveltyPenalty: Math.round(noveltyPenalty * 1000) / 1000,
      ambiguityPenalty: Math.round(ambiguityPenalty * 1000) / 1000,
      qualityBoost: Math.round(qualityBoost * 1000) / 1000,
      phaseBonus: Math.round(phaseBonus * 1000) / 1000
    }
  }
}

const selectBestCandidate = (session: SessionState, phase: QuestionPhase) => {
  const mbtiTop = getTopCandidates(session.distribution.mbtiProbs16, 4)
  const enneaTop = getTopCandidates(session.distribution.enneagramProbs9, 4)

  let candidates = filterBankCandidates(session, phase, false)
  if (candidates.length === 0) {
    candidates = filterBankCandidates(session, phase, true)
  }

  if (candidates.length === 0) {
    const askedIds = new Set(session.questionHistory.map(question => question.id))
    candidates = QUESTION_BANK.filter(question => !askedIds.has(question.id))
  }

  if (candidates.length === 0) {
    candidates = QUESTION_BANK
  }

  const ranked = candidates
    .map(question => ({ question, candidate: scoreCandidate(question, session, phase, mbtiTop, enneaTop) }))
    .sort((left, right) => right.candidate.score - left.candidate.score)

  const best = ranked[0]
  if (!best) {
    const fallback = QUESTION_BANK[0]
    return {
      question: cloneQuestion(fallback),
      ranked: [],
      reason: 'fallback:first_bank_question'
    }
  }

  const reason = [
    `phase=${phase}`,
    `id=${best.question.id}`,
    `score=${best.candidate.score}`,
    `mode=${safeMeta(best.question).mode}`,
    `context=${safeMeta(best.question).context}`
  ].join(' | ')

  return {
    question: cloneQuestion(best.question),
    ranked: ranked.slice(0, 5).map(item => item.candidate),
    reason
  }
}

export const selectNextQuestionFromBank = (
  session: SessionState,
  maxQuestions: number
): QuestionSelectionResult => {
  const phase = determinePhase(session, maxQuestions)
  const selected = selectBestCandidate(session, phase)

  return {
    question: selected.question,
    phase,
    reason: selected.reason,
    ranked: selected.ranked
  }
}
