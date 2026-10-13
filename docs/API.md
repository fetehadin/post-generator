# API Contract — Voxlace V1

The agreement between the backend and the frontend. **Change this file in the same pull request as the code.** Once the backend runs, FastAPI also serves live docs at `/docs`.

- Base URL (local): `http://localhost:8000/api/v1`
- Auth: `Authorization: Bearer <login token>` on every route except `/health` (from Phase 2; Phase 1 uses a dev user).
- Times: ISO 8601 in UTC (`2026-10-14T06:30:00Z`). The frontend converts to local time.
- Platforms: `"x" | "linkedin" | "telegram"`.

## Error shape

Every error returns the same body:

```json
{ "error": { "code": "rate_limited", "message": "The AI service is busy. Try again in a minute." } }
```

| Status | `code` examples |
|---|---|
| 400 | `invalid_file`, `over_limit`, `missing_topic` |
| 401 | `not_logged_in` |
| 403 / 404 | `not_found` (never reveal another user's data exists) |
| 429 | `rate_limited`, `daily_limit_reached` |
| 503 | `ai_unavailable` |

---

## Phase 1 — core voice loop

### `GET /health`

```json
{ "api": "ok", "db": "ok" }
```

### `POST /imports`

`multipart/form-data` with `platform` and `file`.

```json
{
  "id": "imp_01",
  "platform": "telegram",
  "status": "embedding",
  "parsed": 412,
  "skipped": { "empty": 31, "replies": 0, "duplicates": 0 },
  "embedded": 0
}
```

### `GET /imports/{id}`

Same shape; `status` moves `parsing → embedding → done | failed`, and `embedded` counts up.

### `GET /posts?platform=telegram&limit=50&cursor=…`

```json
{
  "items": [
    { "id": "post_1", "platform": "telegram", "text": "Shipped the parser today…", "posted_at": "2026-09-02T14:10:00Z", "pinned": false, "excluded": false }
  ],
  "next_cursor": "…"
}
```

### `POST /drafts/generate`

```jsonc
// request
{ "platform": "telegram", "topic": "Finished the Telegram importer", "checkin_id": null }
```

```jsonc
// response
{
  "id": "drf_1",
  "platform": "telegram",
  "status": "draft",
  "text": "Small win today: …",
  "length": { "count": 412, "limit": 4096, "over": false },
  "model": "gemini-flash",
  "examples_used": 8,
  "created_at": "2026-10-14T06:30:00Z"
}
```

### `GET /drafts/{id}/prompt`

```json
{ "prompt": "…the exact text sent…", "model": "gemini-flash", "provider": "google" }
```

---

## Later phases (shape to be agreed at the start of each phase)

| Phase | Method and path | Purpose |
|---|---|---|
| 2 | `GET /me` · `POST /me/privacy-accept` | Current user; accept privacy notice |
| 3 | `GET / PUT /profile` | About-you form and summary card |
| 3 | `GET / PUT /voice-cards/{platform}` · `POST /voice-cards/{platform}/regenerate` | Voice card |
| 3 | `GET /platform-profiles` · `PUT /platform-profiles/{platform}` | Platform rules |
| 3 | `PATCH /posts/{id}` | Pin / exclude |
| 4 | `POST / GET /checkins` · `PATCH / DELETE /checkins/{id}` | Daily check-ins |
| 4 | `POST /drafts/{id}/revise` · `GET /drafts/{id}/versions` | Chat revisions |
| 4 | `GET /drafts?status=&platform=` · `PATCH /drafts/{id}` | Library, status, text, `scheduled_for` |
| 5 | `POST /telegram/connect` · `POST /drafts/{id}/publish` | Connect channel; publish now |
| 5 | `POST /internal/cron/tick` (header `X-Cron-Secret`) | Send due posts and reminders |
| 6 | `GET /usage` | Today's usage vs limits |
| 6 | `GET /me/export` · `DELETE /me` | Export and delete all data |
