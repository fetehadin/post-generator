"""The embedding queue against a real Postgres and a fake AI client."""

from sqlalchemy import select

from app.ai.client import EmbeddingUnavailable
from app.core.db import user_session
from app.importers.common import ParsedPost
from app.models import Import, SourcePost
from app.services.embedding import embed_pending
from app.services.posts import save_posts


class FakeAI:
    """Returns a vector per text; can fail on a given call to simulate a rate limit."""

    def __init__(self, fail_on_call: int | None = None):
        self.calls: list[list[str]] = []
        self.fail_on_call = fail_on_call

    def embed_documents(self, texts):
        self.calls.append(list(texts))
        if self.fail_on_call == len(self.calls):
            raise EmbeddingUnavailable("429: quota")
        return [[float(len(t) % 7)] * 768 for t in texts]


def posts(n: int, likes=lambda i: i):
    from datetime import UTC, datetime, timedelta

    base = datetime(2026, 1, 1, tzinfo=UTC)
    return [
        ParsedPost(
            external_id=str(i),
            text=f"post number {i} about building",
            posted_at=base + timedelta(days=i),
            reactions=likes(i),
        )
        for i in range(n)
    ]


def load(user, items, with_import=False):
    with user_session(user) as s:
        imp_id = None
        if with_import:
            imp = Import(user_id=user, platform="telegram", status="embedding", parsed=len(items))
            s.add(imp)
            s.flush()
            imp_id = imp.id
        save_posts(s, user, "telegram", items, import_id=imp_id)
    return imp_id


def embedded_ids(user) -> set[str]:
    with user_session(user) as s:
        return set(
            s.scalars(select(SourcePost.external_id).where(SourcePost.embedding.is_not(None))).all()
        )


def test_embeds_everything_in_batches_with_the_model_name(make_user):
    user = make_user()
    load(user, posts(25))
    ai = FakeAI()
    report = embed_pending(user, ai=ai, batch_size=10)
    assert (report.embedded, report.remaining, report.stopped_reason) == (25, 0, None)
    assert [len(c) for c in ai.calls] == [10, 10, 5]
    with user_session(user) as s:
        assert set(s.scalars(select(SourcePost.embedding_model)).all()) == {"gemini-embedding-2"}


def test_second_run_has_nothing_to_do(make_user):
    user = make_user()
    load(user, posts(5))
    embed_pending(user, ai=FakeAI())
    ai = FakeAI()
    assert embed_pending(user, ai=ai).embedded == 0
    assert ai.calls == []


def test_best_posts_first_and_limit_leaves_the_rest_queued(make_user):
    user = make_user()
    load(user, posts(30, likes=lambda i: 100 - i))  # post 0 has the most reactions
    report = embed_pending(user, ai=FakeAI(), limit=10, batch_size=5)
    assert (report.embedded, report.remaining) == (10, 20)
    assert embedded_ids(user) == {str(i) for i in range(10)}


def test_rate_limit_keeps_finished_batches_and_resumes(make_user):
    user = make_user()
    load(user, posts(30))
    first = embed_pending(user, ai=FakeAI(fail_on_call=2), batch_size=10)
    assert (first.embedded, first.remaining) == (10, 20)
    assert "quota" in first.stopped_reason
    second = embed_pending(user, ai=FakeAI(), batch_size=10)
    assert (second.embedded, second.remaining) == (20, 0)
    assert len(embedded_ids(user)) == 30


def test_excluded_posts_are_never_embedded(make_user):
    user = make_user()
    load(user, posts(4))
    with user_session(user) as s:
        s.scalars(select(SourcePost).where(SourcePost.external_id == "1")).one().excluded = True
    report = embed_pending(user, ai=FakeAI())
    assert (report.embedded, report.remaining) == (3, 0)
    assert "1" not in embedded_ids(user)


def test_import_progress_and_status_are_updated(make_user):
    user = make_user()
    imp_id = load(user, posts(12), with_import=True)
    embed_pending(user, ai=FakeAI(), limit=5)
    with user_session(user) as s:
        imp = s.get(Import, imp_id)
        assert (imp.embedded, imp.status) == (5, "embedding")
    embed_pending(user, ai=FakeAI())
    with user_session(user) as s:
        imp = s.get(Import, imp_id)
        assert (imp.embedded, imp.status) == (12, "done")
        assert imp.finished_at is not None


def test_one_users_run_never_touches_another_users_queue(make_user):
    a, b = make_user(), make_user()
    load(a, posts(5))
    load(b, posts(5))
    embed_pending(a, ai=FakeAI())
    assert len(embedded_ids(a)) == 5
    assert embedded_ids(b) == set()
