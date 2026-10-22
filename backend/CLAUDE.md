# Backend (FastAPI)

Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2.0 (sync, psycopg 3) · Alembic · pgvector · pytest · Ruff.

## Layout

```
backend/
├── app/
│   ├── main.py            App factory, routers, CORS, error handlers
│   ├── core/
│   │   ├── config.py      Settings (pydantic-settings) — the only place env vars are read
│   │   ├── db.py          Engine, session, per-request RLS user setting
│   │   ├── auth.py        Verify Supabase JWT → current user
│   │   └── errors.py      AppError + handler that returns the API.md error shape
│   ├── api/               One router per resource: imports.py, posts.py, drafts.py …
│   ├── schemas/           Pydantic request/response models (match docs/API.md)
│   ├── models/            SQLAlchemy models, one file per table group
│   ├── services/          Business logic: retrieval.py, drafting.py, voice.py, publishing.py
│   ├── importers/         telegram.py, x.py, linkedin.py — pure functions, no DB access
│   ├── ai/
│   │   ├── client.py      embed(), generate() with the fallback chain — the only SDK user
│   │   └── prompts/       Prompt templates as .md or .txt files, not inline strings
│   └── counting.py        Platform length counting (X weighted rules)
├── migrations/            Alembic
├── tests/                 Mirrors app/; fixtures in conftest.py
└── pyproject.toml
```

Layers call downward only: `api → services → (models, ai, importers)`. Routers stay thin: validate, call one service function, return a schema.

## Commands

```bash
python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
uvicorn app.main:app --reload
alembic revision --autogenerate -m "add drafts table"   # then READ and fix the generated file
alembic upgrade head
pytest                      # all tests
pytest tests/importers -q   # one area
ruff check . --fix && ruff format .
```

## Conventions

- **Type hints** on every function signature. Pydantic models for every request and response body; never return ORM objects directly.
- **Routes are `def`, not `async def`,** because the DB driver and the AI SDK calls are blocking. FastAPI runs them in a thread pool.
- **Errors:** raise `AppError(code, message, status)`; the handler produces `{"error": {"code", "message"}}`. Don't return 403 for another user's resource; return 404.
- **Auth:** every router except `/health` depends on `get_current_user`. The user id comes from the verified JWT `sub` claim.
- **RLS:** `db.py` runs `SET LOCAL app.user_id = :id` at the start of each request transaction. Policies use `current_setting('app.user_id')`. Still filter by `user_id` in queries; RLS is the safety net.
- **Settings:** read env vars only in `core/config.py`. Everything else imports `settings`.
- **Logging:** standard `logging`, module-level `logger = logging.getLogger(__name__)`. No `print`. Never log tokens, keys or full post text.
- **Times:** `datetime` objects are timezone-aware UTC (`datetime.now(UTC)`). Columns use `timestamptz`.

## Database and migrations

- Every user-owned table: `id` (UUID), `user_id` (FK, indexed), `created_at`. Add the RLS policy in the same migration that creates the table.
- Embedding column: `Vector(768)` from `pgvector.sqlalchemy`. Autogenerate doesn't always import it; check the migration's imports.
- Uniqueness for imports: `(user_id, platform, external_id)`, inserted with `ON CONFLICT DO NOTHING`.
- Retrieval: filter `user_id`, `platform`, `excluded = false`, then `ORDER BY embedding <=> :q LIMIT :n`; merge pinned posts in. No vector index until searches get slow.
- RLS only binds roles that don't own the tables. The app connects as the non-owner role `voxlace_app` (`DATABASE_URL`). Alembic connects as the owner (`MIGRATIONS_DATABASE_URL`, read in `migrations/env.py`). Test isolation with the two-user fixture connected as `voxlace_app`.
- Never edit a migration that has been merged. Write a new one.

## AI client (`app/ai/client.py`)

- `embed_documents(texts) -> list[list[float]]` and `embed_query(text) -> list[float]`: apply the required prefixes, request 768 dims, one content object per text, batch in groups, retry 429/5xx with backoff.
- `generate(prompt, purpose) -> GenerationResult(text, model, provider)`: walk `settings.generation_models` in order; move on when a model errors, is rate-limited or is missing. Record each attempt in `provider_usage`.
- Never fall back for embeddings. Raise `EmbeddingUnavailable`; the import job retries later.
- Tests mock the client. No test calls a real AI API.

## Importers

- Pure functions: `parse_telegram(data: bytes) -> ParseResult(posts, skipped)`. No DB or network.
- Keep only posts the user wrote; skip replies, reposts, service messages and empty text; count every skip by reason.
- A malformed file raises `ImportFormatError` with a message a user can read. Nothing is saved (FR-3).
- Read only the posts file from each export (FR-39).
- Each importer has tests against `samples/` covering normal, formatted, empty, duplicate and broken input.

## Background work (`app/services/background.py`)

- No separate worker in V1 (SRS 1.3). The API starts one daemon thread at startup (`lifespan` in `main.py`) that every `settings.embedding_retry_seconds` (default 300; 0 = off) embeds posts still waiting.
- It finds waiting users through the narrow database function `users_waiting_for_embeddings()` (ids only), then works as each user under RLS. A Postgres advisory lock per user (`embed_in_background`) keeps two API processes from embedding the same user at once (NFR-14).
- Reminders, due and missed posts are worked out when the app asks (`GET /me/notifications`); nothing is sent, so there is nothing to double-send.

## Tests

- `conftest.py` provides a test database (migrated once per session, each test in a rolled-back transaction), two users `user_a` and `user_b`, and an authenticated client for each.
- Every endpoint that returns user data gets a test proving `user_b` can't see `user_a`'s rows (FR-29).
- Name tests by behaviour: `test_reimport_creates_no_duplicates`.
