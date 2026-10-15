# CLAUDE.md

Guidance for AI coding agents working in this repo. Humans: start with [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## What this is

**Voxlace**: a multi-user web app that learns a user's writing voice from their exported posts (X, LinkedIn, Telegram) and drafts new posts using RAG (pgvector retrieval + Gemini). No model training. The user approves every post.

- **Requirements (source of truth):** [docs/SRS.md](docs/SRS.md). Requirement IDs are `FR-n` / `NFR-n` / `C-n`. Cite them in commits, PRs and tests.
- **Build order and who owns what:** [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md). Build only the current phase. Ideas for later phases go to the "Later" column, not into code.
- **API contract:** [docs/API.md](docs/API.md). Change it in the same PR as the code.
- **Unresolved design questions:** [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md). Check it before designing schema, auth, jobs or parsers.

**Current phase:** 0 (Foundations). No backend or frontend code exists yet.

## Stack

- Backend: Python 3.12+, FastAPI, Pydantic v2 (settings via `pydantic-settings`), SQLAlchemy 2.x, Alembic, psycopg 3 (`postgresql+psycopg://`), `pgvector` Python package, `google-genai` SDK. Ruff + pytest.
- Frontend: React + Vite, Vitest, Prettier. FullCalendar in Phase 5.
- DB: Postgres 18 + pgvector (`pgvector/pgvector:pg18`) via `docker compose`; Supabase in production.

## Commands

```bash
docker compose up -d                       # database (reads POSTGRES_PORT from .env)
cd backend && uvicorn app.main:app --reload   # API at :8000, docs at /docs
cd backend && alembic upgrade head          # must use MIGRATIONS_DATABASE_URL (owner), not DATABASE_URL
cd backend && ruff check . && ruff format --check . && pytest
cd frontend && npm run dev                 # :5173
cd frontend && npm test
```

## Invariants: never break these

1. **Every user-owned row has `user_id`, and every query filters on it**, even in Phase 1 with the hard-coded dev user. A missing `user_id` filter is the worst bug this app can have (FR-29, NFR-7). From Phase 2, RLS is the second layer, and the API must connect as a non-owner role or RLS is bypassed (OPEN_QUESTIONS Q1).
2. **All AI calls go through `backend/app/ai/client.py`.** Nothing else imports `google.genai` or any provider SDK. Model names come from settings, never literals (NFR-9).
3. **The embedding model is fixed** (C-7). There is no embedding fallback, ever. Embedding text format (SRS §5.3): documents `title: none | text: <post>`, queries `task: search result | query: <topic>`, `output_dimensionality=768`, **one content object per post** (a plain list of strings returns one merged embedding).
4. **Never invent facts in drafts** (FR-19). Prompts may use facts only from the summary card, the check-in and approved GitHub items.
5. **Every draft logs its exact prompt, model and provider** (NFR-15).
6. **Store UTC, display local** (NFR-16). Use `timestamptz` columns and timezone-aware `datetime` objects only.
7. **Nothing publishes without an explicit user approval** (NFR-6). Cron only sends drafts with status `approved`, and must be safe to run twice.
8. **Errors use one shape:** `{"error": {"code", "message"}}`. Return 404 `not_found` for other users' resources, never 403 (it would reveal that the resource exists).
9. **Imports are atomic** (FR-3): parse fully, then write in one transaction. Dedupe on `(user_id, platform, external_id)` (FR-2).
10. **Raw uploads are never sent to the AI and never stored** after parsing (NFR-11, FR-39).

## Data and privacy rules for agents

- Never commit `.env`, keys, tokens or real exports. Real exports go in `samples/private/` (git-ignored).
- Parser tests use only the synthetic files in `samples/`. Their expected counts and the format traps they contain are in [samples/README.md](samples/README.md). Keep that table in sync when samples change.
- Don't paste a user's real posts into fixtures, logs or commit messages.

## Conventions

- Schema changes only through Alembic migrations. Schema changes are joint decisions (both devs review).
- Branches `feat|fix|chore|docs/<short-name>`. Conventional commits `feat(import): …`. PRs under ~400 lines, squash merge.
- Python: type hints on public functions; Ruff format. JS: function components + hooks; Prettier defaults.
- Tests: parsers, counters, retrieval filters and auth checks always get tests. Any feature touching user data gets a **two-user test** (user B can't see user A's data).
- Indent: 4 spaces in Python, 2 elsewhere (`.editorconfig`).

## Database roles

- `voxlace` (`POSTGRES_USER`) is the superuser and table owner. Only Alembic uses it (`MIGRATIONS_DATABASE_URL`).
- `voxlace_app` (`APP_DB_USER`) is what the API uses (`DATABASE_URL`). It can read and write rows but can't change the schema, and it doesn't bypass RLS. New tables get its grants automatically (default privileges in `db/init/002_app_role.sh`).
- RLS pattern: `ENABLE ROW LEVEL SECURITY` plus a policy on `user_id = current_setting('app.user_id', true)::uuid`. The API runs `SET LOCAL app.user_id = …` at the start of each request's transaction. With nothing set, the app role sees 0 rows.

## Known environment gotchas

- A native Postgres may already listen on 5432. Set `POSTGRES_PORT=5433` in `.env` and use the same port in `DATABASE_URL`.
- `db/init/*.sql` runs **only on an empty volume**. After changing it, run `docker compose down -v && docker compose up -d` (this destroys local data).
- Gemini free tier: low requests-per-minute, quota shared across all users, resets at midnight Pacific. Batch, back off on 429, and never re-embed a post that already has a vector.
- Telegram export `date` is the exporter's local time. Use `date_unixtime`. X `full_text` is HTML-escaped and has `t.co` links. LinkedIn CSV fields contain newlines.
