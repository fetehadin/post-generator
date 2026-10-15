#!/usr/bin/env bash
# Runs once, on the first start of an empty database volume.
#
# Creates the role the API connects as. It is not a superuser and owns no tables,
# so row-level security policies apply to it (superusers and table owners skip RLS).
# Migrations run as POSTGRES_USER, which owns the tables.
set -euo pipefail

APP_DB_USER="${APP_DB_USER:-voxlace_app}"
APP_DB_PASSWORD="${APP_DB_PASSWORD:-voxlace_app}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" \
  -v owner="$POSTGRES_USER" -v db="$POSTGRES_DB" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT CONNECT ON DATABASE :"db" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";

-- Tables and sequences that migrations create later.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
SQL
