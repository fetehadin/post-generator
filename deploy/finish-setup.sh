#!/usr/bin/env bash
# One-time: run on YOUR laptop from the repo root: ./deploy/finish-setup.sh
# 1. copies the AI and login keys to the server (push-keys.sh; values are never printed),
# 2. gives GitHub Actions what it needs to deploy on every merge to main,
# 3. starts Voxlace on the server, checks it, and only then turns automatic deploys on.
set -euo pipefail

REPO=fetehadin/post-generator
# Where the server is: from the environment or the git-ignored deploy/local.env
# (copy deploy/local.env.example). Never commit them: the repo is public.
[ -f deploy/local.env ] && . deploy/local.env
: "${HOST:?set HOST in deploy/local.env (see deploy/local.env.example)}"
: "${DOMAIN:?set DOMAIN in deploy/local.env (see deploy/local.env.example)}"
SERVER=deploy@$HOST
DEPLOY_KEY="$HOME/.ssh/voxlace_deploy"   # made for GitHub Actions only; already allowed on the server

echo "== 1/3 Keys to the server"
SERVER=$SERVER ./deploy/push-keys.sh

echo "== 2/3 GitHub deploy settings"
gh api -X PUT "repos/$REPO/environments/production" >/dev/null
gh secret set DEPLOY_SSH_KEY --env production --repo "$REPO" < "$DEPLOY_KEY"
ssh-keyscan -t ed25519,rsa,ecdsa "$HOST" 2>/dev/null | gh secret set DEPLOY_KNOWN_HOSTS --env production --repo "$REPO"
gh secret set DEPLOY_USER --env production --repo "$REPO" --body deploy
gh secret set DEPLOY_HOST --env production --repo "$REPO" --body "$HOST"
gh variable set DEPLOY_PATH --repo "$REPO" --body /srv/voxlace
gh variable set DOMAIN --repo "$REPO" --body "$DOMAIN"

echo "== 3/3 Start Voxlace on the server (builds take a few minutes)"
ssh -o BatchMode=yes "$SERVER" 'cd /srv/voxlace && ./deploy/deploy.sh "$(git rev-parse HEAD)"'
for i in $(seq 1 24); do
  if curl -fsS "https://$DOMAIN/api/v1/health"; then
    echo
    gh variable set DEPLOY_ENABLED --repo "$REPO" --body true
    echo "Live at https://$DOMAIN. Every merge to main now deploys by itself."
    exit 0
  fi
  sleep 5
done
echo "Started, but https://$DOMAIN/api/v1/health didn't answer. Automatic deploys stay off." >&2
exit 1
