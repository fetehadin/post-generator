"""The shared inspiration pool (FR-41): import for structure, tag, embed. Each step can run
again without doing work twice. Fake AI and a fake local model; no network."""

import json

import pytest
from sqlalchemy import select, text

from app.ai.client import AIUnavailable, GenerationResult
from app.ai.local_embed import LocalEmbedder
from app.core.db import user_session
from app.models import ExemplarPost
from app.services import inspiration
from app.services.inspiration import NewPost, add_posts, embed_pending, parse_tags, tag_pending

NOBODY = inspiration.NOBODY
LONG = "Most people get onboarding wrong. Here is what I changed:\n1. one\n2. two\n3. three"


@pytest.fixture(autouse=True)
def clean_pool(owner_engine):
    """The pool is shared: put it back as the migrations left it after every test."""
    reset = (
        "DELETE FROM exemplar_posts WHERE source = 'creator'; "
        "UPDATE exemplar_posts SET hook_type = NULL, structure = NULL, tone = NULL, goal = NULL, "
        "source_profession = NULL, tagged_at = NULL, embedding = NULL, "
        "structure_embedding = NULL, embedding_model = NULL"
    )
    with owner_engine.begin() as conn:
        conn.execute(text(reset))
    yield
    with owner_engine.begin() as conn:
        conn.execute(text(reset))


class FakeModel:
    def __init__(self):
        self.calls = 0

    def embed(self, texts, batch_size=32):
        self.calls += len(texts)
        for t in texts:
            v = [0.0] * 384
            v[len(t) % 384] = 1.0
            yield v


class TaggingAI:
    """Answers every tagging call with the same labels; can be told to be unavailable."""

    def __init__(self, fail_after=None):
        self.prompts, self.fail_after = [], fail_after

    def generate(self, prompt, purpose="draft", temperature=0.9):
        if self.fail_after is not None and len(self.prompts) >= self.fail_after:
            raise AIUnavailable("all models failed: 429")
        self.prompts.append(prompt)
        n = prompt.count("### Post ")
        labels = [
            {
                "i": i,
                "post_type": "tip",
                "hook_type": "numbered_list",
                "structure": "bold claim → numbered steps → short close",
                "tone": "direct",
                "goal": "teach",
                "source_profession": "software engineer",
            }
            for i in range(n)
        ]
        return GenerationResult(json.dumps(labels), "g", "groq", "g")


def creator_rows():
    with user_session(NOBODY) as s:
        return s.scalars(select(ExemplarPost).where(ExemplarPost.source == "creator")).all()


def test_importing_twice_stores_each_post_once_and_skips_tiny_ones():
    posts = [NewPost("x", "simonw", LONG), NewPost("x", "simonw", "too short")]
    assert add_posts(posts) == 1
    assert add_posts(posts) == 0
    assert add_posts([NewPost("linkedin", "simonw", LONG)]) == 1  # another platform is new
    rows = creator_rows()
    assert {(r.platform, r.author) for r in rows} == {("x", "simonw"), ("linkedin", "simonw")}


def test_tagging_labels_every_untagged_post_in_small_batches():
    add_posts([NewPost("x", "a", f"{LONG} {i}") for i in range(5)])
    ai = TaggingAI()
    report = tag_pending(ai, batch=2, pause=0)
    # 24 team templates + 5 posts, 2 per call
    assert report.tagged == 29 and report.remaining == 0
    assert len(ai.prompts) == 15
    row = creator_rows()[0]
    assert (row.hook_type, row.goal, row.source_profession) == (
        "numbered_list",
        "teach",
        "software engineer",
    )
    assert tag_pending(ai, pause=0).tagged == 0  # nothing left to do


def test_tagging_stops_when_the_ai_is_busy_and_resumes_later():
    add_posts([NewPost("x", "a", f"{LONG} {i}") for i in range(4)])
    first = tag_pending(TaggingAI(fail_after=1), batch=8, pause=0)
    assert first.stopped_reason and first.tagged == 8 and first.remaining == 20
    second = tag_pending(TaggingAI(), batch=8, pause=0)
    assert second.remaining == 0 and second.tagged == 20


def test_labels_outside_the_lists_are_dropped_not_guessed():
    answer = 'Sure! [{"i": 0, "hook_type": "Bold_Claim", "goal": "world peace", "tone": ' \
             '"  very   direct ", "post_type": "rant"}, {"i": 7}, "junk"]'  # fmt: skip
    tags = parse_tags(answer, 2)
    assert tags[0]["hook_type"] == "bold_claim"
    assert tags[0]["goal"] is None
    assert tags[0]["post_type"] == "other"
    assert tags[0]["tone"] == "very direct"
    assert 7 not in tags
    assert parse_tags("no json at all", 2) == {}


def test_embedding_is_idempotent_and_redone_for_a_new_model():
    add_posts([NewPost("x", "a", LONG)])
    model = FakeModel()
    embedder = LocalEmbedder("intfloat/multilingual-e5-small", 384, backend=model)
    assert embed_pending(embedder).embedded == 25
    calls = model.calls
    assert embed_pending(embedder).embedded == 0  # same model: nothing to do
    assert model.calls == calls
    other = LocalEmbedder("BAAI/bge-small-en-v1.5", 384, backend=FakeModel())
    assert embed_pending(other).embedded == 25  # a new model re-embeds, never mixes
    assert {r.embedding_model for r in creator_rows()} == {"BAAI/bge-small-en-v1.5"}


def test_the_structure_line_is_embedded_once_it_exists():
    add_posts([NewPost("x", "a", LONG)])
    embedder = LocalEmbedder("m-e5", 384, backend=FakeModel())
    embed_pending(embedder)
    assert creator_rows()[0].structure_embedding is None
    tag_pending(TaggingAI(), pause=0)
    assert embed_pending(embedder).embedded == 25  # tagging added structure lines
    assert creator_rows()[0].structure_embedding is not None


def test_only_each_authors_most_liked_posts_with_a_structure_are_kept():
    from app.services.inspiration import best_per_author

    posts = [NewPost("x", "a", f"{LONG} {i}", reactions=i) for i in range(5)]
    posts += [NewPost("x", "b", LONG), NewPost("x", "b", "tiny")]
    kept = best_per_author(posts, per_author=2)
    assert [p.reactions for p in kept if p.author == "a"] == [4, 3]
    assert [p.text for p in kept if p.author == "b"] == [LONG]
