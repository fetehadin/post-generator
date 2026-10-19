"""Database engine and sessions.

Every query runs inside `user_session(user_id)`, which tells Postgres who the user is
for this transaction only. Row-level security then hides every other user's rows, even
if a query forgets its `user_id` filter (FR-29, NFR-13). With no user set, the app role
sees nothing at all, so a missing user fails closed.
"""

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().database_url, pool_pre_ping=True)


@lru_cache
def _session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


@contextmanager
def user_session(user_id: uuid.UUID) -> Iterator[Session]:
    """One transaction as one user: commits on success, rolls back on error."""
    with _session_factory()() as session, session.begin():
        # set_config(..., true) is SET LOCAL: it ends with the transaction, which keeps it
        # safe behind a connection pool. A bound parameter avoids SQL injection.
        session.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(user_id)})
        yield session
