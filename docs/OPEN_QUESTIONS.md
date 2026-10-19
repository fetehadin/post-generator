# Open Questions — before and during Phase 0

Gaps, contradictions and traps found by reviewing the SRS (v1.1, Contabo hosting), build plan and API contract before any code exists. Each has a **recommendation**. Resolve each one together, then either update the SRS or `API.md` in a PR, or mark it *Decided* here with the date.

Status: 🔴 decide before Phase 0 code · 🟡 decide before the phase named · 🟢 note for later

---

## Database and isolation

### Q1 ✅ Row-level security does nothing for superusers or table owners

> **Done (15 Oct 2026).** `db/init/002_app_role.sh` creates `voxlace_app`. A smoke test confirmed that it sees only the rows for its `app.user_id`, sees 0 rows when none is set, can't insert rows for another user, and can't create tables, while the owner sees everything. The production DB is our own Postgres on the VPS (SRS 1.1), so the same script applies there. Follow-ups are in **Q21** (CI) and **Q22** (worker role).

Postgres skips RLS for **superusers** and for the **table owner** (unless `FORCE ROW LEVEL SECURITY` is set; superusers bypass even that). If the app connected as `voxlace` (`POSTGRES_USER`), every RLS policy would pass silently and the NFR-13 test would prove nothing.

**Setup:** migrations run as the owner (`MIGRATIONS_DATABASE_URL`). The API connects as `voxlace_app` (`DATABASE_URL`) and runs `SET LOCAL app.user_id = '<uuid>'` at the start of each request transaction. The NFR-13 test connects as `voxlace_app`.

### Q2 🔴 `imports` table is missing from the data model

`API.md` has `GET /imports/{id}` with `status`, `parsed`, `skipped` and `embedded`, but SRS §6 has no table to store them. FR-32 (queue and retry embeddings) also needs persistent state.

**Recommendation:** add `imports (id, user_id, platform, status, parsed, skipped jsonb, embedded, error, created_at, finished_at)` and `source_posts.import_id`. A post with `embedding IS NULL` counts as "pending embedding".

### Q3 🔴 Store which model made each embedding

C-7 says never mix vectors. FR-32's test checks "no mixed vectors", but nothing in the schema records which model made a vector.

**Recommendation:** add `source_posts.embedding_model text`. Retrieval filters on `embedding_model = settings.EMBEDDING_MODEL`, which makes mixed vectors impossible rather than just unlikely.

### Q4 🟡 (Phase 1) ID format: `API.md` examples are out of date

`backend/CLAUDE.md` already says every table uses a UUID `id`, but `API.md` still shows `imp_01`, `drf_1` and `post_1`.

**Recommendation:** change the `API.md` examples to UUIDs when the Phase 1 contract is written.

### Q5 🟡 (Phase 4) Prompt logs for revisions

`prompt_logs` hangs off `drafts`, but each revision (FR-10) is a separate AI call with its own prompt and possibly a different model (FR-31).

**Recommendation:** `prompt_logs.draft_version_id` (one log per version).

---

## Background work

### Q6 🔴 Who does the embedding after an upload?

`POST /imports` returns `status: "embedding"`, so embedding happens after the response. Embedding about 400 posts on the free Gemini tier can take minutes because of the rate limits. The server is now always on (SRS 1.1), but FastAPI `BackgroundTasks` still lose their work when the API container restarts, for example on every deploy.

**Recommendation:** treat embedding as a resumable queue. The `embedding IS NULL` rows are the queue. In Phase 1, embed in `BackgroundTasks` and offer a "resume" on `GET /imports/{id}`. Once the worker exists (Phase 5, or earlier if this hurts), it also processes pending embeddings each loop. That delivers FR-32 with no new infrastructure.

### Q7 🟢 (Phase 5) Sending exactly once is impossible; pick which failure you accept

`backend/CLAUDE.md` says: lock with `FOR UPDATE SKIP LOCKED`, send, then set `published_at` in the same transaction. If the worker dies **after** Telegram accepts the message but **before** the commit, the post is sent again on the next loop. Marking it first and sending afterwards has the opposite risk: the post is never sent.

**Recommendation:** accept the rare duplicate (Telegram is the only sender, and the window is milliseconds), but write it down in NFR-14's test notes. Alternatively, add `send_attempted_at` and treat "attempted but not published" as *needs a human* instead of retrying.

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

### Q11 ✅ X threads: are self-replies "replies"?

FR-2 says skip replies. A builder's threads are replies to their **own** tweets, and they're often their best writing.

**Recommendation:** skip only replies to *other* accounts. Read the user's own account ID from `account.js` in the archive, or infer it as the most common `in_reply_to_user_id_str` among the user's own self-replies.

### Q12 🟡 (Phase 3) X archive edge cases

- Long posts (Premium) are in `note-tweet.js`. In `tweets.js`, their `full_text` is cut off.
- Large archives split into `tweets.js`, `tweets-part1.js`, ….
- FR-39 says read only the posts file. So should the upload be the whole ZIP or just `tweets.js`? The `.gitignore` already blocks `*.zip`.

**Recommendation:** accept the ZIP. Read only `data/tweets*.js` (+ `note-tweet.js`) from it, in memory, and never store the ZIP (NFR-11).

### Q13 ✅ Telegram export variants

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

### Q18 🟡 (Phase 0) Pin Node

CI already pins Python **3.12** ✅. Node uses `lts/*` in CI, which changes when a new LTS ships. Dev machines may run newer versions (one has Python 3.14 and Node 26).

**Recommendation:** when the frontend is created, add `.nvmrc` and `"engines"` in `package.json`, and point CI's `setup-node` at `node-version-file: frontend/.nvmrc`.

### Q19 ✅ GitHub settings the plan assumes

Checked with `gh` on 15 Oct 2026:

- ✅ Ruleset "Protect main" is active: PR with 1 approval, required check **CI passed** (strict), squash only, linear history, no force-push or deletion.
- ✅ Squash merge only; branches are deleted on merge.
- ✅ Two collaborators (`fetehadin`, `Jennah198`).
- ✅ **Labels created** (were missing): `track:data-ai`, `track:app`, `phase:0`…`phase:7`, `type:feature`, `type:bug`, `type:chore`.
- ❓ Projects board not checked (needs the `project` scope on `gh`).
- ⚠️ The repo is **public**. Fine for code, but it raises the stakes on Q20 and on never committing real exports.

### Q20 ✅ License

The README says "not chosen". Choose one before inviting beta testers or making the repo public.

### Q21 ✅ CI needs the app role and the migrations URL

`.github/workflows/ci.yml` starts a plain `pgvector/pgvector:pg18` service and sets only `DATABASE_URL` as the superuser. Service containers can't mount `db/init/`, so `voxlace_app` won't exist in CI, and `MIGRATIONS_DATABASE_URL` is unset. Once `migrations/env.py` reads `MIGRATIONS_DATABASE_URL`, CI's `alembic upgrade head` fails, and the isolation tests would run as a superuser that bypasses RLS.

**Recommendation** (a workflow change, so the other person reviews it): in the backend job, run `db/init/002_app_role.sh` with `psql` after "Enable pgvector", set `MIGRATIONS_DATABASE_URL` to the superuser URL, and point `DATABASE_URL` at `voxlace_app`.

### Q22 🟡 (Phase 5) The worker's database role

`backend/CLAUDE.md` says the worker reads due drafts across users through "a narrow RLS policy". It needs its own role (e.g. `voxlace_worker`), plus a `SELECT` policy on `drafts` limited to `status = 'approved' AND published_at IS NULL`. Add it to `db/init/` and to production at the same time.

### Q23 🙋 (needs a person) Claude Code permissions block `.env.example`

`.claude/settings.json` denies `Read(./.env.*)`, which also matches `.env.example`. The secrets hook in `.claude/hooks/guard_secrets.py` also blocks shell commands that only *mention* a `.env.local`-style name next to words like `head` or `source`, even inside a heredoc. `CLAUDE.md` says to "use `.env.example` to learn variable names", so the agent can't follow its own rule.

**Recommendation:** replace `Read(./.env.*)` with specific patterns such as `Read(./.env.local)`, `Read(./.env.*.local)`, `Read(./.env.production)` and `Read(./.env.development)`. In Claude Code, deny rules win over allow rules, so adding an allow for `.env.example` doesn't help. This is a permissions change, so a person should make it.

## Design

### Q29 🟡 (Phase 2) Component library: shadcn/ui

`docs/DESIGN.md` §6 recommends shadcn/ui: accessible components copied into `frontend/src/components/ui`, restyled with our tokens. It's a new dependency (and brings headless UI primitives with it), so both of you agree before Phase 2.

**Recommendation:** adopt it for dialogs, menus, popovers, tabs, toasts and form controls; build the product components (DraftEditor, PlatformPreview, LengthCounter …) ourselves on top.

### Q30 🟡 (Phase 2) Visual tokens and fonts

DESIGN.md §5 proposes colors, Instrument Sans for the interface and Source Serif 4 for the user's writing. They're a starting point, not final.

**Recommendation:** in the first `/design-screen` pass (the draft editor), try the proposal plus one alternative, compare screenshots side by side, then lock the tokens in DESIGN.md.

---

## Decided

| # | Decision | Date |
|---|---|---|
| — | Database host port is configurable (`POSTGRES_PORT`), because a native Postgres often owns 5432 | 15 Oct 2026 |
| Q1 | API connects as `voxlace_app` (`DATABASE_URL`); Alembic connects as the owner (`MIGRATIONS_DATABASE_URL`). Per request: `SET LOCAL app.user_id` inside the transaction | 15 Oct 2026 |
| Q6 (part) | Server is always on (SRS 1.1). There's no external cron; the worker container handles scheduled work | 14 Oct 2026 |
| Q11 | Keep self-replies (threads) as voice data; skip only replies to other accounts | 15 Oct 2026 |
| Q13 | Accept single-channel Telegram exports only, one upload per channel. A user with several channels uploads each one | 15 Oct 2026 |
| Q19 | Labels created (`track:*`, `phase:0`–`7`, `type:*`) | 15 Oct 2026 |
| Q20 | No license for now (all rights reserved). Repo stays **public** so the `main` ruleset stays enforced (GitHub Free doesn't enforce rulesets on private repos). Go private before beta, or earlier with GitHub Pro | 15 Oct 2026 |
| Q21 | CI backend job creates `voxlace_app` with `db/init/002_app_role.sh`, sets `MIGRATIONS_DATABASE_URL` to the owner and points `DATABASE_URL` at the app role. Verified in a throwaway container | 15 Oct 2026 |
| Q23 | Narrow the `.claude/settings.json` deny rule so `.env.example` is readable. A person must make this change (auto mode blocks agent edits to its own permissions) | 15 Oct 2026 |
| Others | Use the recommendation written under each question when its phase starts | 15 Oct 2026 |
