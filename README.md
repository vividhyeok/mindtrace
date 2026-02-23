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
- Adaptive yes/no questioning
  - First 6 questions are curated baseline
  - Then adaptive questions from uncertainty/conflicts
  - Generated question quality filter + regeneration + curated fallback
- Deterministic probability engine + o3 calibration
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

- `OPENAI_API_KEY` required for real o3 inference
- `APP_PASSCODE` required for invite-code gate
- `LOG_LEVEL=basic|full`
- `MAX_QUESTIONS` optional (default `28`)
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

## Question Quality Filter

For model-generated adaptive questions, the server applies validation before serving:

- Length must be `18~70` chars.
- Must look like a yes/no behavior statement.
- Forbidden expressions are blocked:
  - `보통`, `가끔`, `대체로`, `상황에 따라`, `사람마다`, `케바케`, `종종`, `때때로`
- Abstract/definition-like wording is filtered.
- Similarity against recent questions is checked to reduce duplicates.
- On validation failure:
  - regenerate up to 2 times
  - then fall back to curated question pool

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
  - OpenAI success/failure, JSON repair usage, fallback usage
  - question filter fail reasons / regeneration / fallback (full)

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
