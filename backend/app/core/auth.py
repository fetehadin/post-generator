"""Who is calling. Phase 1 has no login yet (docs/API.md): every request is the dev user.

Phase 2 replaces current_user() with Supabase JWT verification (FR-27). Routes already
depend on it, so nothing else changes, and every query is already per-user under RLS.
"""

import uuid

from sqlalchemy.dialects.postgresql import insert

from app.core.db import user_session
from app.models import User

DEV_USER_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
_dev_user_ready = False


def ensure_dev_user() -> None:
    global _dev_user_ready
    if _dev_user_ready:
        return
    with user_session(DEV_USER_ID) as s:
        s.execute(
            insert(User)
            .values(id=DEV_USER_ID, email="dev@voxlace.local", name="Dev user")
            .on_conflict_do_nothing()
        )
    _dev_user_ready = True


def current_user() -> uuid.UUID:
    ensure_dev_user()
    return DEV_USER_ID
