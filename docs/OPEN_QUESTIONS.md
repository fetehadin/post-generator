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

### Q12 ✅ (Phase 3) X archive edge cases

- Long posts (Premium) are in `note-tweet.js`. In `tweets.js`, their `full_text` is cut off.
- Large archives split into `tweets.js`, `tweets-part1.js`, ….
- FR-39 says read only the posts file. So should the upload be the whole ZIP or just `tweets.js`? The `.gitignore` already blocks `*.zip`.

**Recommendation:** accept the ZIP. Read only `data/tweets*.js` (+ `note-tweet.js`) from it, in memory, and never store the ZIP (NFR-11).

**Built (21 Oct 2026):** `app/importers/x.py` reads the ZIP (or a bare `tweets.js`), only `data/tweets*.js`, `note-tweet.js` and the account id from `account.js`. Long posts are rebuilt by matching the second (±2 s) and text prefix. On a real archive: 72 own posts, 225 replies to others skipped, all 18 long posts complete, no `t.co` left.

### Q13 ✅ Telegram export variants

Telegram Desktop makes two formats: a single-chat export (`{name, type, id, messages}`, which the samples use) and a full-account export (`{about, chats: {list: […]}}`).

**Recommendation:** V1 accepts only the single-channel export and rejects the other one with a message explaining how to export one channel.

### Q14 ✅ (Phase 3) One X counter, two languages

The frontend counter (live) and the backend check (FR-9 blocks over-limit) must agree exactly.

**Recommendation:** the frontend uses the official `twitter-text` npm package (the reference implementation of weighted counting). The backend implements the same rules. **One shared fixture file** (`samples/x_counter_cases.json`: text → expected weighted length) is tested by both pytest and Vitest.

**Decided (19 Oct 2026):** the shared fixture is in place (16 cases: links, emoji with skin tones, joined emoji and flags, CJK, Amharic, punctuation), and both `backend/app/counting.py` and `frontend/src/lib/xCount.ts` pass it. Instead of adding the `twitter-text` dependency, both sides implement its v3 rules (light ranges, emoji sequences). Known gap: bare domains like `example.com` aren't detected as links yet.

### Q15 🟢 LinkedIn `Date` time zone

It's unknown whether `Shares.csv` dates are UTC or local. Check against a real export, then update `samples/README.md`.

---

## AI

### Q16 ✅ Confirm the embedding model ID in the Phase 0 throwaway test

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

### Q24 🟡 (Phase 1) Findings from the first real test (15 Oct 2026)

428 own posts from a real mixed Amharic/English channel were embedded with `gemini-embedding-2` at 768 dims. 7 test topics found the right posts, including English topics matching Amharic posts and the reverse.

- **Free-tier rate limit:** about 100 embeddings per minute, so a batch of 100 waits about 60 s. 428 posts took about 5 minutes with backoff. A 24k-post channel would take hours and hit the daily quota. This confirms Q6 (embedding must be a resumable queue) and argues for a per-import post cap.
- **Near-duplicates crowd the results:** e.g. "3 hour left…" and "2 hour left…" both ranked in the top 5. Recommendation: drop near-duplicate examples (cosine > ~0.95 to one already chosen) when picking the 8 prompt examples.
- **Junk posts for voice:** link-only posts, and posts whose text starts with `[Forwarded from …]` (copy-pasted forwards without the `forwarded_from` field). Recommendation: skip them in the parser and count them as skipped.
- **Real exports have extra fields:** `reactions` (engagement, useful for FR-34), `poll`, and `phone`/`email` entities in a few posts (strip before prompting, as in FR-21). The export format otherwise matches `samples/telegram/result.json`.

### Q25 ✅ (Phase 1) Big channels and personal posts: which posts to learn from

Real numbers: a large channel had 17,648 usable posts (about 3 hours of free-tier embedding plus the daily quota). Retrieval only puts about 8 examples in each prompt, so a few hundred good posts teach style as well as all of them.

**Decided (15 Oct 2026):**

1. **Import cap:** embed the best **~1,000** posts first, ranked by **reactions** (Telegram `reactions[].count`) and **recency**. Their top 500 posts were almost all from the last 2–3 years anyway. Any remaining posts stay queued with `embedding IS NULL` and are embedded later by the queue (Q6), or never. The user can draft as soon as the first batch is done.
2. **Excluded hashtags:** a post carrying any excluded hashtag is skipped at import and counted as `skipped.excluded_topic`. The list is a **per-user setting** (stored on the user, editable in Settings, case-insensitive) because what counts as personal differs per person. Starting list:
   - Religious: `#scripture #spiritual #christianart #alhamdulillah #eidvibes #ኢድ_ሙባረክ #ramadanbreak`
   - Personal life: `#family #forher #relationship #friends #me #dailylife`
   - Shared content, not writing: `#memes #jokes #songs #lyrics #wallpapers #profilepics #tiktoks #funnyvideos #comics #movies #games`
   - Mental-health posts are **kept** (explicit choice).
3. Personal posts **without** hashtags can't be caught automatically. The user excludes them by hand (FR-25).

Effect on real exports: the large channel excluded 4,848 posts (16,810 kept before the cap); FeteScript excluded 4 (415 kept).

**Inspiration channels (Later list, not V1 core):** don't embed them. Turn each channel's top ~50 posts by reactions into a one-paragraph **style card** with one AI call, then use it as "structure like X" during drafting while the voice stays the user's own.

### Q26 ✅ (Phase 3) Inspiration picked automatically by post type (FR-41)

The user shouldn't have to say "write like DHH". The app detects what kind of post is being drafted (launch, progress, lesson, opinion, humor, tip, event) and pulls structure examples from the creators who are strongest at that type.

**First test (17 Oct 2026):** 310 posts from 11 creators were collected with Grok and verified (every post ID's timestamp matched its stated date). A style card per creator worked well. But blending "your voice + one creator at ~30%" changed almost nothing: all 10 drafts looked the same, because 8 near-identical #10DaysGrind voice examples dominated. Details: `samples/private/experiments/style-test.md`.

**Decided:** voice examples must vary (at most 3 from one template); structure comes from 3 real inspiration posts of the matching type, plus an explicit instruction ("their hook, rhythm and ending; your words, emoji and sign-off"); a 5-word-phrase copy check runs on every draft. Collect like counts next time so "strongest" means proven, not just frequent. Inspiration posts are private to the user who collected them.

**Decided (18 Oct 2026): inspiration is per platform, never mixed.** Telegram drafts learn structure only from Telegram channels (Dagmawi Babi, Code and Thought, Luna's pathway, Tech Nerd), X drafts only from X accounts (DHH, ThePrimeagen, Theo, levelsio…), LinkedIn drafts only from LinkedIn creators (none collected yet). Telegram style cards were built from each channel's 40 most-reacted posts, after the importer's personal-hashtag filter.

### Q27 ✅ (Phase 4–5) Chat with the draft, and daily reminders (FR-40, FR-42, FR-43)

**Chat:** each draft gets a chat panel that already knows the user's voice, profile and platform rules. Every change is a version; it can fix one selected sentence, convert to another platform, and asks a question instead of inventing a missing fact. Stored in `draft_messages`.

**Reminders:** a daily check-in nudge at the user's chosen time (in-app or Telegram DM from the bot), skipped when today already has a check-in. Replying to the bot saves the reply as the check-in and sends a draft back. Streak and catch-up nudges are stretch.

## Design

### Q29 🟡 (Phase 2) Component library: shadcn/ui

`docs/DESIGN.md` §6 recommends shadcn/ui: accessible components copied into `frontend/src/components/ui`, restyled with our tokens. It's a new dependency (and brings headless UI primitives with it), so both of you agree before Phase 2.

**Recommendation:** adopt it for dialogs, menus, popovers, tabs, toasts and form controls; build the product components (DraftEditor, PlatformPreview, LengthCounter …) ourselves on top.

### Q30 ✅ (Phase 2) Visual tokens and fonts

DESIGN.md §5 proposes colors, Instrument Sans for the interface and Source Serif 4 for the user's writing. They're a starting point, not final.

**Recommendation:** in the first `/design-screen` pass (the draft editor), try the proposal plus one alternative, compare screenshots side by side, then lock the tokens in DESIGN.md.

**Decided (19 Oct 2026):** visual direction v2, from a study of ScholarXIV (`design/REFERENCE_SCHOLARXIV.md`). Warm paper neutrals; Instrument Sans + Noto Sans Ethiopic for the interface, Source Serif 4 + Noto Serif Ethiopic for the user's writing; one teal accent (`--thread`) that is also the primary button color; light, dark and a new **mixed** theme. Every pair passes WCAG AA. Tokens and contrast table: DESIGN.md §5; prototypes: `design/prototypes/`. Q29 (shadcn/ui) is still open.


### Q31 🟡 (Phase 3) X Premium: 280 or 25,000 characters?

X counts length the same way for everyone, but the **limit** differs: 280 for free accounts and 25,000 for Premium. Long posts show "Show more" after about 280 characters.

**What we can know.** No password and no scraping (CLAUDE.md rule 5) means three possible signals:

1. **The user's own X archive (automatic, strong).** There's no "Premium" flag in it: `verified.js` covers the old blue check. But long posts are stored in `data/note-tweet.js`, and only Premium accounts can post over 280. Checked on a real archive (19 Oct 2026): `verified: false`, yet **18 posts over 280 characters (up to 1,383)** between Aug and Oct 2026. So: had Premium, and recently.
2. **The user says so (source of truth).** Premium can lapse at any time, and the export is a snapshot.
3. **The official X API** can report the subscription, but it needs OAuth and paid developer access. Not for V1 (CLAUDE.md: ask before a paid API).

**Recommendation:**
- Store `x_premium` per user in `platform_settings` (Phase 3 table) with `source` (`user` or `export`) and `updated_at`.
- The **X importer pre-fills it** when `note-tweet.js` has a post over 280 from the last 90 days, and asks once: "Your export has long posts. Does your X account have Premium?" The user's answer wins.
- The **effective limit** is 25,000 with Premium, else 280 (from `platform_profiles`). The counting rule is unchanged, and the counter and the FR-9 block use the effective limit.
- **Drafts stay short by default** even with Premium; a "Long post" option asks for more. The **preview shows the "Show more" fold at 280** so the user sees what most readers see.
- Hand-off is safe either way: X's own composer rejects an over-limit post, and we warn before opening it.

**Also found:** for long posts, `tweets.js` keeps only the first part of the text. The full text is in `note-tweet.js`. The X importer must read both (FR-39 still holds: both are post files).
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
| Q16 | `models/gemini-embedding-2` accepts our key and returns 768 values with `output_dimensionality=768`. (`-2-preview` and `-001` also exist; we use `gemini-embedding-2`) | 15 Oct 2026 |
| Q26–Q27 | Smart inspiration by post type; draft chat + daily reminders (SRS 1.2) | 17 Oct 2026 |
| Q30 | Visual direction v2: warm paper neutrals, Instrument Sans + Source Serif 4 with Noto Ethiopic fallbacks, teal `--thread` accent and primary, light/dark/mixed themes (DESIGN.md §5) | 19 Oct 2026 |
| Others | Use the recommendation written under each question when its phase starts | 15 Oct 2026 |
