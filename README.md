# mindtrace (MVP)

Invite-code gated MBTI + Enneagram web app built with Nuxt 3.

- Stack: Nuxt 3, Vue 3, TypeScript, UnoCSS
- Model: OpenAI `o3` (server-side only)
- UI: Soft Pop (cute pastel cards)
- Flow: Gate (`/`) -> Test (`/test`) -> Result (`/result`)
- Share export: `html2canvas` (9:16 story, 1:1 feed)

## Features

- Invite code gate using `APP_PASSCODE`
- Short-lived auth token issued by `/api/auth` and required on every API call
- Server-only OpenAI access via `OPENAI_API_KEY`
- Adaptive yes/no questioning (Akinator-style selection engine)
  - Questions are served from prebuilt question bank (no runtime question generation)
  - Each answer updates MBTI/Enneagram deterministically
  - Next question is selected by split score (uncertainty/candidate separation/duplication penalty)
  - 3-phase flow: Phase A axis scan -> Phase B tie-break -> Phase C validation
- Deterministic probability engine (runtime LLM 호출 최소화)
- Early-stop thresholds with max-question cap
- In-memory abuse protection
  - `/api/auth` IP rate limit + temporary cooldown after repeated failures
  - `/api/answer` and `/api/finalize` per-session burst throttling
- Final result includes:
  - MBTI top + candidates
  - Enneagram top + candidates
  - nickname (metaphorical)
  - narrative (analysis 60 + counseling 40)
  - misperception vs reality paragraph
  - short caption for sharing
- Mock/fallback mode if `OPENAI_API_KEY` is missing

## Route Overview

- `GET /` Gate page
- `GET /test` Test flow page
- `GET /result` Result/share page

Server API routes:

- `POST /api/auth` `{ passcode }`
- `POST /api/start` `{ token }`
- `POST /api/answer` `{ token, sessionId, questionId, answer }`
- `POST /api/finalize` `{ token, sessionId }`
- `GET /api/session/:id?token=...` (debug/resume)
- `GET /api/result/:id?token=...` (result fetch)

## Environment Variables

See `.env.example`.

- `OPENAI_API_KEY` optional (used for finalize narrative only)
- `APP_PASSCODE` required for invite-code gate
- `LOG_LEVEL=basic|full`
- `MAX_QUESTIONS` optional (default `20`)
- `MIN_QUESTIONS` optional (default `8`)
- `SESSION_TTL_MINUTES` optional (default `180`)

## Setup

```bash
npm install
cp .env.example .env
# edit .env
npm run dev
```

Open `http://localhost:3000`.

## Production Build

```bash
npm run build
npm run preview
```

## Deploy to Vercel

1. Push repo to GitHub.
2. Import project in Vercel.
3. Framework preset: Nuxt.
4. Set environment variables in Vercel Project Settings:
   - `OPENAI_API_KEY`
   - `APP_PASSCODE`
   - `LOG_LEVEL`
   - `MAX_QUESTIONS` (optional)
   - `SESSION_TTL_MINUTES` (optional)
5. Deploy.

## Security Notes

- OpenAI key is never sent to client.
- All model calls are under `server/api` routes.
- Auth token is required for all session/result endpoints.
- Invite code is validated server-side with timing-safe compare.
- Simple in-memory rate limit/cooldown is enabled for auth and session actions.
- For MVP, session/token/report state is in-memory only.
  - Server restart or serverless cold replacement can clear active sessions.
  - Rate-limit state is also reset on restart.

## Question Engine

Question runtime is selection-centric, not generation-centric.

- Question bank items include metadata:
  - `context`, `mode`, `pattern`, `cooldownGroup`, `ambiguityScore`, `qualityScore`
  - yes/no transition deltas for MBTI axis + Enneagram scores
- Selector scores candidates each turn and picks the highest:
  - axis uncertainty gain
  - MBTI top-candidate split
  - Enneagram split
  - novelty/cooldown penalties
  - ambiguity penalty / quality bonus
- `LOG_LEVEL=full` exposes:
  - `question.source=bank`
  - `question.select.score`
  - `question.select.reason`
  - phase / early-stop checks

## Rate Limit / Cooldown (MVP)

- `POST /api/auth`
  - IP-based sliding-window rate limit
  - repeated passcode failures trigger short cooldown (in-memory)
- `POST /api/answer`, `POST /api/finalize`
  - sessionId-based minimum interval + burst limit
  - blocks very rapid repeated calls

MVP note: these limits are memory-backed and not distributed across instances.

## Logging

`LOG_LEVEL` controls server log verbosity.

- `basic`: minimal operational logs
- `full`: includes debug details (question targets, score updates, conflicts, distributions)
- API observability logs include:
  - `requestId` per request
  - endpoint latency (`latencyMs`)
  - deterministic update/selection timing
  - OpenAI success/failure, JSON repair usage, fallback usage (finalize only)
  - question selection score/reason (full)

In production, verbose logs are suppressed to minimal output.

## Placeholder Character Asset

Current placeholder asset:

- `public/characters/mindtrace-buddy.svg`

To replace with your own character image:

1. Add your asset under `public/characters/`.
2. Update path in `components/ShareCard.vue`.
3. Keep license-safe assets only.

## MVP Limitation

- In-memory store is intentionally simple for MVP.
- For durable sessions, replace memory maps with Redis/KV/DB later.
