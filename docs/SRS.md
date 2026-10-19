# Software Requirements Specification — Voxlace V1

| | |
|---|---|
| **Product** | Voxlace (working name) |
| **Version** | 1.2 — final V1 scope |
| **Date** | 13 October 2026 |
| **Authors** | Fetehadin Negash, Nezira |
| **Status** | Locked. Changes go through a pull request that edits this file. |

---

## Contents

1. [Introduction](#1-introduction)
2. [Overall description](#2-overall-description)
3. [Functional requirements](#3-functional-requirements)
4. [Non-functional requirements](#4-non-functional-requirements)
5. [External interfaces](#5-external-interfaces)
6. [Data model](#6-data-model)
7. [Platform rules](#7-platform-rules)
8. [Out of scope for V1](#8-out-of-scope-for-v1)
9. [Success metrics](#9-success-metrics)
10. [Traceability to the build plan](#10-traceability-to-the-build-plan)
11. [Change log](#11-change-log)

---

## 1. Introduction

### 1.1 Purpose

This document defines what Voxlace V1 must do and how well it must do it. Every requirement has a yes/no test. The two developers use it to decide what to build, and to check when something is done.

### 1.2 Product scope

Voxlace is a web app that learns a person's writing voice from their own exported posts, daily check-ins and profile. It drafts separate posts for **X**, **LinkedIn** and **Telegram**, following each platform's rules. The user reviews every draft, schedules it on a calendar and publishes it with one click.

V1 must prove one thing: **people actually publish the drafts it writes, with light edits.**

### 1.3 Definitions

| Term | Meaning |
|---|---|
| **Source post** | A post the user wrote in the past, imported from a platform export. |
| **Embedding** | A list of 768 numbers that represents the meaning of a text. Similar texts have close embeddings. |
| **RAG** | Retrieval-augmented generation. At draft time the app finds the user's most similar past posts and puts them in the prompt as examples. No model is trained. |
| **Voice card** | A short written summary of how the user writes on one platform, plus measured stats (length, emoji, hashtags). |
| **Summary card** | A ~150-word summary of the user's profile form and uploads, used in every prompt. |
| **Check-in** | A daily note the user writes on the chat board about what they did or think. |
| **Hand-off** | Moving an approved draft to its platform: pre-filled link (X), copy + open composer (LinkedIn), bot send (Telegram). |
| **Platform profile** | The rules for one platform: length limit, counting rule, tone and structure notes. Stored in the database. |
| **Fallback chain** | The ordered list of AI models the app tries when one is unavailable. |

### 1.4 References

- Pre-Build Plan (Claude Docs) — decisions, gotchas and sources behind this SRS.
- [`BUILD_PLAN.md`](BUILD_PLAN.md) — phases, task split and cycles.
- [`API.md`](API.md) — the first API contract.
- [pgvector README](https://github.com/pgvector/pgvector) · [Gemini API embeddings](https://ai.google.dev/gemini-api/docs/embeddings) · [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Telegram Bot API](https://core.telegram.org/bots/api)

---

## 2. Overall description

### 2.1 Product perspective

A new, standalone, multi-user web app (SaaS from day one, without billing). It depends on:

- **Google Gemini API** for embeddings and generation, with one extra free provider as a generation fallback.
- **A managed login provider** (Supabase Auth, used for login only; data stays in our own Postgres).
- **One Contabo VPS** the team already owns, running everything in Docker.
- **PostgreSQL + pgvector** for all data, including embeddings.
- **The Telegram Bot API** for channel publishing.
- **Static export files** the user uploads. No live reads from X or LinkedIn.

```mermaid
flowchart LR
    U[User in browser] -->|HTTPS + login token| FE[React app]
    FE -->|REST JSON| API[FastAPI backend]
    API --> DB[(Postgres + pgvector)]
    API -->|embed / generate| AI[Gemini + fallback provider]
    API -->|sendMessage| TG[Telegram Bot API]
    W[Worker] -->|every minute: due posts| DB
    W -->|sendMessage| TG
    FE -->|pre-filled link| X[X composer]
    FE -->|copy + open| LI[LinkedIn composer]
```

### 2.2 User classes

| User | Description | V1 support |
|---|---|---|
| **Builder** (primary) | A developer who ships work and wants to post about it regularly on X, LinkedIn and Telegram in their own voice. | Full |
| **Invited tester** | A builder invited by the team to try the app with their own data. | Full, invite-only |
| **Admin** | The two developers. Manage invites and platform profiles. | Via database and Settings; no admin UI |
| Other roles (designers, photographers…) | Need different profile fields. | Later |

### 2.3 Operating environment

- Modern desktop browsers (Chrome, Firefox, Safari, Edge — latest two versions). Mobile layout should work but is not tuned.
- Backend: Python 3.12+, FastAPI. Frontend: React + Vite + TypeScript on Node LTS.
- Database: PostgreSQL with pgvector (`pgvector/pgvector:pg18` image, locally and on the server).
- Hosting: one Contabo VPS running Docker Compose: Caddy (HTTPS + static frontend), API, worker, Postgres. Always on.

### 2.4 Constraints

| # | Constraint |
|---|---|
| C-1 | **No new cost.** The Contabo server the team already pays for, free-tier AI, no paid platform APIs. |
| C-2 | **No model training.** Quality comes from retrieval and prompts only. |
| C-3 | **No platform passwords, no scraping.** Only the user's own exports and official bot tokens. |
| C-4 | **X API costs money** ($0.015 per post, $0.20 with a URL), so X is hand-off only. |
| C-5 | **LinkedIn cannot be pre-filled**, so it is copy + open composer. |
| C-6 | **Telegram bots cannot use Telegram's native scheduled messages.** The app must keep the schedule and send at the due time itself. |
| C-7 | **The embedding model is fixed.** Vectors from different models cannot be compared, so there is no embedding fallback. |
| C-8 | **Free AI quota is shared** by every user of the project and resets at midnight Pacific time. |
| C-9 | **Free-tier Gemini data may be used to improve Google's products.** Users must be told before uploading. |

### 2.5 Assumptions and dependencies

- Users can request and download their own exports (LinkedIn takes 1–2 days to deliver).
- Users have at least ~20 past posts per platform for good style matching; below that the app warns and uses a shared example pool.
- Users click to publish on X and LinkedIn.
- The Contabo server stays up; Docker restarts crashed containers (`restart: unless-stopped`).

---

## 3. Functional requirements

**Priority:** **Must** = V1 core, required before inviting testers. **Should** = V1 stretch, added once the core works.

### 3.1 Import and embeddings

| ID | Requirement | Priority | Test |
|---|---|---|---|
| FR-1 | The user can upload an X archive, a LinkedIn archive and a Telegram export. The app reports how many posts it parsed from each. | Must | Import a sample of each; counts match the file. |
| FR-2 | Import skips replies, reposts and empty posts. Re-importing the same file creates no duplicates. | Must | Import twice; row count is unchanged. |
| FR-3 | A malformed file is rejected with a readable error, and nothing is half-saved. | Must | Upload a broken file; no rows are added. |
| FR-4 | Every imported post is embedded and stored with its user, platform and original date. | Must | After import, no post lacks an embedding. |
| FR-39 | The importer reads only the posts file from each export and discards everything else. | Must | Upload a full X archive; only posts are stored. |
| FR-44 | Import skips posts carrying any hashtag on the user's editable excluded list (default: religious, personal-life and shared-content tags), and embeds the best ~1,000 posts first, ranked by reactions and recency; the rest stay queued. | Must | Import a channel with #Family posts; none are stored. Import 2,000 posts; drafting works after the first 1,000 are embedded. |
| FR-32 | If the embedding service is unavailable, imports are queued and retried. The app never switches embedding models by itself. | Must | Block the embedding call; the import resumes later with no mixed vectors. |

### 3.2 Voice, profile and settings

| ID | Requirement | Priority | Test |
|---|---|---|---|
| FR-5 | The app builds a voice card and style stats per user and platform, and warns when a platform has fewer than 20 posts. | Must | Import 10 posts; the warning appears. |
| FR-17 | A new user fills in an "About you" form: role, stack, current projects, focus, posting goal, topics, audience, avoid list, voice words and links. Every field stays editable. | Must | Fill, reload, edit one field; values persist. |
| FR-18 | The app summarises the form and any uploads into a ~150-word summary card, shows it, and lets the user edit it before it is used. | Must | Edit the card; the next prompt log contains the edited version. |
| FR-22 | Settings has a tab per platform showing the platform rules, the user's voice card with its stats, and pinned example posts. | Must | Open each tab; all three parts show. |
| FR-23 | Platform rules (limit, counting rule, tone and structure notes) live in the database and can be edited without changing code. | Must | Edit the X tone note; the next prompt log shows it. |
| FR-24 | Each user sets a language, and prompts, voice cards and drafts use it. | Must | Set another language; the draft comes back in it. |
| FR-25 | The user can pin posts as examples and exclude posts from being used as examples. | Must | Exclude a post; it never appears in retrieval. Pin one; it always does. |
| FR-26 | The user can edit a voice card by hand, and regenerating it keeps those hand edits. | Must | Edit a line, regenerate; the line survives. |
| FR-33 | Onboarding asks where the audience lives for each platform, the user's discipline, and when they usually post. | Must | Finish onboarding; the answers appear in Settings. |
| FR-20 | The user can upload a resume (PDF or DOCX) and enter a website address, and the app extracts the text. | Should | Upload a sample resume; the extracted text appears. |
| FR-21 | Before any extracted text goes to the AI, phone numbers, email addresses and street addresses are removed, and the user reviews the cleaned text. | Should | Upload a resume with a phone and email; neither appears in the prompt log. |

### 3.3 Drafting

| ID | Requirement | Priority | Test |
|---|---|---|---|
| FR-6 | The user can save a daily check-in with a date, then view, edit and delete it. | Must | Create, edit and delete one. |
| FR-7 | Generating a draft needs a platform and a topic or a check-in. It retrieves only that user's posts for that platform. | Must | Generate for user A; no post from user B appears in the prompt log. |
| FR-8 | X, LinkedIn and Telegram each have their own generate action. | Must | Generate for one platform; the other two are untouched. |
| FR-9 | Each draft shows a live length count using that platform's rule, and blocks copy or publish when over the limit. | Must | Paste a 300-character draft for X; it is flagged. |
| FR-10 | An edit instruction revises the current draft, and earlier versions stay available. The user can also edit the text by hand. | Must | Ask "shorter"; a new version exists and the old one is viewable. |
| FR-40 | Each draft has a chat panel. The assistant knows the user's voice card, profile, platform rules and the day's check-in; every reply that changes the text creates a version. It can revise only a selected sentence, convert a draft to another platform, and asks a question instead of inventing a missing fact. | Must | Ask "mention my other project" with two projects in the profile; it asks which one. Select one sentence and ask "fix this"; only that sentence changes. |
| FR-41 | The app detects the type of post being drafted (launch, progress, lesson, opinion, humor, tip, event) and adds structure examples from the user's inspiration posts **on the same platform** that are strongest at that type: Telegram drafts learn only from Telegram channels the user admires, X drafts only from X accounts, LinkedIn drafts only from LinkedIn creators. Platforms are never mixed. They shape structure only; voice comes from the user's own posts and facts from FR-19. The editor names the creator it used, and the user can change or turn it off. | Should | Draft a launch for X; the editor shows a launch-strong X creator, never a Telegram channel. No 5-word phrase from any inspiration post appears in the draft. |
| FR-11 | Every draft is labelled AI-generated and has a status the user sets: draft, approved, published, discarded. | Must | Change the status; it persists after reload. |
| FR-19 | A draft may state facts only from the summary card, the day's check-in, or GitHub items the user approved. | Must | Request a draft with an empty check-in; it invents no metrics or projects. |
| FR-31 | Draft generation tries an ordered list of models from configuration, moves to the next when one is unavailable, rate-limited or removed, and records which model wrote each draft. | Must | Disable the first model; the draft arrives and names the second. |
| FR-14 | GitHub context lists today's commits and pull request titles, and the user can exclude items before they enter the prompt. | Should | Exclude one commit; it is absent from the prompt log. |

### 3.4 Calendar, scheduling and publishing

| ID | Requirement | Priority | Test |
|---|---|---|---|
| FR-12 | Approving a draft hands it off. **X:** opens the composer pre-filled. **LinkedIn:** copies the text and opens the composer. **Telegram:** "Publish now" sends it through the bot, or, if it has a scheduled time, the bot sends it then (FR-35). | Must | Approve one draft per platform; each behaves as described and the text arrives intact. |
| FR-13 | The user can place a draft on a calendar date and time and move it, and the app marks it due when the time arrives. | Must | Drag a draft to another day; it saves. |
| FR-35 | A due post triggers a reminder in the app, plus a Telegram message when a channel is connected. For Telegram, a scheduled job sends an **approved** post through the bot at its due time. | Must | Schedule an approved Telegram draft for the next minute; it appears in the channel within 5 minutes. |
| FR-42 | The user sets daily check-in reminders (days, local time, quiet hours, channel: in-app or Telegram DM from the bot). The worker sends them on time and skips days that already have a check-in. | Must | Set a reminder for the next minute; it arrives within 5 minutes and not again that day after a check-in. |
| FR-43 | Replying to a reminder in the Telegram bot saves the reply as that day's check-in and offers a draft back in the same chat. | Should | Reply to the bot; the check-in appears on the chat board. |
| FR-36 | A user connects a Telegram channel by adding the app's bot as an admin and entering the channel. The app confirms it can post before saving. | Must | Connect a channel without admin rights; it is refused with a message. |
| FR-16 | Suggested posting windows use the audience answers (location, discipline, usual hours) and are shown in the user's own time. | Should | Change the audience location; the window shifts. |
| FR-34 | Posting-time suggestions start from study-based defaults and switch to the user's own archive data once they have at least 50 posts with engagement numbers. | Should | Import 60 posts with likes; the suggestion cites the user's own data. |

### 3.5 Accounts, limits and privacy

| ID | Requirement | Priority | Test |
|---|---|---|---|
| FR-27 | Users sign up and log in through a managed login provider, and every API call is tied to the logged-in user. | Must | Call the API logged out; it returns 401. |
| FR-28 | Sign-up is invite-only: it needs an invite code or an allow-listed email. | Must | Sign up without a code; it is refused. |
| FR-29 | A user can never read another user's posts, drafts, profile or uploads, through the app or the API. | Must | As user B, request user A's draft; 403 or 404. |
| FR-30 | Each user has daily limits on drafts and embeddings, shown in the app. | Must | Pass the limit; a clear message, other users unaffected. |
| FR-37 | Before any upload, a new user sees a short privacy notice and must accept it. | Must | Skip the notice; uploads are blocked. |
| FR-38 | A user can export and delete all their data. | Must | Delete; every post, draft, profile and upload row is gone. |
| FR-15 | The app records, for each draft, whether it was published and how much it was edited, and shows a weekly publish rate. | Should (recording is Must) | Publish two of four drafts; the page shows 50%. |

---

## 4. Non-functional requirements

| ID | Category | Requirement | Test |
|---|---|---|---|
| NFR-1 | Cost | V1 adds no cost beyond the existing Contabo server: free-tier AI, no paid APIs. | Billing pages show $0 after a week of use. |
| NFR-2 | Setup | One command starts the database on a fresh machine; the README documents the rest. | A new clone runs with `docker compose up` plus the README steps. |
| NFR-3 | Performance | A draft returns within 20 seconds in normal conditions. | Time ten drafts. |
| NFR-4 | Resilience | When the AI service rate-limits (HTTP 429), the user sees a clear message and loses no input. | Simulate a 429; the text box keeps its content. |
| NFR-5 | Security | Secrets live in `.env`, are never committed, and `.env.example` documents them. | A repository search finds no keys. |
| NFR-6 | Safety | The app never asks for a social platform password and never publishes without the user's explicit approval. | Code review: no password field; every send traces to an approval. |
| NFR-7 | Privacy | Each user's posts and edits are used only for that user's drafts. | The FR-7 test passes for both users. |
| NFR-8 | Quality | Parsers have automated tests using anonymised sample exports, run in CI. | The suite runs in CI and passes. |
| NFR-9 | Maintainability | AI providers, model names and the embedding model are set in configuration, not scattered in code. | Change a model name in one place; the app uses it. |
| NFR-10 | Privacy | A user can delete all their imported data, including embeddings. | Run the delete; posts and embeddings are gone. |
| NFR-11 | Privacy | Raw uploaded files are never sent to the AI service. Only cleaned text the user reviewed may be sent. Raw files are deleted after parsing. | Inspect outgoing AI requests during an upload; no file content beyond cleaned text. |
| NFR-12 | Security | Website fetching accepts only public addresses and stops after a short timeout. | Enter a localhost address; it is rejected. |
| NFR-13 | Security | User data is isolated in the database (row-level security), not only in app code. | Query as user B; user A's rows are not returned. |
| NFR-14 | Reliability | Reminders and scheduled Telegram sends go out within 5 minutes of the due time, and a worker restart never sends a post twice. | Schedule five, restart the worker mid-way; all arrive once, within 5 minutes. |
| NFR-15 | Observability | Every draft stores its exact prompt, model and provider. | Open any draft's prompt log. |
| NFR-16 | Time | All times are stored in UTC and shown in the user's time zone. | Change the user's time zone; calendar times shift, stored values do not. |
| NFR-17 | Recoverability | The database is backed up nightly to storage off the server, and a restore has been tested. | Restore last night's backup into a fresh container; row counts match. |
| NFR-18 | Security | The server accepts SSH by key only, exposes only ports 80/443/SSH, and Postgres is not reachable from the internet. | Port scan from outside shows only 22, 80, 443. |

---

## 5. External interfaces

### 5.1 User interface

| Screen | Purpose |
|---|---|
| Sign in / invite | Managed login + invite code. |
| Onboarding | Privacy notice → About-you form → audience questions → export upload. |
| Chat board | Daily check-ins and draft requests in one stream, with history. |
| Draft editor | Draft text, live length counter, chat revisions, versions, status, hand-off buttons. |
| Draft library | All drafts filtered by status and platform. |
| Calendar | Week and month views; drag drafts to a date and time. |
| Settings | Tab per platform (rules, voice card + stats, pinned posts), profile, language, Telegram connection, usage, export/delete. |

### 5.2 Software interfaces

| Interface | Direction | Use |
|---|---|---|
| Gemini API (`google-genai` SDK) | Out | `gemini-embedding-2` at 768 dims for embeddings; Gemini Flash for drafts, summaries and voice cards. |
| Fallback provider (Groq, OpenRouter or Mistral) | Out | Generation only, when Gemini fails. |
| Supabase Auth (or Auth0) | In/Out | Login; backend verifies the JWT on every request. |
| Telegram Bot API | Out | `getChatMember` to verify admin rights; `sendMessage` to publish. |
| X web intent | Browser | `https://x.com/intent/tweet?text=…` pre-filled composer. |
| LinkedIn | Browser | Open the share composer; text goes via clipboard. |
| Worker process | Internal | Runs beside the API on the server; every minute it sends due Telegram posts and reminders. |
| GitHub REST API | Out | (Should) Public commits and PR titles for the day. |

### 5.3 Embedding format rules

- Request `output_dimensionality=768`.
- Stored posts: `title: none | text: <post>`. Queries: `task: search result | query: <topic>`.
- One content object per post. A plain list returns **one merged** embedding.

---

## 6. Data model

All tables except `exemplar_posts`, `platform_profiles` and `invites` carry `user_id`, protected by row-level security.

```mermaid
erDiagram
    users ||--o{ source_posts : owns
    users ||--o{ voice_cards : has
    users ||--o{ checkins : writes
    users ||--o{ drafts : owns
    drafts ||--o{ draft_versions : has
    drafts ||--o{ prompt_logs : logs
    users ||--|| profiles : has
    users ||--o{ uploads : has
    users ||--o{ platform_settings : sets
    users ||--o{ provider_usage : uses
    users ||--o| telegram_connections : connects
    users ||--o{ imports : runs
    drafts ||--o{ draft_messages : chats
    users ||--o{ inspiration_posts : collects
    users ||--o{ reminder_settings : sets
    invites |o--o| users : "used by"
```

| Table | Main columns | Purpose |
|---|---|---|
| `users` | id (from login provider), email, name, timezone, language, privacy_accepted_at, created_at | Accounts. |
| `source_posts` | id, user_id, import_id, platform, origin (import, voxlace), text, posted_at, external_id, likes, reposts, pinned, excluded, embedding `vector(768)`, embedding_model | Imported history, plus drafts the user published through Voxlace. Unique on (user_id, platform, external_id). |
| `imports` | id, user_id, platform, status, parsed, skipped (JSON), embedded, error, created_at, finished_at | One row per upload; progress for `GET /imports/{id}`. |
| `voice_cards` | user_id, platform, card_text, hand_edits, stats (JSON), updated_at | Style summary and measured habits. |
| `checkins` | id, user_id, day, text, created_at | Daily notes. |
| `drafts` | id, user_id, platform, topic, status, scheduled_for, reminder_sent_at, published_at, created_at | One row per post in progress. |
| `draft_versions` | id, draft_id, text, instruction, model, created_at | Every revision. |
| `prompt_logs` | id, draft_id, draft_version_id, prompt, model, provider, created_at | Exact prompt behind each draft and each revision. |
| `draft_messages` | id, draft_id, role (user, assistant), text, draft_version_id, created_at | The chat panel's conversation (FR-40). |
| `inspiration_posts` | id, user_id, creator, platform, text, post_type, likes, posted_at, embedding | Posts from creators the user admires, **per platform** (a Telegram channel only inspires Telegram drafts); structure examples only (FR-41). Never shown to other users. |
| `reminder_settings` | user_id, kind, days, local_time, timezone, channel, enabled, last_sent_at | Check-in and posting reminders (FR-42). |
| `profiles` | user_id, role, stack, current_projects, focus, goal, topics, audience, avoid_list, voice_words, links, discipline, usual_hours, excluded_hashtags, summary_card | About-you form, summary card and import exclusions; editable any time from the Profile page. |
| `platform_settings` | user_id, platform, audience_location, audience_timezone | Where each audience lives. |
| `uploads` | id, user_id, kind (resume, website), source, extracted_text, cleaned_text, created_at | Extracted and cleaned text. |
| `platform_profiles` | platform, char_limit, counting_rule, tone_notes, structure_notes, updated_at | Shared, editable platform rules. |
| `exemplar_posts` | id, platform, text, embedding | Shared, non-personal example pool for thin histories. |
| `invites` | code, email, used_by, created_at | Who may sign up. |
| `provider_usage` | id, user_id, provider, model, purpose, status, created_at | Limits and fallback debugging. |
| `telegram_connections` | user_id, channel_id, verified_at | Channel the bot may post to. |

**Indexing:** start with no vector index. pgvector's exact search is fast enough for a few thousand rows per user. Use B-tree indexes on `(user_id, platform)`. Query shape: `ORDER BY embedding <=> :q LIMIT :n`.

---

## 7. Platform rules

Seed values for `platform_profiles`, as of October 2026.

| Platform | Limit | Counting rule | V1 hand-off |
|---|---|---|---|
| X | 280 (25,000 with Premium) | Weighted: each URL = 23, most emoji = 2, CJK characters = 2 | Pre-filled compose link |
| LinkedIn | 3,000 | Plain count; ~210 characters show before "see more" | Copy + open composer |
| Telegram | 4,096 | Plain count | Bot sends now or at the scheduled time |

---

## 8. Out of scope for V1

- Billing, paid plans, teams, admin dashboard.
- Automatic posting to X and LinkedIn through their APIs.
- Trend feeds, niche outlier tracking, reply queues.
- AI-generated images.
- Model fine-tuning.
- Profile fields for non-developer roles.
- Natural-language bulk commands ("create four posts for this week").
- LinkedIn analytics import.

---

## 9. Success metrics

| Metric | Definition | Target to beat during beta |
|---|---|---|
| **Publish rate** (primary) | Published drafts ÷ generated drafts, per user per week | Set before beta starts (suggested ≥ 40%) |
| Edit intensity | Character difference between first version and published text | Trending down per user over time |
| Activation | Users who import an export and generate a first draft in their first session | Most invited testers |
| Weekly habit | Users who generate again within 7 days, unprompted | Set before beta starts |

---

## 10. Traceability to the build plan

| Phase in [`BUILD_PLAN.md`](BUILD_PLAN.md) | Requirements delivered |
|---|---|
| 0 — Foundations | NFR-2, NFR-5, NFR-8 (CI), NFR-9 |
| 1 — Core voice loop (Telegram) | FR-1 (Telegram), FR-2, FR-3, FR-4, FR-7, FR-39, FR-44, NFR-15 |
| 2 — Accounts and isolation | FR-27, FR-28, FR-29, FR-37, NFR-7, NFR-13, NFR-18 |
| 3 — All platforms and voice | FR-1 (X, LinkedIn), FR-5, FR-9, FR-17, FR-18, FR-22–FR-26, FR-33, FR-41 |
| 4 — Drafting workflow | FR-6, FR-8, FR-10, FR-11, FR-19, FR-40, FR-12 (X, LinkedIn) |
| 5 — Calendar, Telegram publishing and reminders | FR-12 (Telegram), FR-13, FR-35, FR-36, FR-42, FR-43, NFR-14, NFR-16 |
| 6 — SaaS hardening and deploy | FR-30, FR-31, FR-32, FR-38, NFR-1, NFR-3, NFR-4, NFR-10, NFR-11, NFR-17 |
| 7 — Private beta | FR-15, success metrics |
| Stretch | FR-14, FR-16, FR-20, FR-21, FR-34, NFR-12 |

---

## 11. Change log

| Version | Date | Change |
|---|---|---|
| 1.2 | 17 Oct 2026 | Added FR-40 (chat panel on each draft), FR-41 (inspiration picked by post type), FR-42 (daily check-in reminders), FR-43 (reply to the bot = check-in), FR-44 (excluded hashtags, best-1,000 import cap). New tables `imports`, `draft_messages`, `inspiration_posts`, `reminder_settings`; `source_posts` gains `origin`, `import_id`, `embedding_model`. Decisions behind them: OPEN_QUESTIONS Q2, Q3, Q5, Q24–Q27. |
| 1.1 | 14 Oct 2026 | Hosting moved to the team's Contabo VPS: always-on worker replaces the external cron; Supabase used for login only; added NFR-17 (backups) and NFR-18 (server hardening). |
| 1.0 | 13 Oct 2026 | First locked V1. Built from the Pre-Build Plan. Clarified: Telegram is sent by the app at the due time because bots cannot schedule natively (FR-12, FR-35); NFR-6 reworded to "never without explicit approval"; NFR-11 reworded for a hosted app; added NFR-15, NFR-16 and a priority column. |
