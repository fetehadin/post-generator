#!/usr/bin/env bash
# Runs ON THE SERVER, called by .github/workflows/deploy.yml over SSH.
# Usage: ./deploy/deploy.sh <git-sha>
# Needs (Phase 2): deploy/docker-compose.prod.yml and deploy/.env on the server.
set -euo pipefail

SHA="${1:?usage: deploy.sh <git-sha>}"
COMPOSE="docker compose -f deploy/docker-compose.prod.yml"
# Another app's Caddy owns ports 80/443 on this server (deploy/docker-compose.shared-caddy.yml).
# Accepts SHARED_CADDY=true, "true" or 'true', with spaces or Windows line endings.
if tr -d '\r' < deploy/.env | grep -qiE '^[[:space:]]*SHARED_CADDY[[:space:]]*=[[:space:]]*["'"'"']?true["'"'"']?[[:space:]]*$'; then
  COMPOSE="$COMPOSE -f deploy/docker-compose.shared-caddy.yml"
fi
COMPOSE="$COMPOSE --env-file deploy/.env"
PREVIOUS="$(git rev-parse HEAD)"

echo "Deploying $SHA (previous: $PREVIOUS)"
git fetch --quiet origin main
git checkout --quiet --detach "$SHA"

rollback() {
  echo "Deploy failed, rolling back to $PREVIOUS" >&2
  git checkout --quiet --detach "$PREVIOUS"
  $COMPOSE up -d --build
  exit 1
}
trap rollback ERR

$COMPOSE build
$COMPOSE run --rm api alembic upgrade head
$COMPOSE up -d --remove-orphans

trap - ERR
docker image prune -f >/dev/null
echo "Deployed $SHA"
