#!/usr/bin/env bash
# Run on YOUR laptop, from the repo root: ./deploy/push-keys.sh
# Copies the AI and login keys from the repo's local settings file to the server's settings
# file over SSH, without printing them. Only key names and "copied"/"missing" are shown.
set -euo pipefail

# The server comes from SERVER, or HOST in the git-ignored deploy/local.env.
[ -z "${SERVER:-}" ] && [ -f deploy/local.env ] && . deploy/local.env
SERVER="${SERVER:-${HOST:+deploy@$HOST}}"
: "${SERVER:?set HOST in deploy/local.env (see deploy/local.env.example)}"
REMOTE_FILE="${REMOTE_FILE:-/srv/voxlace/deploy/.env}"
LOCAL_FILE="${LOCAL_FILE:-.env}"
KEYS=(GEMINI_API_KEY GROQ_API_KEY SUPABASE_PUBLISHABLE_KEY)

[ -f "$LOCAL_FILE" ] || { echo "No $LOCAL_FILE here. Run this from the repo root." >&2; exit 1; }

payload=""
for key in "${KEYS[@]}"; do
  # The last KEY=value line wins, as in the app; surrounding quotes are dropped.
  line="$(grep -E "^${key}=" "$LOCAL_FILE" | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
  if [ -z "$line" ] || [ -z "$value" ]; then
    echo "$key: missing in your local file, skipped"
    continue
  fi
  payload+="${key}=${value}"$'\n'
  echo "$key: copied"
done

[ -n "$payload" ] || { echo "Nothing to copy."; exit 1; }

# On the server: replace each KEY= line, or add it at the end. Values travel on stdin only.
printf '%s' "$payload" | ssh -o BatchMode=yes "$SERVER" "python3 -c '
import sys, pathlib
path = pathlib.Path(\"$REMOTE_FILE\")
new = dict(l.split(\"=\", 1) for l in sys.stdin.read().splitlines() if \"=\" in l)
lines = path.read_text().splitlines()
seen = set()
for i, l in enumerate(lines):
    k = l.split(\"=\", 1)[0]
    if k in new:
        lines[i] = k + \"=\" + new[k]
        seen.add(k)
lines += [k + \"=\" + v for k, v in new.items() if k not in seen]
path.write_text(\"\\n\".join(lines) + \"\\n\")
path.chmod(0o600)
'"
echo "Done. The server's settings file is updated (only readable by the deploy user)."
