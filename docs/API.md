# API Contract — Voxlace V1

The agreement between the backend and the frontend. **Change this file in the same pull request as the code.** Once the backend runs, FastAPI also serves live docs at `/docs`.

- Base URL (local): `http://localhost:8000/api/v1`
- Auth: `Authorization: Bearer <Supabase access token>` on every route except `/health`. Locally, with no login configured (`APP_ENV=development` and no `SUPABASE_URL` / `SUPABASE_JWT_SECRET`), a request without a token is the dev user; never in production.
- Live docs: run the backend and open <http://localhost:8000/docs> to try every endpoint in the browser.
- Times: ISO 8601 in UTC (`2026-10-14T06:30:00Z`). The frontend converts to local time.
- Platforms: `"x" | "linkedin" | "telegram"`.

## Error shape

Every error returns the same body:

```json
{ "error": { "code": "invalid_file", "message": "A sentence the user can act on." } }
```

Validation errors (422) also list the fields:

```json
{ "error": { "code": "validation_error", "message": "Some fields are missing or invalid.", "fields": [ { "field": "topic", "problem": "Field required" } ] } }
```

| Status | `code` |
|---|---|
| 400 | `invalid_file`, `unsupported_platform`, `missing_topic`, `no_posts`, `invalid_cursor`, `invalid_invite` |
| 401 | `not_logged_in`: no token, or it's expired, forged or not for a logged-in user |
| 403 | `invite_required` (logged in, but not admitted yet), `privacy_required` (`POST /imports` before accepting the notice) |
| 404 | `not_found`: also for another user's data (never reveal it exists) |
| 422 | `validation_error` (with `fields`) |
| 429 | `rate_limited`, `daily_limit_reached` (from Phase 6) |
| 500 | `internal_error` |
| 503 | `ai_unavailable`: the user's input is in their own request, nothing is lost |

All ids are UUIDs.

---

## Phase 1 — core voice loop (built)

### `GET /health`

```json
{ "api": "ok", "db": "ok" }
```

`db` is `"error"` when the database is unreachable; the endpoint itself still answers.

### `POST /imports` → `201`

`multipart/form-data` with `platform` and `file` (at most 64 MB). The file is parsed in memory and never stored.

| `platform` | `file` |
|---|---|
| `telegram` | A Telegram Desktop single-channel `result.json` |
| `x` | The X archive ZIP as downloaded (only `data/tweets*.js`, `data/note-tweet.js` and the account id in `data/account.js` are read), or a bare `tweets.js` |
| `linkedin` | The LinkedIn export ZIP (only `Shares.csv` is read) or `Shares.csv` on its own. An export without `Shares.csv` is refused with how to request the right one |

```json
{
  "id": "0f8c2a6e-5c1b-4b8e-9a51-3c2f1d7e9b10",
  "platform": "telegram",
  "status": "embedding",
  "parsed": 412,
  "skipped": { "service": 21, "forwarded": 135, "empty": 50, "too_short": 54, "link_only": 32, "excluded_topic": 4, "already_imported": 0 },
  "embedded": 0,
  "waiting": 412
}
```

- `parsed`: the user's own posts found in the file.
- `skipped`: a count per reason. Keys appear only when non-zero: `service`, `forwarded`, `empty`, `too_short`, `link_only`, `excluded_topic`, `duplicate`, `invalid`, `already_imported`, and for X `reply` (to other people; your own threads are kept) and `repost`.
- `premium_hint` (X only, in the upload response): `true` when the archive has a post over 280 from the last 90 days, which only Premium accounts can make (OPEN_QUESTIONS Q31). `null` otherwise and on `GET /imports/{id}`.
- Embedding starts in the background, best posts first, about 100 a minute on the free tier.

### `GET /imports/{id}`

Same shape. `status` moves `embedding → done`; `embedded` counts up and `waiting` counts down. Calling it also resumes embedding if the server restarted in between.

### `GET /posts?platform=telegram&q=…&show=all&limit=50&cursor=…`

Newest first. `q` finds posts containing those words (case-insensitive; `%` and `_` are literal). `show` is `all` (default), `pinned` or `excluded`. `limit` 1–200 (default 50). Pass `next_cursor` back as `cursor` for the next page; it is `null` on the last page.

```json
{
  "items": [
    { "id": "6d1e…", "platform": "telegram", "text": "Shipped the parser today…", "posted_at": "2026-09-02T14:10:00Z", "likes": 12, "pinned": false, "excluded": false, "embedded": true }
  ],
  "next_cursor": "MjAyNi0wOS0wMlQxNDoxMDowMCswMDowMHw2ZDFl…"
}
```

### `PATCH /posts/{id}`

FR-25: pin a post (always used as an example) or exclude it (never used). Send either field; setting one to `true` clears the other.

```json
{ "pinned": true }
```

Returns the post in `GET /posts`'s item shape. Another user's post is `404`.

### `POST /drafts/generate` → `201`

```jsonc
// request; checkin_id arrives with check-ins in Phase 4
{ "platform": "telegram", "topic": "Finished the Telegram importer", "checkin_id": null }
```

```jsonc
// response
{
  "id": "a3b9…",
  "platform": "telegram",
  "status": "draft",
  "text": "6/10 — #10DaysGrind | STATUS REPORT 🪖 …",
  "length": { "count": 305, "limit": 4096, "over": false },
  "model": "gemini-3.8-flash",   // the model version that actually wrote it
  "examples_used": 8,
  "created_at": "2026-10-19T06:30:00Z"
}
```

`length.count` uses the platform's rule (X: links 23, most emoji 2). Errors: `missing_topic`, `no_posts` (nothing imported and embedded yet), `ai_unavailable`.

### `GET /drafts/{id}/prompt`

The exact prompt behind the draft's first version.

```json
{ "prompt": "…the exact text sent…", "model": "gemini-flash-latest", "model_version": "gemini-3.8-flash", "provider": "google" }
```

---

## Phase 2 — accounts (built)

Login itself happens in the browser with Supabase; the API only verifies the token (signature, expiry, audience `authenticated`, issuer). The user id is the token's `sub`. A person must be **admitted** before any other route works: by redeeming an invite code, or because their email is in `ALLOWED_EMAILS`.

### `GET /me`

Works for any valid token, admitted or not.

```json
{ "id": "6f1c…", "email": "sam@example.com", "admitted": true, "privacy_accepted": false, "timezone": "UTC" }
```

### `POST /me/invite`

```json
{ "code": "VX-2F7DBD-7FD349" }
```

Returns the same shape as `GET /me`. Codes are case-insensitive and work once; a code made for one email works only for that email. Error: `400 invalid_invite`. Admins create codes with `python -m app.dev invite [--email sam@example.com]`.

### `POST /me/privacy-accept`

Records that the user accepted the privacy notice (FR-37) and returns `GET /me`'s shape. Until then `POST /imports` answers `403 privacy_required`.

---

## Phase 3 — profile (built)

### `GET /profile`

Everything the user told Voxlace (FR-17, FR-18, FR-24, FR-33, FR-44). Created with defaults on first read.

```json
{
  "role": "Backend developer", "stack": "Python, FastAPI", "current_projects": "Voxlace",
  "focus": "", "goal": "", "topics": "Python, AI", "audience": "Ethiopian devs on Telegram",
  "avoid_list": "", "voice_words": "", "links": "", "discipline": "", "usual_hours": "",
  "language": "auto",
  "excluded_hashtags": ["#family", "#me"],
  "summary_card": "I build Voxlace…",
  "summary_updated_at": "2026-10-21T16:00:00Z",
  "post_window_start": "08:00:00",
  "post_window_end": "22:00:00",
  "seniority": "Mid-level", "facts": "Voxlace has 40 beta users", "emoji_habit": "", "hashtag_habit": "",
  "portfolio_url": "https://me.dev",
  "projects": [{"name": "Voxlace", "line": "drafts posts in your voice", "link": "", "status": "building"}]
}
```

- `facts`: things the user is happy for drafts to state (numbers, results, dates). They go into the summary card like every other answer (FR-19).
- `projects`: up to 20, each `{name, line, link, status}` (`status`: `idea`, `building`, `live` or `paused`; only `name` is required). A list, so the chat can ask which project (FR-40).
- `language`: `"auto"` writes in the same language mix as the user's posts; any other value adds "Write the post in <language>." to the prompt.
- `excluded_hashtags`: the user's list (lower-case, with `#`), used by every import. The default list until the user edits it.
- `summary_card`: allowed facts for every draft, next to the day's topic (FR-19). Empty means the prompt is exactly as before.

### `PUT /profile`

Send only the fields that change (same names as above, except `summary_updated_at`). Strings are trimmed and hashtags normalised. Editing `summary_card` sets `summary_updated_at`. Returns `GET /profile`'s shape. `post_window_start`/`post_window_end` are the hours the user can post, on their own clock (a window may cross midnight, e.g. 20:00–02:00); the same start and end → `400 empty_window`.

### `POST /profile/summary`

The AI writes a ~150-word first-person card **only from the user's answers**, the resume and portfolio text they marked reviewed (see Uploads below), and up to 5 of their own top posts (for topics and tone). It saves the card and returns `GET /profile`'s shape. The user can edit it with `PUT`. Error: `503 ai_unavailable` (answers are kept).

### Uploads: resume and portfolio (FR-20, FR-21, NFR-11, NFR-12)

Text from a resume or a public portfolio page, used only for the summary card. The file or page itself is never kept. Emails, phone numbers and street-address lines are removed **before** anything is saved. Only text the user marked reviewed reaches the AI. Both uploads need the privacy notice accepted (`403 privacy_required`, FR-37).

```json
{
  "id": "uuid", "kind": "resume", "source": "cv.pdf",
  "text": "Backend developer…", "removed": {"emails": 1, "phones": 2},
  "reviewed": false, "created_at": "2026-10-31T10:00:00Z", "updated_at": "2026-10-31T10:00:00Z"
}
```

- `POST /uploads/resume`: multipart `file`, a PDF or DOCX up to 5 MB → `201` and the upload. Errors: `400 invalid_file` (wrong type, too large, unreadable or password-protected) and `400 no_text` (a scanned PDF, or no text left).
- `POST /uploads/portfolio`: `{"url": "https://me.dev"}` → `201`. Only `http`/`https` on ports 80 and 443, where the name resolves to public addresses only. Every redirect is checked again (at most 3), with a 10-second timeout and a 2 MB limit. Errors: `400 invalid_url` (localhost, private networks or a bad address) and `400 fetch_failed` (unreachable, not a web page, too large, or a non-200 answer).
- `GET /uploads` → `{"items": [upload, …]}`, newest first.
- `PATCH /uploads/{id}`: `{"text"?: "…", "reviewed"?: true}`. Edited text is cleaned again, so a pasted phone number is still removed, and the counts in `removed` add up. Blank `text` → `400 missing_text`.
- `DELETE /uploads/{id}` → `204`.
- Someone else's upload → `404 not_found`.

---

## Phase 3 — platforms and voice (built)

### `GET /platforms/{platform}`

One Profile tab per platform (FR-22): its rules, the user's voice card and stats, and settings. `platform` is `telegram`, `x` or `linkedin` (anything else → 422).

```json
{
  "platform": "x",
  "rules": { "char_limit": 280, "counting_rule": "x_weighted", "tone_notes": "…", "structure_notes": "…" },
  "effective_limit": 25000,
  "stats": {
    "post_count": 72, "thin": false, "median_length": 210, "median_lines": 3,
    "emoji_share": 0.4, "hashtag_share": 0.1, "link_share": 0.3, "question_share": 0.2,
    "ethiopic_share": 0.05, "top_hashtags": ["#python"]
  },
  "voice_card": "- Opens with a one-line hook…",
  "voice_card_updated_at": "2026-10-22T09:00:00Z",
  "x_premium": true,
  "premium_source": "export",
  "audience_places": [{ "timezone": "Africa/Addis_Ababa", "share": 70 }, { "timezone": "Europe/Berlin", "share": 30 }],
  "audience_profession": "developers",
  "goal": "grow my channel",
  "posts_per_week": 4,
  "channel": null
}
```

- `stats` are measured from the user's own, not-excluded posts on this platform each time. Shares are 0–1. `thin` is true under 20 posts (FR-5): show a warning.
- `effective_limit` is what drafts are checked against: 25,000 for X with Premium, otherwise `rules.char_limit` (Q31). Prompts still ask for the short limit.
- `x_premium` / `premium_source`: X only. `null` = unknown. An X import with a recent post over 280 sets it to `true` with source `export`, unless the user already answered.

### `PUT /platforms/{platform}/voice-card`

`{"voice_card": "…"}` (max 3,000 characters). The user's hand edit. Returns `GET`'s shape.

### `POST /platforms/{platform}/voice-card`

The AI (re)writes the card from the stats and a sample of the user's posts (style only, no facts). Lines the user wrote or changed by hand are kept word for word (FR-26). Returns `GET`'s shape. Errors: `400 no_posts`, `503 ai_unavailable`.

When a card exists, drafts for that platform add it before the example posts. An empty card leaves the prompt unchanged.

### `PUT /platforms/{platform}/settings`

Send only what changes; returns `GET`'s shape.

| Field | Rule |
|---|---|
| `x_premium` | X only (`400 not_supported` otherwise). The user's answer always wins over the export's guess (Q31). |
| `audience_places` | Up to 3 `{"timezone", "share"}` (IANA name, share 1–100 in percent; shares are weighed against each other). Unknown zone → `400 invalid_timezone`; the same zone twice → `400 duplicate_place`. `[]` (or `null`) = the audience lives where the user does (FR-33). |
| `audience_profession` | `general`, `developers`, `business`, `students` or `creatives`; `null` → `general`. |
| `goal` | Free text, up to 500 characters. |
| `posts_per_week` | 0–50. |
| `channel` | Telegram only: the channel's public name (`@fetescript`, `fetescript` or `https://t.me/fetescript` → saved as `fetescript`); used for the hand-off (FR-12). Bad name → `400 invalid_channel`; `""` clears it. |

### `GET /platforms/{platform}/best-hours?start=2026-10-26&days=7`

Each day's hours scored for this platform's audience (FR-16, FR-34). `days` 1–42 (default 7).

```json
{
  "platform": "telegram", "timezone": "Africa/Addis_Ababa", "source": "studies",
  "days": [ { "date": "2026-10-26", "scores": [0.21, 0.12, "… 24 values, the user's local hours"], "best": [19, 9, 20] } ]
}
```

- A score is how active the audience is at that hour of the user's day, 1.0 = the day's best. Each audience place is looked up on its own clock (study curves per platform and weekday, reshaped by the audience's profession), then weighed by share.
- `best`: the top three hours inside the user's posting window (`post_window_start`/`end` in `GET /profile`), best first.
- `source` is `your_posts` once the user has 50+ posts with reactions on this platform: their own results are blended in per hour, weighted by how many posts back each hour.

---

## Phase 4 — drafting workflow (built)

### Check-ins (FR-6)

| Method and path | Body | Returns |
|---|---|---|
| `POST /checkins` | `{"text": "…", "day": "2026-10-22"}` (`day` optional: the user's own date; default today in UTC) | `201` a check-in |
| `GET /checkins` | | `{"items": [check-in]}`, newest day first (60 at most) |
| `PATCH /checkins/{id}` | `{"text"?, "day"?}` | the check-in |
| `DELETE /checkins/{id}` | | `204` |

A check-in: `{"id", "day", "text", "created_at", "updated_at"}`. Another user's id → `404`.

### `POST /drafts/generate` (changed)

`topic` may now be empty: the draft is written from the user's summary card ("Generate post" with an empty box, FR-19). With no topic **and** no card → `400 missing_topic`. `checkin_id` (optional) links the draft to the user's own check-in (`404` if it isn't theirs). Numbers in the summary card count as given facts.

### `GET /drafts`

Query (all optional): `status` (`draft|approved|published|discarded`), `platform`, `scheduled_from` / `scheduled_to` (UTC, for the calendar; sorted by time), `created_from` (UTC, e.g. the start of the user's today for Home). Returns `{"items": [row]}`, at most 100.

A row:

```json
{
  "id": "…", "platform": "x", "status": "approved",
  "text": "the current version",
  "length": { "count": 238, "limit": 280, "over": false },
  "scheduled_for": "2026-10-23T15:00:00Z", "published_at": null,
  "created_at": "…", "updated_at": "when the current version was made",
  "thread_id": "the chat it lives in"
}
```

### `GET /drafts/{id}`

A row plus the editor's data: `topic`, `checkin_id`, `versions` (`[{"id", "number", "text", "instruction", "created_at"}]`, oldest first; `instruction` is null for v1, "Edited by hand", "Restored v2" or the chat request) and `messages` (`[{"id", "role": "user|assistant", "text", "version_id", "created_at"}]`). Another user's draft → `404`.

### `PATCH /drafts/{id}`

`{"text"?, "status"?, "scheduled_for"?}`, any subset. Returns `GET /drafts/{id}`'s shape. The rules:

- `text`: a hand edit becomes a new version (no change, no version). Only while `status` is `draft` → else `409 not_editable`.
- `status: "approved"`: refused while the text is over the limit → `409 over_limit` ("Cut N characters…").
- `status: "draft"` or `"discarded"`: also takes it off the calendar (`scheduled_for` → null).
- `status: "published"` (the calendar's **Posted** button): only from `approved` → else `409 not_approved`; sets `published_at`. Final: any later status change → `409 already_published`.
- `scheduled_for`: UTC **with an offset** (a time without one → `422`). Needs `approved` (it may be approved in the same request) → else `409 not_approved`. More than 5 minutes in the past → `400 in_the_past`. `null` removes it from the calendar.

### `POST /drafts/{id}/revise`

`{"instruction": "Shorter", "selection"?: "one sentence from the text"}`. The chat (FR-10, FR-40): the AI revises the current text into a new version, using the user's voice card, summary card, topic and the platform rules, and only given facts. With `selection`, only that part changes (`400 selection_changed` if it isn't in the text any more). If a fact is missing, the assistant asks a question instead and no version is made. Both lines are saved to `messages`; the prompt is logged. Only while `draft` → else `409 not_editable`. `503 ai_unavailable` when the AI is busy.

### `POST /drafts/{id}/schedule`

Approve and put on the calendar in one step (FR-45). `{"day": "2026-10-26", "at"?: "2026-10-26T13:30:00+03:00"}`.

```json
{
  "draft": { "…": "a GET /drafts row, now approved with scheduled_for" },
  "scheduled_for": "2026-10-26T16:00:00Z",
  "rank": 1,
  "reason": "70% of your audience is in Addis Ababa (19:00 there) · Telegram's evening peak",
  "warning": null
}
```

- Without `at`, the app picks the best hour of that day (the user's own day) inside their posting window and at least 15 minutes from now, skipping an hour the clock jumps over (daylight saving). The first post on that platform that day gets the best hour; later ones the best hour at least 2 h (X), 3 h (Telegram) or 4 h (LinkedIn) from the others.
- `rank`: the post's place in that day's order on this platform (1 = earliest).
- `warning`: the day is full so the gap couldn't be kept, a second LinkedIn post that day, or a picked `at` outside the posting window.
- With `at`, that time is used (`reason`: "You picked this time."). It must fall on `day` in the user's time zone → else `400 wrong_day`.
- Approval rules still apply: `409 over_limit`, `409 already_published`. A discarded draft → `409 discarded` (restore it first). Another user's draft → `404 not_found`. No hour left that day → `400 no_time_left`.

### `POST /drafts/{id}/versions/{version_id}/restore`

Copies an earlier version as the newest one ("Restored v2"). Only while `draft`.

---

## Account, limits and stats (built)

### `GET /me/usage`

Today's use against the daily limits (FR-30), per UTC day:

```json
{ "drafts": 12, "draft_limit": 40, "posts": 412, "post_limit": 3000, "resets_at": "2026-10-23T00:00:00Z" }
```

- `drafts` counts every AI writing call: new drafts and chat revisions. At the limit, `POST /drafts/generate` and `POST /drafts/{id}/revise` return `429 daily_limit` (the user's text is in their own request, so nothing is lost).
- `posts` counts posts added by imports today (each is embedded once). An import that would add more new posts than are left returns `429 daily_limit` and saves nothing. Re-importing known posts costs nothing.
- Limits come from settings (`DAILY_DRAFT_LIMIT`, `DAILY_POST_LIMIT`).

### `GET /me/export`

Everything the user gave Voxlace or made with it, as one JSON download (FR-38): account email and time zone, reminder, profile and summary card, resume and portfolio text, voice cards, platform settings, posts (no embeddings), check-ins, threads, and drafts with their versions and chat. `Content-Disposition: attachment`.

### `DELETE /me`

Body `{"confirm": "delete"}` (any case) → `204`. Deletes the user's row and, by cascade, every row they own: posts and embeddings, imports, profile, uploads, voice cards, check-ins, drafts, versions, chat and prompt logs (FR-38, NFR-10). Anything else in `confirm` → `400 confirm_required`. The Supabase login stays; without data or an invite it can't use the app.

### `GET /drafts/stats`

The last 7 days (FR-15): `{"created": 4, "published": 2, "publish_rate": 0.5, "edited": 0.12}`. `edited` is how much posted drafts changed from their first version on average, 0 (as written) to 1 (rewritten). Both rates are `null` when there's nothing to measure.

### Edge rules added

- `POST /checkins` and `PATCH /checkins/{id}` with only spaces → `400 missing_text`.
- `PATCH /drafts/{id}` with blank `text` → `400 missing_text`.
- An empty answer from the AI saves nothing and returns `503 ai_unavailable`.

---

## Chat board, notifications and time zone (SRS 1.3)

### Threads (FR-40, FR-46)

A thread is one conversation: what the user did today (saved as that day's check-in), the drafts made from it and every revision, in order. A message with a `card` is a draft version; every reply that changes a draft adds a new card. `POST /drafts/generate` still works and now puts its draft in a new thread of its own (its response gains `thread_id`).

| Method and path | Body | Returns |
|---|---|---|
| `POST /threads` | `{"text": "…", "day"?: "2026-10-22"}` (`day` defaults to today on the user's clock) | `201` a thread |
| `GET /threads` | | `{"items": [{"id", "title", "platforms": ["telegram"], "updated_at"}]}`, last touched first, 50 at most |
| `GET /threads/{id}` | | a thread; another user's → `404` |
| `POST /threads/{id}/generate` | `{"platforms": ["x", "linkedin"]}` (1–3) | `201` a thread with one new card per platform; a platform that couldn't be written is in `failures` and the others still arrive |
| `POST /drafts/{id}/convert` | `{"platform": "linkedin"}` | `201` the draft's thread with a new draft for that platform written from this one; the original is unchanged. Same platform → `400 same_platform` |
| `DELETE /drafts/{id}` | | `204`; only a `discarded` draft → else `409 not_discarded` |

A thread:

```jsonc
{
  "id": "…", "title": "Finished the Telegram importer", "checkin_id": "…",
  "checkin_text": "Finished the Telegram importer and wrote tests",
  "created_at": "…", "updated_at": "…",
  "messages": [
    { "id": "…", "role": "user", "text": "Finished the Telegram importer…", "draft_id": null, "card": null, "created_at": "…" },
    { "id": "…", "role": "assistant", "text": "", "draft_id": "d1",
      "card": { "version_id": "…", "number": 1, "text": "the draft", "length": { "count": 238, "limit": 280, "over": false } } },
    { "id": "…", "role": "user", "text": "Shorter", "draft_id": "d1", "card": null },
    { "id": "…", "role": "assistant", "text": "v2: Shorter", "draft_id": "d1", "card": { "number": 2, "…": "…" } }
  ],
  "drafts": [ /* each draft's current state, as a GET /drafts row */ ],
  "failures": [ { "platform": "linkedin", "code": "no_posts", "message": "…" } ]   // generate only
}
```

Hand edits ("Edited by hand") and restores ("Restored v2") also add a card, with `role: "user"`. Revising stays `POST /drafts/{id}/revise`; read the thread again afterwards.

### `PATCH /me`

`{"timezone": "Africa/Addis_Ababa"}` (an IANA name; unknown → `400 invalid_timezone`). Returns `GET /me`'s shape, which now includes `timezone` (default `"UTC"`). The app sends the browser's zone on first use; Profile can change it. Stored times stay UTC (NFR-16).

### `GET /me/notifications`

Asked by the app every minute (FR-35, FR-42). Nothing is ever sent from the server.

```json
{ "due": [row], "missed": [row], "checkin_reminder": true }
```

- `due`: approved posts from 10 minutes before their time to 30 minutes after.
- `missed`: approved posts whose time passed more than 30 minutes ago and that aren't marked Posted.
- `checkin_reminder`: the reminder is on, today is one of its days, its time has passed on the user's clock, and there's no check-in for today yet.

### `GET /me/reminders` · `PUT /me/reminders`

`{"enabled": true, "days": [0, 1, 2, 3, 4], "local_time": "18:00"}`: days are 0 (Monday) to 6 (Sunday); the time is on the user's own clock. Default: off, weekdays, 18:00. A day outside 0–6 → `422`.

### Publishing what you posted

When a draft becomes `published`, its text is also saved as one of the user's own posts (`origin: "voxlace"`) and embedded by the background retry, so future drafts learn from it.

---

## Later phases (shape to be agreed at the start of each phase)

| Phase | Method and path | Purpose |
|---|---|---|
| After V1 | `POST /telegram/connect` · `POST /drafts/{id}/publish` | Telegram bot: connect a channel; publish now (FR-36) |
