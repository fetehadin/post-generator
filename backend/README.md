# Backend

FastAPI app: imports, embeddings, search, drafting and the HTTP API. Phase 1 (Telegram, one dev user) is built.

## Setup (once)

```bash
docker compose up -d                 # from the repo root: Postgres + pgvector
cd backend
python3 -m venv .venv
source .venv/bin/activate            # every new terminal: run this line again
pip install -e ".[dev]"
alembic upgrade head                 # create or update the tables
```

Your prompt shows `(.venv)` when the environment is active. Settings come from the repo's `.env` (see `.env.example`).

## Login (Phase 2)

Supabase handles sign-up and login in the browser; the API only checks the token. Settings (names only; values go in the repo's `.env`, never in git):

| Variable | What |
|---|---|
| `SUPABASE_URL` | Your project URL, e.g. `https://abcd.supabase.co`. The API reads the signing keys from `/auth/v1/.well-known/jwks.json`. |
| `SUPABASE_JWT_SECRET` | Only for older projects that sign with one shared secret. Leave empty otherwise. |
| `ALLOWED_EMAILS` | Comma-separated emails that join without an invite (the team). |

With neither Supabase variable set and `APP_ENV=development`, requests without a token act as the dev user, so local work needs no login. Invite a tester with `python -m app.dev invite --email them@example.com`.

## Run the Phase 1 demo

**In the browser (no frontend needed):**

1. `uvicorn app.main:app --reload`, then open <http://localhost:8000/docs>.
2. `POST /api/v1/imports`: platform `telegram`, file = your channel's `result.json`. You'll see e.g. `"parsed": 412`.
3. `GET /api/v1/imports/{id}` until `"status": "done"`. The free Gemini tier embeds about 100 posts a minute.
4. `POST /api/v1/drafts/generate` with `{"platform": "telegram", "topic": "what you did today"}`. A draft in your voice comes back.
5. `GET /api/v1/drafts/{id}/prompt` shows the exact prompt that produced it.

**From the terminal (same steps, no server):**

```bash
python -m app.dev import-telegram path/to/result.json
python -m app.dev embed
python -m app.dev search "a topic"          # the 8 posts the prompt would use
python -m app.dev draft "today's check-in" [--show-prompt]
python -m app.dev eval                      # the ten test topics → evals/out/ report
```

## Checks

```bash
ruff check . && ruff format --check . && pytest
```

Database tests need the Docker database running; without it they're skipped with a clear reason.

## Layout

```text
backend/
├── app/
│   ├── main.py         FastAPI app: routes under /api/v1, CORS, error handlers
│   ├── api/            Thin routes: imports, posts, drafts, health
│   ├── schemas.py      Request/response models (mirror docs/API.md)
│   ├── services/       posts (save), embedding (queue), retrieval (search), drafting
│   ├── ai/             client.py (embed, generate, fallback chain), prompts/draft.md
│   ├── importers/      telegram.py (x.py, linkedin.py in Phase 3)
│   ├── models/         SQLAlchemy models
│   ├── core/           config, db (per-user sessions), auth (dev user until Phase 2), errors
│   ├── counting.py     Length per platform rule (X weighted)
│   ├── evals.py        The ten test topics
│   └── dev.py          Developer commands (python -m app.dev …)
├── evals/topics.json   The ten test topics (reports in evals/out/, git-ignored)
├── migrations/         Alembic (every user table has row-level security)
└── tests/
```

Rule: every call to an AI provider goes through `app/ai/client.py`. Nothing else imports a provider SDK.

Working rules for humans and Claude: [`CLAUDE.md`](CLAUDE.md).
