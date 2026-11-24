# Status log

A running log so either of us can catch up: what was done, where, the result, and what's next. Newest first. Updated at the end of every task.

**Where we are:** Phase 7, private beta prep. Phases 3–6 demos passed on 4 Nov 2026. Live at https://voxlace.fetehadin.com, deployed on every merge to `main`. Since 10 Nov anyone with the link can try it as a guest or sign up without an invite. Since 19 Nov Nezira is a full partner (GitHub `Jennah198`, write access, server SSH), so each PR is reviewed by the other person, as BUILD_PLAN §2 says.

---

## 2026-11-24: UI/UX polish pass from the refinement brief (#84–#92)

**Result: 9 PRs open, none merged yet.** All eight branches merge cleanly together; on the combined code the frontend has 39 test files, 252 tests passing, plus typecheck, lint and build. Merge in this order (later ones contain earlier ones): **#84**, **#85 → #89 → #90**, **#86 → #87 → #88**, **#91**, **#92**.

| PR | What | Requirement |
|---|---|---|
| #84 | Calendar and Telegram text say what the bot does now; 24-hour times everywhere | FR-13, FR-36 |
| #85 | A homepage around the guest box: promise, role chips with an example, how it works, where it posts, free to start, FAQ | FR-50 (new), FR-47 |
| #86 | The chat asks "Did you post it?" after a hand-off, like every other screen | FR-12 |
| #87 | With the bot connected and allowed to post, Telegram drafts show Post to Telegram now on every screen | FR-36 |
| #88 | LinkedIn mark visible on a selected chip; one line per failure reason; voice questions folded | FR-11, FR-33 |
| #89 | Command bar on Ctrl/⌘+K; Ctrl/⌘+J to the message box | FR-51 (new) |
| #90 | Type a time ("wed 2pm", "tomorrow 18:00", "in 2 hours"), repeated in words before approving | FR-52 (new) |
| #91 | Time zone in city words, "free key" wording, no empty gap in the key form | FR-33, FR-48 |
| #92 | Touch targets: fold-out headers and standalone links reach 44px; this report | NFR (WCAG 2.5.8) |

**Counts, before → after** (measured with the mock API and the live homepage):

| Measure | Before | After |
|---|---|---|
| Homepage: says what Voxlace is and who it's for | no | yes, in the first screen at 360px |
| Actions from landing to a first draft (guest) | 2 (type, Enter) | 2 |
| Questions before a first draft (new account) | 0 | 0; the two optional ones now fold behind one button |
| Filled primary buttons on a guest draft card | 1 per card + header | 0 per card (secondary); Start free in the header |
| Screens with sideways scroll at 360px | 0 | 0 |
| Controls under 44px on touch (excluding hidden skip link and checkboxes) | 7 | 0 |
| Text that said Voxlace never posts (wrong since #81) | 2 places | 0 |
| Clock styles on the calendar | 2 (AM/PM and 24-hour) | 1 (24-hour) |

**What we borrowed, from where:**
- **Typefully:** the command bar (Ctrl/⌘+K, Ctrl/⌘+J) and scheduling by typing plain phrases.
- **Notion AI:** idea starters where the cursor is, now per role on the homepage.
- **ChatGPT Canvas / Claude Artifacts:** the chat beside a draft panel (already in #78); the homepage reuses that composer as its live demo.
- **Land-book (hero sections):** one promise, one sub-line, one main button, a real product demo instead of a mockup.
- **NN/g progressive disclosure:** the voice questions fold behind "Answer two questions"; advanced key options stay folded.
- **Buffer (as the counter-example):** no feature grid on the homepage; three steps and a short FAQ.

**What was hidden or removed (nothing a user relied on was deleted):**
- Hidden: the two voice questions under a first draft (one tap opens them).
- Removed: the guest page's own older composer (replaced by the app's `Composer`); its second filled button per draft card; repeated failure lines for each platform with the same reason; the always-on empty status space in the key form.

**Brief items left out on purpose:**
- **Testimonials:** none until there's real beta feedback.
- **Amharic on the homepage:** not mentioned until it's checked end to end.
- **New packages** (`cmdk`, `chrono-node`, ai-loading-ux, Playwright MCP): not needed; we built small versions and used our own screenshot script.

**Still open:**
- Typed times are English only (FR-52).
- Check on a real account after merge: Post to Telegram now from the calendar and the bell (#87), and Ctrl+J in a chat (#89).

---

## 2026-11-20: Six AI providers, inspiration for structure, GitHub drafts, the logo (#67–#73)

**Result: all merged and live.** Each deploy passed its health check.

| PR | What | Requirement |
|---|---|---|
| #68 | Your own AI key (Gemini, Groq), circuit breaker, `ai_calls` log of every AI call (no text) | FR-48, NFR-19, NFR-20 |
| #69 | Local embeddings (fastembed `intfloat/multilingual-e5-small`, 384 dims, CPU, free) for the shared inspiration pool. Creators' posts are used **for structure only**, never their words. 675 creator posts + 24 templates loaded and tagged on the server | FR-41 |
| #70 | Structure examples picked by profession and goal; originality check (a draft ≥ 0.9 cosine to an example is rewritten once, then flagged); profession, audience and goal in Profile. Prompt fix for rule 10: no invented scenes, plans or sign-offs. Ten-topic eval: 9/10 before, 10/10 after | FR-41, FR-49, FR-19 |
| #71 | AI keys from six providers (Google, Groq, OpenAI, Anthropic, OpenRouter, Mistral), your own model choice, your key tried first, then the free models with a notice | FR-48 |
| #72 | GitHub → suggested drafts: connect GitHub (OAuth, no scopes) and optionally install the GitHub App for private repos (read-only). Rule-based score first, a small AI judge only above the threshold, an evening digest in your time zone, secrets scrubbed | FR-14 |
| #67 | The black-and-white "talking o" logo: favicon, app icon, link preview, sidebar, login (DESIGN.md §5) | — |
| #73 | The production compose file now passes `AI_KEY_ENCRYPTION_KEYS`, `GENERATION_MODELS_LIGHT` and `GITHUB_*` to the API | FR-48, FR-14 |

**Found on the way:** the production compose file lists every setting by hand, so the AI keys tab was off on the live site even with the key on the server (#73 fixed it). When you add a setting, add it to `deploy/docker-compose.prod.yml` and `deploy/server-env.template` too.

**Rules changed:** CLAUDE.md rule 3 now has two embedding spaces, never mixed: Gemini for users' own posts, the local model for the inspiration pool and the originality check.

**GitHub setup (done 20 Nov):** OAuth App (callback `/github/callback`) and GitHub App `voxlace` (App ID 5845221; Contents, Pull requests, Metadata read-only; events push, pull_request, release; webhook `/api/v1/webhooks/github`). All secrets are in the server's settings file. Checked live: the app key signs in to GitHub, and a re-sent webhook ping was accepted (202). The app's `.pem` is kept outside the repo; if it's lost, make a new key under the app's Credentials → Key pairs and delete the old one.

**Still open:**
- First real run: connect GitHub and install the app from Profile → GitHub, then check the evening digest.
- Real-key checks for OpenAI, Anthropic, OpenRouter and Mistral (only the request shapes are tested); `gpt-4.1-mini` as OpenAI's default is unverified.
- Phase 7: feedback on drafts, weekly beta report, the success bar, tester export guide.
- Ops before inviting testers: an off-server backup target (`BACKUP_REMOTE`), Supabase Site URL, invites to Supabase and Cloudflare, "Protect main" approvals back to 1.
- 50 old commits on `main` had an AI attribution trailer; history was rewritten on 19 Nov to remove it. Anyone with an old clone should re-clone or `git fetch && git reset --hard origin/main` on `main`.

---

## 2026-11-10: Open to anyone with the link; Nezira's access

**Result: anyone can try Voxlace without an account, and anyone can sign up without an invite.**
- Merged #65 (guest mode, FR-47; open sign-up, FR-28). Deploy passed.
- **Checked live:** a guest draft from a plain `curl` returned an X draft; the server has `GUEST_SIGNING_KEY` and `EDGE_SECRET`; `INVITE_ONLY` is off; the Worker `voxlace-edge` has `EDGE_SECRET`, so each visitor is counted by their own address; new users confirm their email first.
- **Nezira (`Jennah198`):** GitHub write access (the most a personal-account repo gives) and her SSH key logs in to the server as `deploy`. Host and paths are in `deploy/README.md`.

---

## 2026-11-19: Your own AI keys, faster fallback, every AI call measured (`feat/ai-keys-and-usage`)

**Why:** on the live server, all 17 drafts of the past 14 days came from Groq and none from Gemini (timeouts, 503 "high demand", 429 quota). Every draft still waited up to ~24 s on Gemini before Groq answered, and nothing recorded tokens or timing, so we couldn't tell what to fix.

**Built (FR-48, NFR-19, NFR-20; SRS 1.4):**
- **Your own AI keys:** Profile → AI keys takes a Google Gemini and/or Groq key. Each key is:
  - checked with the provider before saving, without spending quota;
  - encrypted (Fernet, `AI_KEY_ENCRYPTION_KEYS`; rotation supported);
  - shown only by its last four characters, never exported, and removed with the account.

  Drafts, revisions, cards and imports try the user's key first, then ours. Drafts on their key don't count towards the daily limit; past the limit, a user with a key keeps going on their key only. A key the provider later refuses shows "Not working" and is skipped.
- **Circuit breaker:** a model that fails 3 calls in a row, or says it's out for hours (daily quota, rejected key, removed model), is skipped for a while instead of slowing every draft. A failing model gets 2 tries while a backup waits, not 5.
- **`ai_calls`:** one row per AI call: purpose, model, whose key, tries, time, tokens in/out/thinking. Never any text. `python -m app.dev ai-report` prints the week as the table owner.
- **The topic is embedded once,** not once per platform (cache by text).
- **Two settings, off until tested:**
  - `GENERATION_MODELS_LIGHT`, a cheaper chain for the voice and summary cards;
  - `GEMINI_THINKING_LEVEL`, less Gemini thinking.

  Both change outputs, so they wait for the ten-topic before/after.
- Migration 0013: `user_ai_keys`, `ai_calls` (RLS; guests' rows have no user), `prompt_logs.key_source`.

**Checks:** backend ruff passes and 423 tests pass, 50 of them new (keys, breaker, encryption, records, limits, isolation). 0013 downgrades and upgrades cleanly. Frontend lint passes, 165 tests pass and the build works.

**To switch it on in production (after merge):**
1. Make a key with `python -m app.dev new-secret-key`.
2. Put it in the server's settings file as `AI_KEY_ENCRYPTION_KEYS`, and keep a copy with the backups.
3. Restart `api`.

Without the key the feature stays off and says so. Also add the three new lines from `deploy/server-env.template` to your local `.env.example` (that file is edited by hand, OPEN_QUESTIONS Q23).

**Not done, on purpose:**
- One call for all three platforms, and token-budgeted examples: these are prompt changes that need the ten-topic eval.
- Queue-instead-of-fail for drafts.
- Offline check-ins.

---

## 2026-11-04: UI finished, live deploy, demos for Phases 3–6

**Result: the V1 UI is merged and live; every skipped demo has run.**
- Merged #59 (calendar), #60 (Profile tabs), #61 (first-run welcome) and #62 (edge Worker). Every merge to `main` now deploys by itself (`DEPLOY_ENABLED=true`), and each of the four deploys passed its health check.
- **Live URL:** https://voxlace.fetehadin.com. A Cloudflare Worker forwards the subdomain to the shared Caddy (deploy/README.md), because our Cloudflare login can publish Workers but not edit DNS.
- **Demo data:** one inspiration author per platform, never mixed and never Fetehadin's own posts: X `simonw` (30 posts), LinkedIn `guillermo_rauch` (46), Telegram `Pavel Durov` (390 of 483 kept). All on a throwaway database with the dev user.
- **Phase 3, pass on platform shape:** the same check-in gave a 163-character X post, a 987-character LinkedIn post with a strong first line and a list, and an emoji-led Telegram post. *Open:* the LinkedIn and Telegram drafts added things the check-in didn't say ("I'm already sketching a script", a "What I do" list), plus a placeholder `— @mychannel` signature. That breaks rule 10. The fix is a prompt change, which is ask-first and needs the ten-topic before/after.
- **Phase 4, pass:** check-in → three drafts in 52 s → "Shorter" (26 s) → "End with a question" (21 s) → approve → X intent link pre-filled.
- **Phase 5 (V1 version), pass:** approving Telegram with a day picked 08:00 Addis, with the reason "audience in Addis Ababa · Telegram's morning peak · your own posts do well then". Moving it to 5 minutes from now put it in **Due**; Posted set `published_at`; publishing an unapproved draft gives `409 not_approved`.
- **Phase 6, pass:** with a removed model first in the chain, the draft came from Groq, and the prompt log names `openai/gpt-oss-120b` and `groq`. The UI doesn't name models, by design (DESIGN.md principle 2). `DELETE /me` removed all 467 posts and every row in 9 tables, plus the user.
- **Found on the way:** Gemini Flash answered 503/504 for the whole session. The local chain's last model, Groq `llama-3.3-70b-versatile`, no longer exists (404), so every draft failed until the chain changed. The server's chain had no Groq at all. Both now run `gemini-flash-latest → groq:openai/gpt-oss-120b → gemini-flash-lite-latest`. Groq is second because, with the 40 s deadline, a third Gemini model often gets under 10 s and is skipped. **Your local settings file still names the dead Llama model:** change its `GENERATION_MODELS` line to the one in `deploy/server-env.template`.
- **Hardening:**
  - `python -m app.dev check-models` sends one tiny prompt to each model in the chain and exits 1 if any fails; it runs daily by cron on the server.
  - `.github/workflows/uptime.yml` checks the live health endpoint every 30 minutes.
  - The nightly backup cron is installed (03:15 UTC), and one restore into a scratch database matched the live counts.
  - `backup.sh` is now executable.
- **Still open:**
  - `BACKUP_REMOTE` is empty, so backups stay on the server only. It needs an off-server target: an rsync host, or a Drive remote like TajStore's.
  - Supabase **Site URL** and redirect URL must be `https://voxlace.fetehadin.com` (Supabase dashboard → Authentication → URL configuration). Only sign-up confirmation emails depend on it, because login is email + password.
  - Phase 7: feedback form, export guide, invites.

## 2026-11-02: Task 4, UI/UX to DESIGN.md v3 (PRs #54–#57)

**Result: PRs 1–4 of the owner-approved 7-PR plan built; #54, #55 and #56 merged, #57 open.** The backend had the SRS 1.3 features (threads, notifications, approve with a day), but the UI was still the 21 Oct layout with the v2 palette. Owner decisions (2 Nov): shadcn/ui agreed; the prompt view only in dev builds; the Drafts "Check-ins" tab is cut (check-ins live in chat threads).
- #54: v3 zinc tokens, near-black primary, light and dark only.
- #55: hooks and mocks for threads, schedule, notifications, reminders, time zone and best hours. Also the shadcn/ui parts (dialog, menu, tabs, popover, sheet), copied from the shadcn repo because ui.shadcn.com is blocked here.
- #56: the app shell: chat history, Drafts → X · LinkedIn · Telegram, a notifications panel (bell below 1280px), and a guarded `handOff()` (rule 4).
- #57: the chat board: new chat, "Which platforms?", cards with reply, quick changes, selection-scoped revise, Preview, ⋯ (versions for other platforms, edit by hand, discard), approve → day → picked hour and why, and copy-and-open only once approved.
- Every PR: screenshots at 1280, 1024 and 390 in light and dark, the `design-reviewer` subagent and `/code-review`, with all must-fix items fixed before merging.
- Note: by CLAUDE.md the chat board is Phase 4 while the current phase is 3. The owner approved finishing the UI for backend work already merged (#46, #47).

**Next:** PR 5 Drafts per platform, PR 6 Calendar (day view, best hours), PR 7 Profile tabs (time zone, reminders, audience, channel).

## 2026-11-02: Task 3, merge #50–#52 and small follow-ups (`ccr-dcb4a37a-rurkna`)

**Result: #51 and #52 merged; follow-ups pushed on the branch, PR not opened yet.**
- #50 (one deadline for a whole draft, NFR-3) was already merged on 1 Nov.
- [#52](https://github.com/fetehadin/post-generator/pull/52) `323d518`: while backups remain, one model gets 60% of the time left, and Gemini is skipped rather than given under 10 s. Review: no must-fix; two nits are in the PR comment.
- [#51](https://github.com/fetehadin/post-generator/pull/51) `612013f`: inspiration pool per platform (`exemplar_posts`, migration 0010, FR-5). Updated from main by merge, CI green, second review: no must-fix.
- Before merging, the two together were checked on a fresh pgvector database: 0010 upgrades, downgrades and upgrades again; 349 backend tests pass. Frontend: 98 tests pass and the build works.
- On the branch:
  - `CLAUDE.md`: commits never carry `Co-Authored-By` or any other attribution trailer (the owner's rule).
  - `best-hours` leaves out hours that have passed (the same hours approving with a day can pick).
  - Telegram channel names are 5–32 characters; `t.me/`, `http://` and `telegram.me/` links are accepted. `docs/API.md` is updated.
- Checks on the branch after merging main: ruff passes, 351 backend tests pass; frontend lint passes, 98 tests pass and the build works.
- Tests now use their own database (`voxlace_test`, created by the first `pytest` run), never the dev database.
- **Your dev database:** run `alembic upgrade head` for 0009 and 0010.

**Next:** open the PR for this branch, then the Phase 3 demo (it needs a LinkedIn export), then the first Contabo deploy.

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

**Code**
- `ai/client.py`: the overall deadline is done (#50, #52). The `openai/gpt-oss` options and `GROQ_URL` could still move to settings (#45).
- Scheduling (#47):
  - A posting window over midnight takes its early hours from the start of `day`.
  - Two parallel `/schedule` calls can pick the same hour.
- Threads (#46):
  - `available_timezones()` is uncached; consider the `tzdata` package (a dependency) so time zone names don't depend on the server's operating system.
  - Missed posts have no lower age bound.
  - Deleting a thread's only draft leaves an empty thread.
  - Backfilled thread titles are cut at 80 characters, but the app cuts at 60.

**Docs**
- NFR-14 kept its id but changed meaning. FR-41 still mentions "the editor". FR-45 doesn't state its gap numbers.

**Local setup**
- Done on 2 Nov (#53): backend tests now always use `<your database>_test` on the same server, created on the first run. Your dev database and its real posts are never touched.
