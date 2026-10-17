"""Tables, deduplication and per-user isolation, on a real Postgres.

The isolation tests connect as voxlace_app, the role the API uses. Connecting as the
table owner would skip row-level security and prove nothing (backend/CLAUDE.md).
"""

from pathlib import Path

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.core.db import get_engine, user_session
from app.importers.telegram import parse_telegram
from app.models import SourcePost
from app.services.posts import save_posts

SAMPLE = Path(__file__).resolve().parents[3] / "samples" / "telegram" / "result.json"


def sample_posts():
    return parse_telegram(SAMPLE.read_bytes()).posts


def count_posts(user_id) -> int:
    with user_session(user_id) as s:
        return s.scalar(select(func.count()).select_from(SourcePost))


def test_tables_exist_with_row_level_security(owner_engine):
    with owner_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT relname, relrowsecurity FROM pg_class "
                "WHERE relname IN ('users', 'imports', 'source_posts')"
            )
        ).all()
    assert dict(rows) == {"users": True, "imports": True, "source_posts": True}


def test_import_saves_posts_and_reimport_adds_none(make_user):
    user = make_user()
    with user_session(user) as s:
        assert save_posts(s, user, "telegram", sample_posts()) == 5
    with user_session(user) as s:
        assert save_posts(s, user, "telegram", sample_posts()) == 0  # FR-2
    assert count_posts(user) == 5


def test_user_b_never_sees_user_a_posts(make_user):
    a, b = make_user(), make_user()
    with user_session(a) as s:
        save_posts(s, a, "telegram", sample_posts())
    # No user_id filter in this query on purpose: RLS alone must hide A's rows.
    assert count_posts(b) == 0
    assert count_posts(a) == 5


def test_no_user_set_sees_nothing(make_user):
    a = make_user()
    with user_session(a) as s:
        save_posts(s, a, "telegram", sample_posts())
    with get_engine().connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM source_posts")) == 0


def test_user_b_cannot_write_rows_for_user_a(make_user):
    a, b = make_user(), make_user()
    with pytest.raises(DBAPIError, match="row-level security"):
        with user_session(b) as s:
            save_posts(s, a, "telegram", sample_posts())


def test_same_posts_on_two_users_are_separate(make_user):
    a, b = make_user(), make_user()
    for u in (a, b):
        with user_session(u) as s:
            assert save_posts(s, u, "telegram", sample_posts()) == 5


def test_vector_round_trip_and_model_is_required(make_user):
    user = make_user()
    with user_session(user) as s:
        save_posts(s, user, "telegram", sample_posts()[:1])
        post = s.scalars(select(SourcePost)).one()
        assert post.embedding is None  # NULL = waiting in the embedding queue
        post.embedding, post.embedding_model = [0.25] * 768, "gemini-embedding-2"
    with user_session(user) as s:
        post = s.scalars(select(SourcePost)).one()
        assert len(post.embedding) == 768 and post.embedding_model == "gemini-embedding-2"
    with pytest.raises(IntegrityError, match="embedding_has_model"):
        with user_session(user) as s:
            s.scalars(select(SourcePost)).one().embedding_model = None
