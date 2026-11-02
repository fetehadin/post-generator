"""Shared fixtures. Database tests run against their own database, never your dev data.

Whatever DATABASE_URL and MIGRATIONS_DATABASE_URL say, tests use the same server with
`_test` added to the database name (`voxlace` → `voxlace_test`). A name that already ends
in `_test` (CI's) is used as it is. Locally the test database is created on the first run,
with pgvector and the app role's grants, in the Postgres from `docker compose up -d`.
If Postgres isn't reachable, database tests are skipped with a clear reason.
"""

import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import URL, Engine, create_engine, make_url, text
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings

BACKEND = Path(__file__).resolve().parents[1]
TEST_SUFFIX = "_test"


def as_test_url(url: str) -> URL:
    """The same server and user, with a database name that ends in `_test`."""
    u = make_url(url)
    name = u.database or ""
    return u if name.endswith(TEST_SUFFIX) else u.set(database=name + TEST_SUFFIX)


# Before any engine exists, point the app and Alembic at the test database. Settings are read
# again after cache_clear(), and environment variables win over the settings file.
_CONFIGURED_OWNER = make_url(get_settings().migrations_database_url)
_APP_URL = as_test_url(get_settings().database_url)
_OWNER_URL = as_test_url(get_settings().migrations_database_url)
os.environ["DATABASE_URL"] = _APP_URL.render_as_string(hide_password=False)
os.environ["MIGRATIONS_DATABASE_URL"] = _OWNER_URL.render_as_string(hide_password=False)
get_settings.cache_clear()


def _create_test_database() -> None:
    """Create the test database next to the configured one if it's missing: pgvector, and the
    grants db/init/002_app_role.sh gives the app role, so RLS tests run as the limited role."""
    name, owner, app = _OWNER_URL.database, _OWNER_URL.username, _APP_URL.username
    admin = create_engine(_CONFIGURED_OWNER, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            found = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": name})
            if not found:
                conn.execute(text(f'CREATE DATABASE "{name}"'))
    finally:
        admin.dispose()
    setup = create_engine(_OWNER_URL, isolation_level="AUTOCOMMIT")
    try:
        with setup.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.execute(text(f'GRANT CONNECT ON DATABASE "{name}" TO "{app}"'))
            conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{app}"'))
            for grant in (
                "SELECT, INSERT, UPDATE, DELETE ON TABLES",
                "USAGE, SELECT ON SEQUENCES",
            ):
                conn.execute(
                    text(
                        f'ALTER DEFAULT PRIVILEGES FOR ROLE "{owner}" IN SCHEMA public '
                        f'GRANT {grant} TO "{app}"'
                    )
                )
    finally:
        setup.dispose()


@pytest.fixture(scope="session")
def owner_engine() -> Engine:
    """The table owner: runs migrations and creates test users. Bypasses RLS."""
    assert _OWNER_URL.database.endswith(TEST_SUFFIX), "tests must never use the dev database"
    try:
        _create_test_database()
    except OperationalError:
        pytest.skip("Postgres is not reachable: run `docker compose up -d` first")
    command.upgrade(Config(str(BACKEND / "alembic.ini")), "head")
    return create_engine(get_settings().migrations_database_url)


@pytest.fixture
def make_user(owner_engine):
    created: list[uuid.UUID] = []

    def _make(privacy_accepted: bool = True) -> uuid.UUID:
        uid = uuid.uuid4()
        with owner_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO users (id, email, privacy_accepted_at) "
                    "VALUES (:id, :email, CASE WHEN :ok THEN now() END)"
                ),
                {"id": uid, "email": f"{uid}@test.local", "ok": privacy_accepted},
            )
        created.append(uid)
        return uid

    yield _make
    if created:
        with owner_engine.begin() as conn:
            conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": created})
