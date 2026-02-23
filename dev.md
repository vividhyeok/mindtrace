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
