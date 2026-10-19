"""Shared fixtures. Database tests run against the configured Postgres.

Locally that's your Docker database; in CI, a fresh pgvector service. Tests create
their own random users and delete them afterwards, so your local data is untouched.
If Postgres isn't reachable, database tests are skipped with a clear reason.
"""

import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def owner_engine() -> Engine:
    """The table owner: runs migrations and creates test users. Bypasses RLS."""
    engine = create_engine(get_settings().migrations_database_url)
    try:
        with engine.connect():
            pass
    except OperationalError:
        pytest.skip("Postgres is not reachable: run `docker compose up -d` first")
    command.upgrade(Config(str(BACKEND / "alembic.ini")), "head")
    return engine


@pytest.fixture
def make_user(owner_engine):
    created: list[uuid.UUID] = []

    def _make() -> uuid.UUID:
        uid = uuid.uuid4()
        with owner_engine.begin() as conn:
            conn.execute(
                text("INSERT INTO users (id, email) VALUES (:id, :email)"),
                {"id": uid, "email": f"{uid}@test.local"},
            )
        created.append(uid)
        return uid

    yield _make
    if created:
        with owner_engine.begin() as conn:
            conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": created})
