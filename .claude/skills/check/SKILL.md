---
name: check
description: Run lint, format check, type check, tests and build for the backend and frontend and fix what fails. Use before saying a task is done.
disable-model-invocation: false
---

Run every check for the parts of the repo that exist, and fix failures at the root cause. Never delete or skip a test to make it pass; if a test is wrong, explain why before changing it.

Backend (if `backend/pyproject.toml` exists), from `backend/`:

1. `ruff check .`
2. `ruff format --check .`
3. `pytest -q`

Frontend (if `frontend/package.json` exists), from `frontend/`:

1. `npm run lint`
2. `npm test -- --run`
3. `npm run build` (this also type-checks)

Also check:

- `git diff` contains no `.env`, keys, tokens or real export data.
- If an endpoint changed, `docs/API.md` changed too.
- If a migration was added, it includes the RLS policy for any new user-owned table.

Finish with a short table: check → pass/fail → what you fixed.
