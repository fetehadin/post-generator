#!/usr/bin/env bash
# Start DB + API + web for local driving. Run from the repo root (post-generator/).
#   .claude/skills/run-voxlace/up.sh          # dev-user mode: no login, you are "Dev user"
#   .claude/skills/run-voxlace/up.sh --login  # real Supabase login from .env (guest page first)
#   .claude/skills/run-voxlace/up.sh --mocks  # frontend only, fake API (no DB, no backend)
# Logs: /tmp/voxlace-api.log, /tmp/voxlace-web.log. Stop with down.sh.
set -euo pipefail
cd "$(dirname "$0")/../../.."
mode="${1:-dev}"

wait_for() { timeout "${3:-60}" bash -c "until curl -sf -o /dev/null '$1'; do sleep 0.5; done" \
  || { echo "timeout waiting for $2 ($1)"; exit 1; }; }

for p in 8000 5173; do
  if ss -ltn | grep -q ":$p\b"; then echo "port $p busy - run down.sh first"; exit 1; fi
done

if [ "$mode" = "--mocks" ]; then
  (cd frontend && VITE_USE_MOCKS=true nohup npm run dev >/tmp/voxlace-web.log 2>&1 &)
  wait_for http://localhost:5173 web
  echo "web (mocks) ready: http://localhost:5173"; exit 0
fi

# Empty SUPABASE_* in the process env overrides .env for both pydantic-settings (API) and
# vite's loadEnv (web). With no login configured and APP_ENV=development the API serves
# every request as the fixed dev user (backend/app/core/auth.py:dev_user_without_login).
login_env=()
[ "$mode" = "--login" ] || login_env=(SUPABASE_URL= SUPABASE_JWT_SECRET= SUPABASE_PUBLISHABLE_KEY=)

docker compose up -d db >/dev/null
timeout 120 bash -c 'until [ "$(docker inspect -f {{.State.Health.Status}} voxlace-db)" = healthy ]; do sleep 1; done'
(cd backend && .venv/bin/alembic upgrade head >/dev/null)

(cd backend && env "${login_env[@]}" nohup .venv/bin/uvicorn app.main:app --reload --port 8000 \
  >/tmp/voxlace-api.log 2>&1 &)
(cd frontend && env "${login_env[@]}" nohup npm run dev >/tmp/voxlace-web.log 2>&1 &)
wait_for http://127.0.0.1:8000/api/v1/health api
wait_for http://localhost:5173 web
echo "ready ($mode): web http://localhost:5173  api http://localhost:8000/docs"
