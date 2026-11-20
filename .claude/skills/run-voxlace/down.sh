#!/usr/bin/env bash
# Stop the API and web dev servers (leaves the DB container running; `docker compose stop` for that).
# Kill by listening port: npm/uvicorn wrappers don't forward SIGTERM to their children.
for p in 8000 5173; do lsof -ti:"$p" -sTCP:LISTEN | xargs -r kill; done
timeout 10 bash -c 'while ss -ltn | grep -qE ":(8000|5173)\b"; do sleep 0.3; done' && echo stopped
