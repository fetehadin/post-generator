"""FR-41 retrieval (3 shape examples per draft), the prompt that uses them, and FR-49's
originality check. A fake local model with no prefixes, so equal texts are equal vectors."""

import pytest
from sqlalchemy import select, text, update

from app.ai.client import GenerationResult
from app.ai.local_embed import LocalEmbedder
from app.core.db import user_session
from app.models import ExemplarPost, PromptLog
from app.services.drafting import TOO_CLOSE, generate_draft, who_is_writing
from app.services.inspiration import NOBODY, NewPost, add_posts, embed_pending
from app.services.profile import update_profile
from app.services.retrieval import is_developer, structure_examples

IDEA = "We shipped a new onboarding flow"


class CharModel:
    def embed(self, texts, batch_size=32):
        for t in texts:
            v = [0.0] * 384
            for i, ch in enumerate(t[:300]):
                v[(ord(ch) * 7 + i) % 384] += 1.0
            yield v


@pytest.fixture
def embedder():
    return LocalEmbedder("BAAI/bge-small-en-v1.5", 384, backend=CharModel())


@pytest.fixture(autouse=True)
def clean_pool(owner_engine):
    reset = (
        "DELETE FROM exemplar_posts WHERE source = 'creator'; "
        "UPDATE exemplar_posts SET hook_type = NULL, structure = NULL, embedding = NULL, "
        "structure_embedding = NULL, embedding_model = NULL, tagged_at = NULL"
    )
    with owner_engine.begin() as conn:
        conn.execute(text(reset))
    yield
    with owner_engine.begin() as conn:
        conn.execute(text(reset))


def seed(embedder, rows):
    """rows: (platform, text, hook_type, structure)."""
    add_posts([NewPost(p, f"author{i}", t) for i, (p, t, _, _) in enumerate(rows)])
    with user_session(NOBODY) as s:
        for p, t, hook, shape in rows:
            s.execute(
                update(ExemplarPost)
                .where(ExemplarPost.platform == p, ExemplarPost.text == t)
                .values(hook_type=hook, structure=shape)
            )
    embed_pending(embedder)


DEV_POST = f"{IDEA}. Here is the stack: React, a queue, and three migrations we had to roll back."
LIST_POST = "Three things nobody tells you about your first year at work:\n1. one\n2. two\n3. three"
STORY_POST = (
    "Last spring I made a mistake that cost us a client. Here is what I do differently now, "
    "every single week."
)


@pytest.mark.parametrize(
    ("profession", "dev"),
    [
        ("Software Engineer", True),
        ("frontend developer", True),
        ("data scientist", True),
        ("CTO", True),
        ("Nurse", False),
        ("product designer", False),
        ("marketing lead", False),
        ("", False),
    ],
)
def test_who_counts_as_a_developer(profession, dev):
    assert is_developer(profession) is dev


def test_developers_get_the_closest_posts_by_topic(embedder):
    seed(
        embedder,
        [
            ("linkedin", DEV_POST, "announcement", "news → details → lesson"),
            ("linkedin", LIST_POST, "numbered_list", "a teach post: a list of steps"),
            ("linkedin", STORY_POST, "mistake_story", "mistake → cost → what changed"),
        ],
    )
    found = structure_examples("linkedin", IDEA, "backend developer", "teach", embedder=embedder)
    assert found[0].text == DEV_POST
    assert len(found) == 3


def test_everyone_else_gets_the_closest_by_shape_not_topic(embedder):
    seed(
        embedder,
        [
            ("linkedin", DEV_POST, "announcement", "news → details → lesson"),
            ("linkedin", LIST_POST, "numbered_list", f"a teach post: {IDEA}"),
        ],
    )
    found = structure_examples("linkedin", IDEA, "nurse", "teach", embedder=embedder)
    assert found[0].text == LIST_POST  # matched on its shape line, not on the dev topic


def test_only_this_platform_and_only_the_chosen_hook(embedder):
    seed(
        embedder,
        [
            ("x", DEV_POST, "announcement", "s1"),
            ("linkedin", LIST_POST, "numbered_list", "s2"),
            ("linkedin", STORY_POST, "mistake_story", "s3"),
        ],
    )
    on_x = structure_examples("x", IDEA, "developer", embedder=embedder)
    assert {f.text for f in on_x} <= {DEV_POST} | set(_templates("x"))
    stories = structure_examples(
        "linkedin", IDEA, "designer", hook_type="mistake_story", embedder=embedder
    )
    assert [f.text for f in stories] == [STORY_POST]


def test_vectors_from_another_model_are_never_compared(embedder):
    seed(embedder, [("x", DEV_POST, "announcement", "s")])
    other = LocalEmbedder("intfloat/multilingual-e5-small", 384, backend=CharModel())
    assert structure_examples("x", IDEA, "developer", embedder=other) == []


def test_creators_posts_come_before_templates(embedder):
    seed(embedder, [("x", DEV_POST, "announcement", "s")])
    with user_session(NOBODY) as s:  # tag and embed the templates too
        s.execute(
            update(ExemplarPost)
            .where(ExemplarPost.source == "template")
            .values(hook_type="story", embedding_model=None)
        )
    embed_pending(embedder)
    found = structure_examples("x", "anything at all", "developer", embedder=embedder)
    assert found[0].text == DEV_POST
    assert len(found) == 3


def test_weak_posts_are_never_examples(embedder):
    short = "all roads lead to one place, apparently, and I am not sure why"
    seed(
        embedder,
        [
            ("x", short, "observation", "short statement"),
            ("x", DEV_POST, "other", "s"),
            ("x", LIST_POST, None, None),
        ],
    )
    assert structure_examples("x", IDEA, "developer", embedder=embedder) == []


def test_the_users_goal_comes_first_and_one_post_per_author(embedder):
    add_posts(
        [
            NewPost("linkedin", "ann", DEV_POST),
            NewPost("linkedin", "ann", LIST_POST),
            NewPost("linkedin", "bo", STORY_POST),
        ]
    )
    with user_session(NOBODY) as s:
        for t, goal in ((DEV_POST, "announce"), (LIST_POST, "teach"), (STORY_POST, "teach")):
            s.execute(
                update(ExemplarPost)
                .where(ExemplarPost.text == t)
                .values(hook_type="story", structure=f"shape of {t[:20]}", goal=goal)
            )
    embed_pending(embedder)
    found = structure_examples("linkedin", IDEA, "developer", "teach", embedder=embedder)
    assert [f.text for f in found][0] in (LIST_POST, STORY_POST)  # teach before announce
    assert len(found) == 2  # ann once, bo once


def _templates(platform):
    with user_session(NOBODY) as s:
        return s.scalars(
            select(ExemplarPost.text).where(
                ExemplarPost.platform == platform, ExemplarPost.source == "template"
            )
        ).all()


# ---- the prompt and the originality check (FR-41, FR-49)


class ReplyAI:
    def __init__(self, *replies):
        self.replies, self.prompts = list(replies), []

    def embed_query(self, text):
        return [1.0] + [0.0] * 767

    def generate(self, prompt, purpose="draft", temperature=0.9):
        self.prompts.append(prompt)
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        return GenerationResult(reply, "g", "groq", "g")


def test_who_is_writing_line():
    assert who_is_writing("nurse", "public", "teach") == (
        "They are a nurse, writing mostly for a general audience, to teach something useful."
    )
    assert who_is_writing("") == ""
    assert who_is_writing("designer", "nonsense") == "They are a designer."
    # Several professions from the Profile chips (FR-53).
    assert who_is_writing("student, developer") == "They are a student and developer."
    assert who_is_writing("student, ,designer, writer") == (
        "They are a student, designer and writer."
    )


def test_a_nurses_prompt_has_shape_examples_and_who_is_writing(make_user, embedder):
    seed(embedder, [("linkedin", DEV_POST, "announcement", "news → details → lesson")])
    user = make_user()
    update_profile(user, {"discipline": "nurse", "audience_kind": "public", "main_goal": "teach"})
    ai = ReplyAI("Our ward tried a new handover checklist this week.")
    generate_draft(user, "linkedin", "New handover checklist on the ward", ai=ai, embedder=embedder)
    prompt = ai.prompts[0]
    assert "## Who is writing\nThey are a nurse, writing mostly for a general audience" in prompt
    assert "## Shape examples (not their voice, not their field)" in prompt
    assert "Use them ONLY for the hook, the structure, the rhythm and the length" in prompt
    assert "(hook: announcement · shape: news → details → lesson)" in prompt
    assert "Never borrow another field's jargon" in prompt


class MeaningModel:
    """Texts mentioning "CLOSE", and the example itself, mean the same; all else differs."""

    def embed(self, texts, batch_size=32):
        for t in texts:
            v = [0.0] * 384
            v[0 if ("CLOSE" in t or t.startswith(IDEA)) else 1] = 1.0
            yield v


def test_a_draft_too_close_to_an_example_is_rewritten_once(make_user):
    meaning = LocalEmbedder("BAAI/bge-small-en-v1.5", 384, backend=MeaningModel())
    seed(meaning, [("x", DEV_POST, "announcement", "s")])
    user = make_user()
    # No 6 words copied (the word-copy check stays quiet), but the same meaning as the example.
    ai = ReplyAI("CLOSE: a reworded take on that same post", "A fresh post about the new flow.")
    result = generate_draft(user, "x", IDEA, ai=ai, embedder=meaning)
    assert result.text == "A fresh post about the new flow."
    assert result.notices == ()
    assert "follows shape example [A] too closely" in ai.prompts[-1]
    with user_session(user) as s:  # rule 9: the log keeps the prompt that made the saved text
        logged = s.scalars(select(PromptLog.prompt)).one()
    assert "too closely" in logged


def test_still_too_close_after_the_rewrite_is_flagged(make_user):
    meaning = LocalEmbedder("BAAI/bge-small-en-v1.5", 384, backend=MeaningModel())
    seed(meaning, [("x", DEV_POST, "announcement", "s")])
    user = make_user()
    result = generate_draft(user, "x", IDEA, ai=ReplyAI("CLOSE again"), embedder=meaning)
    assert result.notices == (TOO_CLOSE,)
    assert result.text == "CLOSE again"  # kept, with the notice; the user decides


def test_without_the_local_model_drafts_still_work(make_user, monkeypatch):
    from app.ai import local_embed

    class Broken:
        model_name = "x"

        def embed_query(self, text):
            raise RuntimeError("model files missing")

    monkeypatch.setattr(local_embed, "_default", Broken())
    user = make_user()
    result = generate_draft(user, "x", IDEA, ai=ReplyAI("Shipped it."))
    assert result.text == "Shipped it."  # the team's templates, as before
