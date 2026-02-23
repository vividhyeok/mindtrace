# mindtrace 개발 공유 문서

## 마지막 업데이트
- 일시: 2026-02-23 16:43:00 KST
- 단계: 품질 고도화 + 안정성 보강 1차

## 프로젝트 목표
- 친구용 invite-code 기반 성향 테스트
- MBTI + Enneagram 동시 추론
- OpenAI o3 단일 모델 사용 (서버 경유)
- Nuxt 3 + TypeScript + UnoCSS 기반 반응형 SPA UX

## 현재 구현 상태
- [x] Nuxt 3 + TS + UnoCSS 세팅
- [x] `/` 게이트 + `/api/auth`
- [x] `/test` + `/api/start` `/api/answer`
- [x] `/result` + `/api/finalize`
- [x] `/api/session/:id` `/api/result/:id` (resume/debug)
- [x] in-memory 세션/리포트 저장
- [x] OpenAI Responses API(o3) + JSON 파싱/repair
- [x] OPENAI_API_KEY 미설정 시 mock/fallback 동작
- [x] share-card 9:16 / 1:1 + html2canvas export + caption copy
- [x] README + `.env.example`

## 저장소 구조 (현재)
```text
mindtrace/
├─ .env.example
├─ .gitignore
├─ README.md
├─ app.vue
├─ dev.md
├─ nuxt.config.ts
├─ package.json
├─ tsconfig.json
├─ uno.config.ts
├─ assets/
│  └─ css/main.css
├─ components/
│  ├─ ResultBadge.vue
│  └─ ShareCard.vue
├─ composables/
│  ├─ useApiClient.ts
│  └─ useClientSession.ts
├─ middleware/
│  └─ require-auth.ts
├─ pages/
│  ├─ index.vue
│  ├─ test.vue
│  └─ result.vue
├─ public/
│  └─ characters/mindtrace-buddy.svg
├─ server/
│  ├─ api/
│  │  ├─ auth.post.ts
│  │  ├─ start.post.ts
│  │  ├─ answer.post.ts
│  │  ├─ finalize.post.ts
│  │  ├─ result/[id].get.ts
│  │  └─ session/[id].get.ts
│  └─ utils/
│     ├─ auth.ts
│     ├─ config.ts
│     ├─ constants.ts
│     ├─ inference.ts
│     ├─ json.ts
│     ├─ logger.ts
│     ├─ openai.ts
│     ├─ probability.ts
│     ├─ questions.ts
│     └─ store.ts
└─ types/
   └─ mindtrace.ts
```

## 핵심 구현 메모
- 인증
  - `APP_PASSCODE` 일치 시 단기 토큰 발급
  - 모든 API에서 토큰 검증
- 추론
  - deterministic 업데이트(축 점수/softmax) + o3 분포 보정 blend
  - 초반 6문항 curated, 이후 adaptive
  - conflict/uncertainty 기반 다음 질문 생성
- 종료 조건
  - 최대 28문항(환경변수 override)
  - MBTI/Ennea confidence 임계 통과 시 조기 종료
- 결과
  - MBTI/Ennea 후보 확률 + wing/quadra + narrative/misperception
- 공유
  - `ShareCard.vue`에서 ratio별 렌더링
  - `html2canvas`로 PNG 다운로드

## 향후 수정 방향 (누적 백로그)
1. 세션 영속화: Redis/KV/DB 연결로 서버 재시작/서버리스 리셋 대응
2. 추론 안정화: 질문 문항 품질 필터 강화(금칙어/길이/중복도)
3. 관찰 가능성: request id, latency, model fallback 비율 메트릭 추가
4. 프론트 UX: 테스트 중 이탈/복귀 UX 강화, 에러 토스트/재시도 UX 보강
5. 보안: rate-limit 및 passcode brute-force 방어 추가
6. 품질: E2E/통합 테스트 도입

## 작업 로그 (누적)
- 2026-02-23 16:24:43 KST
  - 스타일 엔진을 Tailwind에서 UnoCSS로 전환 (Nuxt-native 안정성 우선)
  - `.env.example` 추가
  - Nuxt 3.17.7 기준 프로덕션 빌드 통과 확인
- 2026-02-23 16:11:42 KST
  - MVP 초기 구현 완성
  - 문서화(README, dev.md, .env.example)
- 2026-02-23 16:43:00 KST
  - 변경 요약: 질문 품질 필터 강화(길이/금칙어/추상성/중복도), 질문 재생성(최대 2회)+curated fallback, auth/session rate limit, API requestId+latency 관찰성, `/test` 이어하기/새로시작 UI 정리, `/result` 다시 불러오기 UX 추가
  - 영향 범위(파일/기능): `server/utils/questions.ts`, `server/utils/inference.ts`, `server/utils/openai.ts`, `server/utils/json.ts`, `server/utils/observability.ts`, `server/utils/rate-limit.ts`, `server/api/*.ts`, `pages/test.vue`, `pages/result.vue`, `README.md`
  - 다음 액션: 운영 로그 기반으로 질문 필터 임계값/중복도 기준 튜닝, rate limit 한계값 실사용 트래픽 기준 미세 조정, in-memory 제한을 KV/Redis로 이전 검토

---

### 다음 업데이트 작성 규칙
- 새 변경이 생기면 아래 형식으로 **맨 아래에 추가**:
  - `YYYY-MM-DD HH:mm:ss TZ`
  - 변경 요약
  - 영향 범위(파일/기능)
  - 다음 액션
- 2026-02-23 17:16:47 KST
  - 변경 요약: `/` 첫 화면을 미니멀 카피(제목+보조문구+CTA)로 정리하고, 초대코드 입력을 모달 UX로 전환(배경 클릭/ESC 닫기 포함). 인증 로직(`/api/auth` 호출, 토큰 저장, `/test` 이동)은 기존 그대로 유지.
  - 영향 범위(파일/기능): `pages/index.vue`(카피/레이아웃/모달 입력 UX), `app.vue`(`/`에서 상단 브랜드 헤더 숨김), `components/BaseButton.vue`/`components/BaseInput.vue`(공통 UI 컴포넌트 재사용 기반)
  - 다음 액션: 실제 모바일 디바이스에서 키보드 오픈 시 모달 입력 가시성 점검, 필요 시 모달 내부 스크롤/포커스 트랩 보강
- 2026-02-23 17:46:43 KST
  - 변경 요약: 질문 생성 규칙을 단일 축/맥락 명시 중심으로 강화하고, 질문 품질 필터에 맥락 모호성·사회적 바람직성·비교 축 과다·겉/속 혼합 검사를 추가. conflict 신호가 높을 때만 겉/속 불일치 확인 문항을 허용하도록 생성 프롬프트와 fallback 세트를 동기화.
  - 영향 범위(파일/기능): `server/utils/questions.ts`(curated/fallback 문항 개편, 품질 필터 확장), `server/utils/inference.ts`(질문 생성 프롬프트 강화, reject/retry/fallback/ambiguity 로그)
  - 다음 액션: 운영 로그에서 `question.filter.reject` 상위 사유(특히 context/axis mix) 비율 확인 후 임계값 미세 조정, 업무/사적 맥락 문항 비율을 데이터 기반으로 튜닝
- 2026-02-23 17:58:50 KST
  - 변경 요약: 세션 만료(401) 시 클라이언트가 멈추지 않도록 자동 복구 흐름 추가. API 요청에서 401 감지 시 토큰/세션을 즉시 정리하고 `/`로 리다이렉트하도록 처리했으며, 라우트 가드에서도 만료 시 세션 정리를 함께 수행하도록 보강.
  - 영향 범위(파일/기능): `composables/useApiClient.ts`(401 공통 처리/리다이렉트), `middleware/require-auth.ts`(만료 시 `clearSession` 포함)
  - 다음 액션: 서버 메모리 토큰 초기화(재시작/배포) 상황에서도 사용자 이탈이 최소화되도록 게이트 화면에 재입장 안내 문구를 짧게 추가 검토
