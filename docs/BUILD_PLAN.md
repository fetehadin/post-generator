# Build Plan — Voxlace V1

How two developers take Voxlace from an empty repo to a private beta. It covers the order to build in, who does what, how each cycle runs, and which tools you meet along the way.

> You don't need to understand every phase today. Read the **big picture** once, then only read the phase you're in. Each phase teaches you what the next one needs.

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [The two tracks (who does what)](#2-the-two-tracks-who-does-what)
3. [The phases](#3-the-phases)
4. [How a cycle works](#4-how-a-cycle-works)
5. [Git and GitHub workflow](#5-git-and-github-workflow)
6. [Definition of done](#6-definition-of-done)
7. [Tools you'll use, by phase](#7-tools-youll-use-by-phase)
8. [Learn just in time](#8-learn-just-in-time)
9. [Risks to watch](#9-risks-to-watch)

---

## 1. The big picture

### What you're building, in one paragraph

A user uploads their old posts. The backend splits them into rows, turns each into an **embedding** (768 numbers that capture meaning) and stores it in **Postgres + pgvector**. When the user asks for a draft, the backend embeds the topic, finds their most similar past posts, and builds a prompt from four things: those examples, their voice card, today's check-in, and the platform's rules. It sends that prompt to **Gemini**, saves the draft, and shows it in **React**. The user edits it, schedules it on the calendar and approves it. X and LinkedIn get a hand-off; Telegram is sent by the bot: a **worker** running beside the API on your Contabo server checks every minute and sends scheduled posts on time.

### The order you build in

You build **bottom-up through the data, but in thin end-to-end slices**: database first, then the AI loop on one platform, then accounts, then everything else.

```mermaid
flowchart TD
    P0["Phase 0 — Foundations<br/>repo · Docker Postgres+pgvector · FastAPI · React · CI"]
    P1["Phase 1 — Core voice loop<br/>Telegram import → embed → retrieve → draft"]
    P2["Phase 2 — Accounts & isolation<br/>login · invites · user_id everywhere · RLS"]
    P3["Phase 3 — All platforms & voice<br/>X + LinkedIn import · voice cards · profile · settings"]
    P4["Phase 4 — Drafting workflow<br/>chat board · revisions · library · hand-off"]
    P5["Phase 5 — Calendar & Telegram publishing<br/>calendar · bot connect · worker sender · reminders"]
    P6["Phase 6 — SaaS hardening & deploy<br/>fallback models · limits · export/delete · backups"]
    P7["Phase 7 — Private beta<br/>invite testers · metrics · fix what hurts"]
    P0 --> P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7
    P7 -.-> S["Stretch: GitHub context · posting windows · resume import · idea inbox"]
```

**Why this order:**

- **Phase 1 is the riskiest part.** If drafts don't sound like you, nothing else matters. Prove it early, with no UI polish.
- **Accounts come before the second platform**, so `user_id` and row-level security are in place before tables multiply.
- **Publishing comes late** because it only matters once drafts are good.
- **Deploy happens before the beta, not at the very end of everything.** Do a first deploy to the Contabo server in Phase 2 so hosting surprises show up early.

### What happens when a user clicks "Generate"

```mermaid
sequenceDiagram
    actor U as User
    participant FE as React
    participant API as FastAPI
    participant DB as Postgres + pgvector
    participant AI as Gemini (→ fallback)
    U->>FE: Topic + platform
    FE->>API: POST /drafts/generate (login token)
    API->>API: Verify token, check daily limit
    API->>AI: Embed "task: search result | query: <topic>"
    AI-->>API: 768 numbers
    API->>DB: 8 nearest posts for this user + platform<br/>(+ pinned, − excluded)
    API->>DB: Voice card, summary card, today's check-in, platform rules
    API->>AI: Prompt → generate
    AI-->>API: Draft text (or fail → next model in chain)
    API->>DB: Save draft, version, prompt log, usage row
    API-->>FE: Draft + length count
    FE-->>U: Review, edit, schedule, approve
```

---

## 2. The two tracks (who does what)

Split by **track**, not by frontend/backend. Each track owns a feature from database to screen, so neither of you waits on the other for long.

| Track | Owns | Starts with |
|---|---|---|
| **A — Data & AI** | Parsers, embeddings, retrieval, prompts, voice cards, model fallback, quality checks | **Fetehadin** |
| **B — App & Platform** | Auth, API endpoints and validation, React screens, calendar, Telegram bot, worker, server and deploy | **Nezira** |
| **Together** | Schema changes, the API contract for each slice, demos, reviews | Both |

**Rules for the split**

1. **Swap tracks after Phase 3.** Both of you should be able to explain the whole system by the beta.
2. **Every pull request is reviewed by the other person.** That's how each of you learns the other track.
3. **Schema changes are joint.** One person writes the Alembic migration; the other reviews it before anyone builds on it.
4. **The API contract comes first.** Agree request/response shapes in [`API.md`](API.md) before coding a slice. Track B then builds the screen against fake data while Track A builds the logic.
5. **Blocked for more than an hour? Say so.** Pair on it instead of waiting.

---

## 3. The phases

Each phase lists its goal, the tables it adds, the tasks per track, and a **demo** that proves it's done. Don't start the next phase until the demo works on your own real data.

### Phase 0 — Foundations

**Goal:** both of you can clone the repo, run one command, and see the API and the React app talking to a local database.

**Database:** `pgvector/pgvector:pg18` in Docker, `CREATE EXTENSION vector;`, first Alembic migration with `users` and `source_posts`.

| Track A — Data & AI | Track B — App & Platform |
|---|---|
| Request your **X, LinkedIn and Telegram exports today** (LinkedIn takes 1–2 days) | Create the FastAPI app with `/health`, settings loaded from `.env` |
| Get a Gemini API key; read your project's limits in AI Studio | Create the React + Vite + TypeScript app (Tailwind, React Router, TanStack Query) with one page that calls `/health` |
| **Throwaway test:** embed 20 posts at 768 dims, run a cosine search, check the matches make sense | Docker Compose for Postgres; SQLAlchemy + Alembic set up |
| Make small anonymised sample exports in `samples/` | Make CI's backend and frontend jobs pass (workflow already in `.github/workflows/ci.yml`); uncomment pip/npm in `dependabot.yml` |
| Write `ai/client.py` stub: `embed()` and `generate()` with model names from config | Projects board, labels, issue and PR templates; protect `main` (see `docs/CI_CD.md`) |

**Together:** confirm the decisions in the SRS, write the Phase 1 API contract, agree on folder structure.

**Demo:** fresh clone → `docker compose up -d` → backend and frontend running → browser shows "API: ok, DB: ok".

---

### Phase 1 — Core voice loop (Telegram only)

**Goal:** upload your Telegram export and get a draft that sounds like you. No login yet: use one hard-coded dev user, but **put `user_id` on every row anyway**.

**Database:** `source_posts` gets `embedding vector(768)`; add `drafts`, `draft_versions`, `prompt_logs`.

| Track A — Data & AI | Track B — App & Platform |
|---|---|
| Telegram parser: read `result.json`, flatten formatted text, skip empty/service messages | `POST /imports` (multipart) → calls parser, returns counts |
| Dedupe on `(user_id, platform, external_id)`; reject malformed files atomically | `GET /posts` with paging |
| Embedding pipeline: one content object per post, `title: none \| text:` prefix, retry on 429 | Upload page: pick platform, upload, show counts and errors |
| Retrieval: `ORDER BY embedding <=> :q LIMIT 8` filtered by user + platform | Generate page: topic box → draft card with character count |
| Prompt builder + `POST /drafts/generate`; save every prompt to `prompt_logs` | Show the prompt log for a draft (debug view) |
| **Ten fixed test topics** you re-run after every prompt change | |

**Demo:** upload your real Telegram export → see "412 posts imported" → type a topic → get a draft you'd actually post.

> If drafts sound generic, stay here. Tune retrieval count, examples and prompt wording until they don't.

---

### Phase 2 — Accounts and isolation

**Goal:** real login, invite-only, and no way for one user to see another's data.

**Database:** `invites`, `profiles` (empty shell), privacy acceptance on `users`, **row-level security** on every user table.

| Track A — Data & AI | Track B — App & Platform |
|---|---|
| Add RLS policies; write a test that queries as user B and gets none of A's rows | Supabase Auth (login only): sign up, log in, log out in React |
| Replace the dev user with the real `user_id` from the token everywhere | Backend dependency that verifies the JWT on every route (401 if missing) |
| Two-user test: generate for A, assert no B posts in the prompt log | Invite codes: sign-up refused without one |
| | Privacy notice screen; uploads blocked until accepted |
| | **First deploy to Contabo:** SSH keys only, `ufw` (22/80/443), Docker, Caddy with your domain, API + Postgres + built frontend via `deploy/docker-compose.prod.yml` |
| | Turn on the deploy workflow: `production` environment secrets, then `DEPLOY_ENABLED=true` (see `docs/CI_CD.md`) |

**Demo:** two accounts, each imports their own export; neither can reach the other's posts by UI or by calling the API directly.

---

### Phase 3 — All platforms and voice

**Goal:** X and LinkedIn work like Telegram, and each platform has its own voice and rules.

**Database:** `voice_cards`, `platform_profiles` (seeded), `platform_settings`, full `profiles`, `exemplar_posts`.

| Track A — Data & AI | Track B — App & Platform |
|---|---|
| X parser: strip the `window.YTD.tweets.part0 =` wrapper, numbers from strings, skip replies/retweets | Onboarding: About-you form + audience questions + language |
| LinkedIn parser: `Shares.csv` (text + date only) | Settings: tab per platform — rules, voice card, pinned posts |
| Weighted X counter (URL = 23; Ethiopic, CJK and emoji = 2, as twitter-text) with tests | Live length counter on the draft card using the platform rule |
| Voice card + stats per platform; warning under 20 posts; keep hand edits on regenerate | Pin / exclude buttons on posts |
| Summary card from the profile form (~150 words, editable) | Edit platform rules in Settings (no code change) |
| Use pinned/excluded posts in retrieval; exemplar pool for thin histories | |

**Demo:** the same topic produces three clearly different drafts — a tight X post, a LinkedIn post with a strong first line, a Telegram post — each in your voice and language.

**→ Swap tracks after this phase.**

---

### Phase 4 — Drafting workflow

**Goal:** the daily loop feels good: write a check-in, get drafts, revise by chat, keep a library.

**Database:** `checkins`.

| Track A — Data & AI | Track B — App & Platform |
|---|---|
| Revise endpoint: current draft + instruction → new version | Chat board: check-ins and draft requests in one stream with history |
| Facts guard: prompt only allows facts from summary card, check-in, approved items | Draft editor: chat revisions, hand edits, version history |
| Record edit distance between first and final version | Draft library with status filters (draft, approved, published, discarded) |
| | Hand-off: X pre-filled link, LinkedIn copy + open composer, mark as published |

**Demo:** write today's check-in → generate for all three → revise one twice → approve → X opens pre-filled with the right text.

---

### Phase 5 — Calendar and Telegram publishing

> **Changed 22 Oct 2026 (SRS 1.3):** no Telegram bot in V1. This phase is now *Calendar, posting times and reminders*: month/week/day calendar, best hours from audience places and profession (FR-16, FR-34), the app picks the hour on approve (FR-45), in-app reminders and Missed posts (FR-35, FR-42), and a background embedding retry inside the API (NFR-14). The Telegram rows below wait until after V1.

**Goal:** plan the week on a calendar; Telegram posts go out on time by themselves after approval.

**Database:** `telegram_connections`; `drafts.scheduled_for`, `reminder_sent_at`, `published_at` in use.

| Track A — Data & AI | Track B — App & Platform |
|---|---|
| Due-post query: approved + `scheduled_for <= now()` + not yet sent, safe to run twice | Calendar: week and month views, drag to reschedule (store UTC, show local) |
| `worker.py`: every minute, send due Telegram posts and reminders | Telegram connect flow: bot as admin → `getChatMember` check → save |
| Retry + mark failures without double-sending | "Publish now" for Telegram; reminders in the app |
| Lock each due row (`FOR UPDATE SKIP LOCKED`) so a restart never double-sends | Worker service in the production compose file, `restart: unless-stopped` |

**Demo:** approve a Telegram draft for 5 minutes from now, close the laptop, and it appears in your channel on time.

---

### Phase 6 — SaaS hardening and deploy

**Goal:** safe to hand to other people on free tiers.

**Database:** `provider_usage`, `uploads` (if doing resume import later).

| Track A — Data & AI | Track B — App & Platform |
|---|---|
| Model fallback chain from config; record model + provider per draft | Daily limits per user, shown in the app; clear 429 message, input kept |
| Embedding retry queue; never switch embedding models | Export my data (JSON) and delete all my data |
| Daily health check of each model in the chain | Production env vars, CORS, error pages, uptime check |
| | Nightly `pg_dump` copied off the server; test a restore (NFR-17) |
| Run the ten test topics on every fallback model | Warn about cold starts on first load |

**Demo:** turn off the first model in config → drafts still arrive from the second and say so; delete a test account → every row is gone.

---

### Phase 7 — Private beta

**Goal:** learn whether real people publish what Voxlace writes.

| Track A — Data & AI | Track B — App & Platform |
|---|---|
| Metrics: publish rate and edit intensity per user per week | Invite 5–10 testers; onboarding guide on getting exports |
| Read weak drafts' prompt logs weekly; fix prompts | Feedback form; fix the top three pain points each week |

**Set the bar before inviting anyone**, for example "40% of drafts published by week 3". Decide afterwards whether to build stretch features or rework the core.

---

### Stretch (after the core works)

GitHub context (FR-14) · suggested posting windows (FR-16, FR-34) · resume and website import with contact stripping (FR-20, FR-21, NFR-12) · idea inbox · angle suggestions · metrics page.

---

## 4. How a cycle works

### The slice cycle (a few days each)

Every phase is cut into **slices**: small features that work end to end.

```mermaid
flowchart LR
    A[1 · Pick a slice<br/>write 'done when'] --> B[2 · Agree contract<br/>in API.md]
    B --> C[3 · Build in parallel<br/>A: logic · B: UI on fake data]
    C --> D[4 · Wire together<br/>replace fake data]
    D --> E[5 · Test on real exports]
    E --> F[6 · PR + review]
    F --> G[7 · Demo to each other<br/>merge to main]
    G --> H[8 · One-line retro]
    H --> A
```

### The week

| When | What | Time |
|---|---|---|
| Start of week | Pick the slices for the week from the board; each gets an owner and a "done when" | 30 min |
| Every day | Sync: done yesterday, doing today, blocked on | 10 min |
| Mid-week | Re-run the ten test topics if prompts changed | 15 min |
| End of week | Demo on your own data, then retro: keep / change / try | 30 min |

### Work-in-progress limits

- **One slice in progress per person.** Finish before starting another.
- **Ideas mid-slice go to a "Later" column**, not into the code.
- **A slice that grows past a week gets split.**

---

## 5. Git and GitHub workflow

| Thing | Rule |
|---|---|
| `main` | Always runs. Protected: no direct pushes, CI must pass, one approval. |
| Branches | `feat/telegram-parser`, `fix/x-counter-emoji`, `chore/ci-ruff`, `docs/api-imports` |
| Commits | Small, present tense, say why: `feat(import): skip Telegram service messages` |
| Pull requests | Under ~400 changed lines; link the issue; fill in the template; screenshot UI changes |
| Merging | Squash merge; delete the branch |
| Issues | One per task, with a **Done when** line, a track label and a phase label |
| Labels | `track:data-ai`, `track:app`, `phase:0`…`phase:7`, `type:feature`, `type:bug`, `type:chore` |
| Board columns | Backlog → This week → In progress → In review → Done · plus **Later** |

---

## 6. Definition of done

A task is done when **all** of these are true:

- [ ] It does what its "Done when" line says, checked on real data.
- [ ] Tests cover the logic (parsers, counters, retrieval filters, auth checks).
- [ ] CI is green.
- [ ] The other person reviewed and approved the PR.
- [ ] No secrets, personal data or real exports committed.
- [ ] `API.md`, the SRS or the README is updated if the change affects them.
- [ ] It's merged to `main`, and `main` still runs from a fresh clone.

---

## 7. Tools you'll use, by phase

| Phase | Tools |
|---|---|
| 0 | Git, GitHub (Issues, Projects, Actions), Docker + Compose, PostgreSQL + pgvector, Python 3.12, FastAPI, Uvicorn, Pydantic, SQLAlchemy, Alembic, Ruff, pytest, pre-commit, Node LTS, React, Vite, TypeScript, Tailwind CSS, TanStack Query, Vitest, Claude Code with the repo's `CLAUDE.md` files |
| 1 | `google-genai` SDK (`gemini-embedding-2`, Gemini Flash), `pgvector` Python package, Python `json`, FastAPI file uploads |
| 2 | Supabase Auth (login only), JWT verification (`PyJWT`), Postgres row-level security, Contabo VPS, `ufw`, Caddy, production Docker Compose, GitHub Actions deploy over SSH |
| 3 | Python `csv`, Unicode handling for the weighted counter, React forms |
| 4 | Clipboard API, X web intent URLs |
| 5 | FullCalendar (or a simple week grid), Telegram Bot API via `httpx`, a worker process (plain loop or APScheduler) |
| 6 | Second AI provider (Groq, OpenRouter or Mistral), structured logging |
| 7 | Simple metrics queries, a feedback form |
| Stretch | GitHub REST API, `pypdf` / `python-docx`, regex-based contact stripping |

---

## 8. Learn just in time

Learn each topic in the week you need it, by building.

| Before phase | Learn |
|---|---|
| 0 | FastAPI basics (routes, Pydantic models, dependencies) — the Flask course carries over · Docker Compose · Alembic migrations |
| 1 | What embeddings are · cosine distance · pgvector queries · prompt structure with examples (few-shot) |
| 2 | How JWT login works · Postgres row-level security · Linux server basics (SSH keys, firewall) · Caddy reverse proxy |
| 3 | Pandas-free CSV parsing · Unicode and grapheme counting |
| 5 | Time zones (store UTC, display local) · idempotent jobs (safe to run twice) |
| 6 | Retries with backoff · rate limits · fallback patterns |

---

## 9. Risks to watch

| Risk | Early sign | What to do |
|---|---|---|
| Drafts sound generic | You rewrite most of each draft in Phase 1 | Stay in Phase 1; tune examples, count and prompt with the ten test topics |
| Free AI quota runs out | 429s during testing | Embed each post once, cache, back off; add per-user limits early |
| A free model disappears | Fallback fires daily | Keep the chain in config; run the daily health check |
| Scope creep | "Quick" features mid-slice | "Later" column; only the current slice gets built |
| Data leak between users | — | RLS + two-user tests in CI from Phase 2 |
| Server goes down or disk fills | Missed sends, failed uploads | Uptime check, `restart: unless-stopped`, disk alerts, nightly off-server backups |
| One person becomes the bottleneck | PRs wait > 1 day | Review before starting new work; swap tracks after Phase 3 |
