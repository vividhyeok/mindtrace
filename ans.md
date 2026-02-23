# 왜 응답 5까지 빠르고, 6부터 느려지나

## 결론
`응답 6` 시점이 **큐레이티드(고정) 문항 -> 어댑티브(모델 생성) 전환점**이라서 느려집니다.

## 코드 기준으로 정확한 이유
1. 초기 고정 문항 수가 6개로 설정됨  
`server/utils/constants.ts`의 `BASE_CURATED_QUESTION_COUNT = 6`

2. 응답 1~5는 대부분 로컬 계산 + 다음 고정 문항 꺼내기라 빠름  
`/api/answer`에서 `nextIndex < curatedQuestionCount()`면 `getCuratedQuestionByIndex()` 사용

3. 응답 6부터는 어댑티브 로직으로 들어가면서 서버 작업이 급격히 늘어남  
- 분포 보정 모델 호출: `requestDistributionUpdate(...)`  
- 다음 질문 생성 모델 호출: `generateAdaptiveQuestionDetailed(...)`  
- 질문 품질 필터/재생성(최대 2회)까지 가능

4. 전환 시점(응답 6)에는 모델 보정을 강제로 1번 수행하도록 되어 있음  
`getCalibrationDecision()`에서 `answerCountAfter === curatedQuestionCount()`이면 `adaptive_transition`으로 모델 보정 실행

5. prefetch가 이 전환 지점에는 거의 도움을 못 줌  
prefetch는 “이미 어댑티브 질문이 화면에 떠 있는 상태”에서 다음 yes/no 분기를 미리 만드는 구조라,  
**큐레이티드 마지막 질문(6번) 답변 시점**에는 보통 `prefetch miss`가 발생합니다.

6. OpenAI 호출 자체도 지연 상한이 큼  
`server/utils/openai.ts`에서 1회 호출 타임아웃이 20초이고, JSON 파싱 실패 시 재시도 1회가 있어 지연이 커질 수 있습니다.

## 그래서 화면에서 보이는 현상
- 응답 5까지: 거의 즉시 다음 질문
- 응답 6 이후: `응답 처리 중 / 다음 질문 준비 중...` 상태가 길어짐

## 로그에서 확인할 포인트
- `answer.metrics`의 `modelUpdateMs`, `questionGenerationMs`
- `prefetch.miss` (특히 reason: `not_found`, `inflight`)
- `openai.success` / `openai.parse_failed` / `openai.fallback`

위 세 로그가 크게 튀면, 현재 느림은 UI 문제가 아니라 `/api/answer`의 어댑티브 전환 비용 때문입니다.
