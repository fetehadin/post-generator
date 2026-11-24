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
- `generate(prompt, purpose) -> GenerationResult(text, model, provider, key_source, tokens…)`: walk the chain (`settings.chain_for(purpose)`: small jobs may use `GENERATION_MODELS_LIGHT`); move on when a model errors, is rate-limited or is missing.
- **Routes and keys (FR-48):** a route is one model with one key. `ai.for_user(user_id)` (or `for_user(ai, user_id)` in services, which leaves test fakes alone) tries the user's own keys through the whole chain, then the app's keys. `allow_default=False` keeps a user past the daily limit on their own key only. Services must bind the user; the bare client acts as a guest.
- **Circuit breaker (`ai/breaker.py`):** a route that fails 3 calls in a row, or says how long it is down (daily quota, rejected key, removed model), is skipped for a while. While a backup remains a route gets 2 tries, the last route all of them. `check_models` ignores the breaker.
- **Every logical call is recorded** to `ai_calls` (purpose, model, key source, attempts, time, tokens; never text) through the recorder `default_client()` wires to `services/ai_calls.py`. A refused own key is marked `rejected` there. `python -m app.dev ai-report` reads it as the owner.
- `embed_query` caches vectors by text (same model, same vector), so one topic is embedded once for three platforms.
- Never fall back to another embedding model. Only whose key pays changes. Raise `EmbeddingUnavailable`; the import job retries later.
- Users' keys are sealed with `core/secrets.py` (Fernet, keys only in `AI_KEY_ENCRYPTION_KEYS`). Never log, return or export a key.
- Tests mock the client. No test calls a real AI API.

## Local embeddings and the inspiration pool (`app/ai/local_embed.py`, `services/inspiration.py`)

- `local_embedder()` is one fastembed model per process (ONNX, CPU), loaded in the background at startup (`LOCAL_EMBEDDING_PRELOAD`). `embed_passages(texts)` for stored text, `embed_query(text)` for what we search with; e5 models get `passage: ` / `query: ` added here, nowhere else.
- The Docker image downloads the model at build time into `/opt/models` (`app/ai/local_models.py`, standalone). Locally the first use downloads it (~470 MB) into fastembed's cache, or `LOCAL_EMBEDDING_CACHE_DIR`.
- `exemplar_posts` holds the team's 24 templates (`source='template'`) and creators' posts (`source='creator'`), for structure only: never shown to users, never a source of facts or wording.
- Fill it: `python -m app.dev import-inspiration samples/private/inspiration` (hash-deduplicated), then `python -m app.dev backfill-inspiration` (tags with the free LLM in small batches, then embeds; both skip finished rows, so re-run after a 429 stop).
- Tests use a fake model (`backend=`); no test downloads one.

## GitHub → daily dev drafts (`services/github.py`, FR-14)

- Optional: off without `GITHUB_CLIENT_ID`/`SECRET`. OAuth (no scopes) proves the account; the GitHub App adds private repos. A signed `state` (10 minutes) ties every GitHub round trip to the logged-in user; an installation is linked only when its account id is the user's.
- GitHub calls live in `services/github_api.py` (httpx, read-only); tests pass a fake. Only the user's own commits/PRs/releases are stored, never diffs, scrubbed by `services/github_scrub.py`.
- Webhooks (`/webhooks/github`) are checked with `X-Hub-Signature-256` and handled in a background thread. They and the hourly job find users through the narrow functions `user_for_github_installation()` and `github_connected_users()` (ids only), then work as that user under RLS.
- `score()` is pure (stage 1, no AI); `judge()` is one small AI call (stage 2, purpose `github_judge`, on the user's key first). Only `mention_ok` repos reach the AI or a draft.

## Telegram bot (`services/telegram.py`, FR-36)

- Optional: off until `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` are set. Bot API calls live in `services/telegram_api.py` (httpx); tests pass a fake. The token is in Telegram's URL, so it never goes into an error or a log line.
- Linking: a one-time token (SHA-256 stored, 15 minutes) in `t.me/<bot>?start=<token>`; the webhook pairs it with the sender's Telegram id. If that Telegram account was linked to another Voxlace account, the link and its channel move to the new one (the sender holds both). Connecting: Telegram's `my_chat_member` update when the user makes the bot a channel admin; matched to the account by the adder's Telegram id. The webhook finds users through `user_for_telegram_token/user/chat()` (ids only), then works as that user under RLS.
- `_send` is shared by Post now (`post_draft`) and the background sender (`send_due`, every `TELEGRAM_SEND_SECONDS`, default 60): it locks the draft row, sends, then marks it Posted in the same transaction, so nothing is posted twice (ADR 0001).
- `send_due` finds work through `telegram_drafts_due(max_late)` (ids only): approved Telegram drafts whose time came at most 30 minutes ago, not refused before, for a channel with the post right. Rows are locked `SKIP LOCKED` so two API processes never send the same draft. A refusal is stored on the draft (`bot_failed_at`, `bot_error` in plain words) and not retried; it shows as missed. Telegram being down is retried next pass. A new time or status clears the refusal.

## Importers

- Pure functions: `parse_telegram(data: bytes) -> ParseResult(posts, skipped)`. No DB or network.
- Keep only posts the user wrote; skip replies, reposts, service messages and empty text; count every skip by reason.
- A malformed file raises `ImportFormatError` with a message a user can read. Nothing is saved (FR-3).
- Read only the posts file from each export (FR-39).
- Each importer has tests against `samples/` covering normal, formatted, empty, duplicate and broken input.

## Background work (`app/services/background.py`)

- No separate worker in V1 (SRS 1.3). The API starts small daemon threads at startup (`lifespan` in `main.py`). The first, every `settings.embedding_retry_seconds` (default 300; 0 = off), embeds posts still waiting.
- It finds waiting users through the narrow database function `users_waiting_for_embeddings()` (ids only), then works as each user under RLS. A Postgres advisory lock per user (`embed_in_background`) keeps two API processes from embedding the same user at once (NFR-14).
- Reminders, due and missed posts are worked out when the app asks (`GET /me/notifications`); nothing is sent, so there is nothing to double-send.
- The Telegram sender (`start_telegram_loop`, ADR 0001) is the one background job that posts anything: `FOR UPDATE SKIP LOCKED`, `published_at` set in the same transaction, never double-send. Only for drafts the user approved with a time.

## Tests

- Tests never touch the dev database. `tests/conftest.py` points them at the same server with `_test` added to the database name (`voxlace` → `voxlace_test`), creates it on the first run (pgvector plus the app role's grants) and migrates it once per session. CI's database is already called `voxlace_test`. Don't name your dev database `…_test`: tests would use it.
- `tests/conftest.py` provides `make_user()` (a fresh user, deleted afterwards) and `owner_engine`; `tests/api/conftest.py` provides `api`, a client acting as one fresh user with a fake AI. Two-user tests make a second user with `make_user()` and switch with `api.state["user"]`.
- Every endpoint that returns user data gets a test proving `user_b` can't see `user_a`'s rows (FR-29).
- Name tests by behaviour: `test_reimport_creates_no_duplicates`.
