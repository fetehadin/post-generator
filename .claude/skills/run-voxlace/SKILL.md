---
name: run-voxlace
description: Start, run, launch, screenshot and drive the Voxlace app locally (Postgres + FastAPI + Vite) without a real login. Use when asked to run or start the app, see a UI change working, take a screenshot of a screen, click through a flow, smoke-test the API, or run the backend/frontend tests.
---

Voxlace is a FastAPI API + React/Vite web app over Postgres/pgvector. An agent starts the stack
with `up.sh` and drives the browser with `driver.mjs` (headless Playwright Chromium, a small
line-per-command script). The API alone is driven with `curl`.

All paths are relative to the repo root (`post-generator/`).

## Prerequisites (one time per machine)

Docker, Node, and `uv` must be on PATH. System Python here was 3.14; use uv's 3.12 so all wheels exist.

```bash
cd backend && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -e ".[dev]" && cd ..
cd frontend && npm install && cd ..
npm i --prefix ~/.cache/voxlace-driver playwright@1.64.1   # driver's Playwright, kept out of frontend deps
npx -y playwright@1.64.1 install chromium                  # no-op if ~/.cache/ms-playwright/chromium-1248 exists
```

`.env` at the repo root must exist (copy `.env.example`). The DB host port comes from
`POSTGRES_PORT` there (5434 on this machine, because 5432/5433 are used by other projects).

## Run (agent path)

```bash
.claude/skills/run-voxlace/up.sh            # DB + migrations + API :8000 + web :5173, logged in as "Dev user"
node .claude/skills/run-voxlace/driver.mjs <<'EOF'
nav /drafts/x
wait-for text=X drafts
shot drafts-x
nav /welcome
wait-for text=Where do you post?
click role=button[name="X"]
click role=button[name="Continue"]
wait-for text=About you
shot welcome-step2
errors
EOF
.claude/skills/run-voxlace/down.sh          # stops API + web (DB container keeps running)
```

Screenshots → `/tmp/voxlace-shots/<name>.png` (override with `SHOTS=`); on any failure the
driver writes `failure.png` there and exits 1. **Open the PNG and look at it.**
Logs → `/tmp/voxlace-api.log`, `/tmp/voxlace-web.log`.

Short scripts can go as one argument, `;`-separated:
`node .claude/skills/run-voxlace/driver.mjs 'nav /calendar; wait 1500; shot cal; errors'`

| driver command | does |
|---|---|
| `nav <path>` | open `http://localhost:5173<path>` |
| `wait-for <sel>` / `click <sel>` | Playwright selectors: `text=…`, `role=button[name="…"]`, CSS |
| `fill <sel> <text>` / `press <key>` | type into inputs (fires React onChange) |
| `viewport <w> <h>` / `theme dark` | 390 844 for mobile; dark mode |
| `shot [name]` / `text <sel>` / `url` | capture / read |
| `errors` | console errors + any `/api` response ≥400; fails if there are any |

`up.sh` modes:

| mode | what you get |
|---|---|
| *(none)* | real API + DB, no login: every request is the dev user `dev@voxlace.local` |
| `--mocks` | web only, fake API from `frontend/src/api/mocks/handlers.ts` with seeded drafts, chats, due/missed posts. No DB/backend. Best for UI screenshots. |
| `--login` | real Supabase login from `.env`; logged-out visitors see the guest page |

API smoke (any mode except `--mocks`):

```bash
curl -s http://127.0.0.1:8000/api/v1/health        # {"api":"ok","db":"ok"}
curl -s http://localhost:5173/api/v1/me            # dev user JSON (via Vite proxy)
```

## Run (human path)

`.claude/skills/run-voxlace/up.sh --login` then open http://localhost:5173. Stop with `down.sh`.

## Test

```bash
cd backend && .venv/bin/pytest -q      # 486 passed, ~35 s (needs the DB container up)
cd frontend && npx vitest run          # 30 files, 170 tests passed, ~60 s
```

## Gotchas

- **`.env` has a real `SUPABASE_URL`, so a plain `npm run dev` + `uvicorn` lands on the guest
  page and `/api/v1/me` returns 401.** `up.sh` sets `SUPABASE_URL= SUPABASE_JWT_SECRET=
  SUPABASE_PUBLISHABLE_KEY=` (empty) in the process env: that overrides `.env` for both
  pydantic-settings and Vite's `loadEnv`, and with `APP_ENV=development` the API falls back to
  the dev user (`backend/app/core/auth.py`, `dev_user_without_login`).
- **`/` redirects to `/welcome`** (the 4-step first-run wizard) until the dev user finishes or
  skips it. Navigate straight to the route you need; the dev user's wizard state lives in the
  local DB and persists across runs.
- **AI costs real quota.** Sending a chat message, generating drafts and the guest page's
  "Write N drafts" call Gemini/Groq with the keys in `.env`. Use `--mocks` for UI work and only
  hit generation when the change is about generation.
- **Vite uses `strictPort` on 5173** and the API port 8000 is fixed: a leftover server makes the
  next start fail. `up.sh` refuses to start on a busy port; run `down.sh` (it kills by port,
  because npm/uvicorn wrappers don't pass SIGTERM to their children).
- **Mobile viewport: `click text=…` times out** on links that also exist in the hidden desktop
  sidebar, because `click` picks the first match even when it's hidden. Add `>> visible=true`:
  `click text=Finished the Telegram importer >> visible=true`.
- **Don't pipe `up.sh` (e.g. `| tail -1`).** The servers it leaves running inherit the pipe, so
  the reader never sees EOF and the command hangs until timeout, even though the stack is up.
  Run it bare, or redirect: `up.sh >/dev/null`.
- The Vite proxy targets `127.0.0.1:8000`, not `localhost` (uvicorn listens on IPv4 only).
- First `docker compose up` pulls `pgvector/pgvector:pg18`, about 2 min.

## Troubleshooting

- **`curl /api/v1/me` → `{"error":{"code":"not_logged_in",...}}` 401**: servers were started
  without the empty `SUPABASE_*` overrides. `down.sh` then `up.sh`.
- **`port 8000 busy - run down.sh first`**: a previous run is still up. `down.sh`.
