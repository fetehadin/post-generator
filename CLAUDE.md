# Voxlace (post-generator)

Voxlace learns a user's writing voice from their exported posts and drafts platform-specific posts for X, LinkedIn and Telegram. The user reviews, schedules and approves every post. It uses RAG over the user's own posts; no model is ever trained.

Built by two junior developers (Fetehadin, Nezira) who are learning while shipping. Treat every task as a chance to teach: when you introduce a library, pattern or non-obvious decision, explain it in 2–3 plain sentences in your final message.

## Source of truth

Read the relevant doc before changing behaviour. Don't contradict it; if the code needs to differ, update the doc in the same change.

- `docs/SRS.md` — requirements. Every feature maps to an FR-/NFR- id. Cite the id in commits and PRs.
- `docs/BUILD_PLAN.md` — phases and what belongs in each. Don't build ahead of the current phase.
- `docs/API.md` — the backend ↔ frontend contract. Change it in the same PR as any endpoint change.
- `CONTRIBUTING.md` — branches, commits, reviews, definition of done.

**Current phase:** 0 — Foundations. (Update this line when a phase's demo passes.)

## Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 (sync, psycopg 3), Alembic |
| Database | PostgreSQL 18 + pgvector, row-level security |
| AI | Gemini via `google-genai`: `gemini-embedding-2` at 768 dims; Gemini Flash for text; one free fallback provider |
| Frontend | React + Vite + TypeScript, React Router, TanStack Query, Tailwind CSS, FullCalendar |
| Auth | Supabase Auth for login only (JWT); all data lives in our own Postgres |
| Publishing | Telegram Bot API (worker sends at due time), X web intent, LinkedIn copy + open composer |
| Hosting | One Contabo VPS: Docker Compose with Caddy, api, worker, db |
| Quality | Ruff, pytest, Vitest, Prettier, GitHub Actions |

Don't add or swap a major dependency (framework, ORM, database, auth, state library) without asking first.

## Repo map

```
backend/    FastAPI app, worker, migrations, tests     → see backend/CLAUDE.md
frontend/   React app                                  → see frontend/CLAUDE.md
deploy/     Production compose, Caddyfile, backups     → see deploy/README.md
samples/    Small anonymised exports for parser tests
docs/       SRS, build plan, API contract
docker-compose.yml   Local Postgres + pgvector (port 5432)
```

## Commands

```bash
docker compose up -d                          # local database (pgvector enabled on first start)
cd backend && uvicorn app.main:app --reload   # API on :8000, docs at /docs
cd backend && python -m app.worker            # worker (Phase 5+)
cd backend && ruff check . && ruff format --check . && pytest
cd backend && alembic upgrade head            # apply migrations
cd frontend && npm run dev                    # app on :5173
cd frontend && npm run lint && npm test && npm run build
```

Run the checks for every part you touched before saying a task is done.

## Non-negotiable rules

1. **User isolation.** Every user-owned table has `user_id`. Every query filters by the current user, and RLS enforces it too. Never accept `user_id` from the request body; take it from the verified token.
2. **AI calls go through `backend/app/ai/client.py` only.** No other module imports a provider SDK. Model names come from settings, never hard-coded.
3. **Embeddings are fixed.** `gemini-embedding-2`, 768 dimensions. Stored posts use `title: none | text: <post>`, queries use `task: search result | query: <text>`. One content object per post: a plain list returns one merged vector. Never fall back to another embedding model; queue and retry instead.
4. **Never publish without approval.** Nothing is sent to any platform unless the draft's status is `approved` by the user. The worker only sends approved, due, unsent Telegram posts.
5. **No passwords, no scraping.** Never ask for social platform passwords. Only the user's own exports and official tokens.
6. **Times are UTC** in the database and API. Convert to the user's time zone only in the UI.
7. **Schema changes only through Alembic migrations.** Never edit the database by hand or change an applied migration.
8. **Platform rules live in the `platform_profiles` table**, not in code constants (seed data is fine).
9. **Log every prompt.** Each generated draft saves its exact prompt, model and provider to `prompt_logs`.
10. **Drafts state only given facts:** the summary card, the day's check-in, approved GitHub items. Prompts must say so.

## Security and privacy

- Never read, print or commit `.env` or any key. Use `.env.example` to learn variable names.
- Never commit real exports or personal data. Tests use `samples/` only.
- Don't log post text, prompts or tokens at INFO level in production.
- Uploaded files are parsed, then deleted. Only cleaned, user-reviewed text reaches the AI.

## How to work on a task

1. Find the FR-/NFR- id and the phase. If the task belongs to a later phase, say so before building it.
2. For anything touching more than ~3 files, write a short plan first and wait for approval.
3. If an endpoint changes, update `docs/API.md` first, then the code.
4. Write or update tests with the change. Parsers, counters, retrieval filters and auth checks always get tests.
5. Run the checks. Fix failures; don't skip or delete tests to make them pass.
6. Finish with: what changed, which requirement it covers, how you tested it, anything left open, and the teaching note.

## Git

- Never commit to `main` or push to it. Work on a branch: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Small commits in the form `type(scope): what and why`, e.g. `feat(import): skip Telegram service messages (FR-2)`.
- Never force-push, rewrite shared history or delete branches you didn't create.
- Open PRs with the template in `.github/PULL_REQUEST_TEMPLATE.md`.

## Ask before you

- Change the database schema in a way that drops or renames data.
- Touch auth, RLS policies or anything in `deploy/`.
- Add a dependency, a new service or a paid API.
- Change prompt templates in a way that affects all users (show before/after on the ten test topics).

## Known gotchas

- X `tweets.js` is JavaScript, not JSON: strip `window.YTD.tweets.part0 =`; counts are strings; times are UTC.
- LinkedIn `Shares.csv` has text and dates only, no engagement numbers.
- Telegram `result.json` text can be a string or a list of string/entity parts. Flatten it.
- X length is weighted: URLs count 23, most emoji 2, CJK characters 2. Never use plain `len()`.
- pgvector: start without a vector index (exact search). Query shape is `ORDER BY embedding <=> :q LIMIT :n`.
- Gemini free tier returns 429 under load. Back off and retry; keep the user's input.
- Telegram bots can't use Telegram's native scheduled messages. Our worker sends at the due time.
