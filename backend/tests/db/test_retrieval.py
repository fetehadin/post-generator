"""Search rules, with hand-made vectors so the right answer is known exactly."""

from datetime import UTC, datetime

from sqlalchemy import select

from app.core.db import user_session
from app.importers.common import ParsedPost
from app.models import SourcePost
from app.services.posts import save_posts
from app.services.retrieval import cosine, find_examples, nearest_posts

DIMS = 768
WHEN = datetime(2026, 1, 1, tzinfo=UTC)


def vec(*xs: float) -> list[float]:
    return list(xs) + [0.0] * (DIMS - len(xs))


QUERY = vec(1)
# Similarity to QUERY: a 0.995, a_copy ~0.993 (but a near-copy of a), b 0.707, c 0.316, d 0.
POINTS = {"a": vec(1, 0.1), "a_copy": vec(1, 0.12), "b": vec(1, 1), "c": vec(1, 3), "d": vec(0, 1)}


def add(user, key, embedding, platform="telegram", model="gemini-embedding-2", **flags):
    with user_session(user) as s:
        save_posts(s, user, platform, [ParsedPost(key, f"post {key}", WHEN)])
        post = s.scalars(
            select(SourcePost).where(SourcePost.external_id == key, SourcePost.platform == platform)
        ).one()
        if embedding is not None:
            post.embedding, post.embedding_model = embedding, model
        for name, value in flags.items():
            setattr(post, name, value)


def search(user, platform="telegram", k=8):
    with user_session(user) as s:
        return [e.text.removeprefix("post ") for e in nearest_posts(s, user, platform, QUERY, k=k)]


def seed(user, **flags_by_key):
    for key, v in POINTS.items():
        add(user, key, v, **flags_by_key.get(key, {}))


def test_closest_first_and_near_copies_dropped(make_user):
    user = make_user()
    seed(user)
    assert search(user, k=3) == ["a", "b", "c"]  # a_copy is a near-copy of a


def test_pinned_posts_always_come_in_first(make_user):
    user = make_user()
    seed(user, d={"pinned": True})
    assert search(user, k=2) == ["d", "a"]


def test_excluded_posts_never_come_back(make_user):
    user = make_user()
    seed(user, a={"excluded": True})
    assert search(user, k=2) == ["a_copy", "b"]


def test_only_the_requested_platform(make_user):
    user = make_user()
    seed(user)
    add(user, "x_post", vec(1), platform="x")
    assert "x_post" not in search(user)
    assert search(user, platform="x") == ["x_post"]


def test_vectors_from_another_model_are_ignored(make_user):
    user = make_user()
    seed(user)
    add(user, "old", vec(1), model="old-embedding-model")
    assert "old" not in search(user)


def test_posts_without_a_vector_are_ignored(make_user):
    user = make_user()
    add(user, "waiting", None)
    add(user, "ready", vec(1, 1))
    assert search(user) == ["ready"]


def test_another_users_posts_are_invisible(make_user):
    a, b = make_user(), make_user()
    seed(a)
    assert search(b) == []


def test_fewer_posts_than_k_returns_what_exists(make_user):
    user = make_user()
    add(user, "only", vec(1))
    assert search(user, k=8) == ["only"]


def test_find_examples_embeds_the_topic_as_a_query(make_user):
    user = make_user()
    seed(user)

    class FakeAI:
        def __init__(self):
            self.topics = []

        def embed_query(self, text):
            self.topics.append(text)
            return QUERY

    ai = FakeAI()
    examples = find_examples(user, "telegram", "shipping logs", ai=ai, k=2)
    assert ai.topics == ["shipping logs"]
    assert [e.text for e in examples] == ["post a", "post b"]
    assert examples[0].similarity > examples[1].similarity


def test_cosine():
    assert cosine([1, 0], [1, 0]) == 1.0
    assert cosine([1, 0], [0, 1]) == 0.0
    assert cosine([0, 0], [1, 0]) == 0.0
