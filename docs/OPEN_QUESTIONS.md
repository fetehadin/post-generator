# Open Questions — before and during Phase 0

Gaps, contradictions and traps found by reviewing the SRS, build plan and API contract before any code exists. Each has a **recommendation**. Resolve each one together, then either update the SRS or `API.md` in a PR, or mark it *Decided* here with the date.

Status: 🔴 decide before Phase 0 code · 🟡 decide before the phase named · 🟢 note for later

---

## Database and isolation

### Q1 🟡 (Phase 2) Row-level security does nothing for superusers or table owners

> **Local part done (15 Oct 2026):** `db/init/002_app_role.sh` creates `voxlace_app`. A smoke test confirmed that it sees only the rows for its `app.user_id`, can't insert rows for another user, and can't create tables, while the owner sees everything. Still to decide: the matching role on Supabase in Phase 2.

Postgres skips RLS for **superusers** and for the **table owner** (unless `FORCE ROW LEVEL SECURITY` is set; superusers bypass even that). The local `voxlace` user from `POSTGRES_USER` is a superuser, and Supabase's `postgres` role owns the tables. If the app connects as either, every RLS policy passes silently and the NFR-13 test proves nothing.

**Recommendation:**

- Two roles. Migrations run as the owner (`voxlace` / `postgres`). The API connects as a separate **non-owner, non-superuser** role (e.g. `voxlace_app`), granted only `SELECT, INSERT, UPDATE, DELETE`.
- Per request, inside a transaction: `SET LOCAL app.user_id = '<uuid>'`. Policies use `user_id = current_setting('app.user_id')::uuid`. `SET LOCAL` (not `SET`) is required behind a transaction-mode pooler such as Supabase's port 6543.
- Add `db/init/002_app_role.sql` **in Phase 0**. Init scripts only run on an empty volume, so adding it later means everyone runs `docker compose down -v`.
- The NFR-13 test must connect as `voxlace_app`, never as the owner.

### Q2 🔴 `imports` table is missing from the data model

`API.md` has `GET /imports/{id}` with `status`, `parsed`, `skipped` and `embedded`, but SRS §6 has no table to store them. FR-32 (queue and retry embeddings) also needs persistent state.

**Recommendation:** add `imports (id, user_id, platform, status, parsed, skipped jsonb, embedded, error, created_at, finished_at)` and `source_posts.import_id`. A post with `embedding IS NULL` counts as "pending embedding".

### Q3 🔴 Store which model made each embedding

C-7 says never mix vectors. FR-32's test checks "no mixed vectors", but nothing in the schema records which model made a vector.

**Recommendation:** add `source_posts.embedding_model text`. Retrieval filters on `embedding_model = settings.EMBEDDING_MODEL`, which makes mixed vectors impossible rather than just unlikely.

### Q4 🟡 (Phase 1) ID format

`API.md` shows `imp_01`, `drf_1` and `post_1`. Supabase user IDs are UUIDs.

**Recommendation:** UUIDs everywhere (`gen_random_uuid()`). Update the `API.md` examples.

### Q5 🟡 (Phase 4) Prompt logs for revisions

`prompt_logs` hangs off `drafts`, but each revision (FR-10) is a separate AI call with its own prompt and possibly a different model (FR-31).

**Recommendation:** `prompt_logs.draft_version_id` (one log per version).

---

## Background work on free hosting

### Q6 🔴 Embedding runs after the upload response; free hosts kill that work

`POST /imports` returns `status: "embedding"`, so embedding happens after the response. FastAPI `BackgroundTasks` run in the same process, and free hosts sleep or restart it, which loses the work. Embedding about 400 posts on the free tier can take minutes because of the rate limits.

**Recommendation:** treat embedding as a resumable queue. The `embedding IS NULL` rows are the queue. Work on them in small batches with backoff after the upload, and have the Phase 5 cron tick also resume any pending batches. This delivers FR-32 without new infrastructure. Until the cron exists (Phase 1), a "resume" on `GET /imports/{id}` is enough.

### Q7 🟢 (Phase 5) Cron sends must not double-send

Pick due drafts with `UPDATE drafts SET sending_started_at = now() WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING …`, and only set `published_at` after Telegram confirms. That needs one more column (`sending_started_at`) or a status.

---

## API contract

### Q8 🔴 Error shape vs FastAPI defaults

FastAPI returns `{"detail": …}` for `HTTPException` and **422** with a list for validation errors. `API.md` promises `{"error": {"code", "message"}}` and lists no 422.

**Recommendation:** register handlers for `HTTPException`, `RequestValidationError` and unexpected `Exception` in Phase 0. Add `422 validation_error` to `API.md` (with an optional `fields` list).

### Q9 🟡 (Phase 1) Record the exact model, not the alias

`.env.example` uses `gemini-flash-latest`, and the API example says `gemini-flash`. `-latest` aliases change model underneath you, so prompt logs would stop being reproducible (NFR-15).

**Recommendation:** store the configured name **and** the model version the response reports (the `model_version` field in the response).

### Q10 🟡 (Phase 6) Which day do daily limits use?

The free Gemini quota resets at midnight Pacific (C-8). FR-30's per-user limits don't say which "day" they mean.

**Recommendation:** count per UTC day for simplicity, and show the reset time in the user's time zone.

---

## Parsers and counting

### Q11 🟡 (Phase 3) X threads: are self-replies "replies"?

FR-2 says skip replies. A builder's threads are replies to their **own** tweets, and they're often their best writing.

**Recommendation:** skip only replies to *other* accounts. Read the user's own account ID from `account.js` in the archive, or infer it as the most common `in_reply_to_user_id_str` among the user's own self-replies.

### Q12 🟡 (Phase 3) X archive edge cases

- Long posts (Premium) are in `note-tweet.js`. In `tweets.js`, their `full_text` is cut off.
- Large archives split into `tweets.js`, `tweets-part1.js`, ….
- FR-39 says read only the posts file. So should the upload be the whole ZIP or just `tweets.js`? The `.gitignore` already blocks `*.zip`.

**Recommendation:** accept the ZIP. Read only `data/tweets*.js` (+ `note-tweet.js`) from it, in memory, and never store the ZIP (NFR-11).

### Q13 🟡 (Phase 1) Telegram export variants

Telegram Desktop makes two formats: a single-chat export (`{name, type, id, messages}`, which the samples use) and a full-account export (`{about, chats: {list: […]}}`).

**Recommendation:** V1 accepts only the single-channel export and rejects the other one with a message explaining how to export one channel.

### Q14 🟡 (Phase 3) One X counter, two languages

The frontend counter (live) and the backend check (FR-9 blocks over-limit) must agree exactly.

**Recommendation:** the frontend uses the official `twitter-text` npm package (the reference implementation of weighted counting). The backend implements the same rules. **One shared fixture file** (`samples/x_counter_cases.json`: text → expected weighted length) is tested by both pytest and Vitest.

### Q15 🟢 LinkedIn `Date` time zone

It's unknown whether `Shares.csv` dates are UTC or local. Check against a real export, then update `samples/README.md`.

---

## AI

### Q16 🔴 Confirm the embedding model ID in the Phase 0 throwaway test

Google's English docs use `gemini-embedding-2`. Some localised pages still say `gemini-embedding-2-preview`. The task prefixes in SRS §5.3 (`title: none | text:` / `task: search result | query:`) and 768-dim output through `output_dimensionality` match the current docs. Confirm the exact ID your key accepts before writing the first migration with `vector(768)`.

### Q17 🟡 (Phase 1) Where the ten test topics live

The build plan's "ten fixed test topics" need a home so they're versioned with the prompts.

**Recommendation:** `backend/evals/topics.yaml` plus a small script that generates drafts for all of them and writes the results to a git-ignored folder for side-by-side comparison.

---

## Tooling and repo

### Q18 🔴 Pin the versions CI tests

Docs say Python 3.12+ and Node LTS. Dev machines may run newer versions (one has Python 3.14 and Node 26). Free hosts usually default to older ones.

**Recommendation:** `requires-python = ">=3.12"`, CI tests on **3.12**, and pin Node with `"engines"` in `package.json` plus a `.nvmrc`.

### Q19 🔴 GitHub settings the plan assumes

These can't be checked from the repo. Confirm in GitHub:

- Branch protection on `main`: no direct pushes, 1 approval, CI required.
- Labels: `track:data-ai`, `track:app`, `phase:0`…`phase:7`, `type:feature`, `type:bug`, `type:chore`.
- Projects board columns: Backlog → This week → In progress → In review → Done + Later.
- Nezira added as a collaborator.

### Q20 🟢 License

The README says "not chosen". Choose one before inviting beta testers or making the repo public.

---

## Decided

| # | Decision | Date |
|---|---|---|
| — | Database host port is configurable (`POSTGRES_PORT`), because a native Postgres often owns 5432 | 15 Oct 2026 |
| Q1 (local) | API connects as `voxlace_app` (`DATABASE_URL`); Alembic connects as the owner (`MIGRATIONS_DATABASE_URL`). Per request: `SET LOCAL app.user_id` inside the transaction | 15 Oct 2026 |
