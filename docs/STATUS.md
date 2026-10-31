# Status log

A running log so anyone (Nezira especially) can catch up: what was done, where, the result, and what's next. Newest first. Claude updates it at the end of every task.

**Where we are:** Phase 3 officially (CLAUDE.md). Code for Phases 3–6 is mostly built, but no demo after Phase 2 has run yet. The task queue is set by Fetehadin. Nezira is away, so each PR is reviewed by a fresh-context review subagent plus Fetehadin's reading of the summary, and tagged `@Nezira_Worku please post-review` so she reads it when she's back.

---

## 2026-10-31: Task 2, resume and portfolio import (`feat/profile-v2`)

**Result: built, waiting for review.** FR-20, FR-21, NFR-11, NFR-12, plus the profile v2 fields (FR-17, FR-40).
- `main` merged into the branch. The branch's own copies of #46 and #47 were the versions before review, so `main`'s fixed versions were kept.
- Backend: `/uploads` (resume as PDF or DOCX, portfolio URL, list, edit or review, delete). Contacts are removed before saving and again after edits. Portfolio pages are fetched only from public addresses: every redirect is checked again, with a 10 s timeout and a 2 MB limit. Only **reviewed** text goes into the summary prompt. Uploads are part of export, and delete removes them by cascade. New profile fields: seniority, facts, emoji and hashtag habits, portfolio, and projects (a list).
- Frontend: Profile has a "Resume and portfolio" section (upload, read a page, edit, "I checked it", delete), new About-you fields and a projects editor.
- Checks: backend ruff passes and 320 tests pass on a throwaway database (`voxlace-check`, port 5435). Frontend lint passes, 98 tests pass and the build works.
- `.env.example`: Groq set up as STATUS asked (model in `GENERATION_MODELS`, empty `GROQ_API_KEY`); the Telegram and worker variables were replaced by `EMBEDDING_RETRY_SECONDS`.

**Follow-ups from this task**
- Review (fresh-context subagent): 2 must-fix, 6 should-fix, all fixed on the branch.
  - Must-fix: the fetch now connects to the checked IP with the real Host and TLS name (DNS rebinding), and ignores proxy variables. `update` and `delete` check `user_id` too (rule 1).
  - Should-fix: bad ports and brackets give `invalid_url` instead of a 500; hidden emails (`[at]`, `dot`, full-width @), `wa.me`/`tel:` numbers and extensions are removed; "5 Drive integrations" is no longer read as an address; long lines lose only the address; zip-bomb guard on DOCX; any PDF error becomes `invalid_file`; 15 s deadline for the whole fetch; Profile says the card must be rewritten after un-reviewing or deleting.
  - Now 335 backend and 98 frontend tests.
- Step 3 (demo, partial): live drafts from real posts on X (72 posts) and Telegram (413): no invented numbers, longest copied run 1–2 words. They took 26–92 s; the logs show `ConnectError` retries to Google from this machine, so it's mostly the local network. The missing overall time limit in `generate()` is still worth fixing. No LinkedIn posts exist yet, so the three-platform demo waits for a LinkedIn export.
- Frontend tests: with every worker this machine sometimes kills one (SIGKILL, low memory). `npx vitest run --maxWorkers=2` passes all of them.
- A stray root `package.json`, `package-lock.json` and `node_modules` (`@supabase/server`, unused) are untracked in the repo root. Delete them by hand.
- Your dev database must run `alembic upgrade head` for 0009 if it isn't there already.

**Next:** demos for Phases 3–5 on real data (step 3), then the first Contabo deploy.

---

## 2026-10-29: Task 1, merge the open PRs (#43–#47)

**Result: done.** All five PRs were merged with the protocol: CI green, a fresh-context review subagent, must-fixes fixed on the branch, a review comment on the PR, then a squash merge. Every one had must-fixes, and each was fixed on its branch before merging. Main is healthy at `448d38b`:
- Backend: ruff and format pass, and 285 tests pass against a fresh database.
- Frontend: lint passes, 93 tests pass, and the build works.
- CI is green on every merge.

| PR | What | Fixed before merge | Merge |
|---|---|---|---|
| [#44](https://github.com/fetehadin/post-generator/pull/44) | SRS 1.3 docs | BUILD_PLAN, backend/CLAUDE.md and API.md still described the Telegram worker; "Copy now" was offered on unapproved drafts (rule 4) | `acd21a7` |
| [#45](https://github.com/fetehadin/post-generator/pull/45) | Groq fallback (FR-31) | An unreadable or blank model reply gave a 500 or an empty draft instead of failing over | `ca53f6b` |
| [#43](https://github.com/fetehadin/post-generator/pull/43) | Deploy files for the shared Caddy (NFR-18) | The deploy user had passwordless root; reruns wiped the CI key; the server IP and domain were committed | `12ec0d4` |
| [#46](https://github.com/fetehadin/post-generator/pull/46) | Threads, notifications, reminders, time zone, retry loop | Converting an unapproved draft treated its text as approved facts (rule 10) | `743fd7a` |
| [#47](https://github.com/fetehadin/post-generator/pull/47) | Best hours, approve with a day | A discarded draft could be scheduled; `at` wasn't checked against `day`; a null setting gave a 500 | `448d38b` |

Each PR has a review comment with the full findings.

**Decisions by Fetehadin (29 Oct):**
- [ ] **Ruleset "Protect main":** required approvals set from 1 to 0 while Nezira is away, because GitHub never counts an author's own approval. CI ("CI passed"), squash-only, linear history and resolved threads are still required. **Set it back to 1 when Nezira returns.**
- Branches are updated from main by **merge**, never rebase plus force-push. Squash merges keep main linear.
- The deploy user gets **Docker only, no sudo**. Server address and domain live in the git-ignored `deploy/local.env`.

**Next:** Task 2, finish resume and portfolio import (`feat/profile-v2`: FR-20, FR-21, NFR-12). A plan comes first.

---

## Follow-ups found on the way (not fixed yet)

Each is small. They're listed here instead of being fixed, to keep every PR to its own task.

**Needs a migration** (rule 7: never edit an applied one)
- 0007's `SECURITY DEFINER` function (it runs with the table owner's rights, so it must name exactly which tables it means): use `SET search_path = pg_catalog, public, pg_temp` and `public.source_posts`, so a temporary lookalike table can't be swapped in (#46 review). Low impact: the function returns only ids.
- 0007 backfill: drafts from before threads have no v1 card message (#46).
- FR-45 gaps (2/3/4 h) are hard-coded in `scheduling.py` (`GAP`). They belong in `platform_profiles` (rule 8, #47).

**Needs the owner's OK** (ask-first areas)
- `REVOKE INSERT, UPDATE, DELETE` from `voxlace_app` on the shared seed tables `posting_curves` and `platform_profiles` (grants, #47).
- `deploy/README.md` still mentions the Telegram worker (SRS 1.3).
- `Caddyfile.internal`: `trusted_proxies`, so Caddy keeps real client IPs. Not needed until the app reads client IPs (#43).
- `.env.example` can only be edited by Fetehadin (Q23): replace `FALLBACK_API_KEY` with `GROQ_API_KEY`, set the model to `groq:openai/gpt-oss-120b`, and drop `TELEGRAM_BOT_TOKEN` and `WORKER_INTERVAL_SECONDS`.

**Code**
- `ai/client.py` `generate()`: no overall deadline, so with every model struggling one request can run for minutes (NFR-3). The `openai/gpt-oss` options and `GROQ_URL` could move to settings (#45).
- Scheduling (#47):
  - A posting window over midnight takes its early hours from the start of `day`.
  - Two parallel `/schedule` calls can pick the same hour.
  - Telegram channel names are 5–32 characters, so the pattern needs `{4,31}` after the first letter; `t.me/` and `http://` forms should be accepted too.
  - On today's date, `best-hours` lists hours that have passed.
- Threads (#46):
  - `available_timezones()` is uncached; consider the `tzdata` package (a dependency) so time zone names don't depend on the server's operating system.
  - Missed posts have no lower age bound.
  - Deleting a thread's only draft leaves an empty thread.
  - Backfilled thread titles are cut at 80 characters, but the app cuts at 60.

**Docs**
- NFR-14 kept its id but changed meaning. FR-41 still mentions "the editor". FR-45 doesn't state its gap numbers.

**Local setup**
- Backend tests run against the **dev database** (`MIGRATIONS_DATABASE_URL`), which holds real imported posts and is currently at the unmerged migration `0009`. For this task, Claude ran them against a throwaway container (`voxlace-check`, port 5435), the same way CI does. A separate `voxlace_test` database in `docker-compose.yml` would make this the default. That's a small `chore` PR.
