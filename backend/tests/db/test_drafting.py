"""Topic → draft, with a fake AI and a real database."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.ai.client import GenerationResult
from app.core.db import user_session
from app.importers.common import ParsedPost
from app.models import Draft, DraftVersion, PlatformProfile, PromptLog, SourcePost
from app.services.drafting import DraftError, build_prompt, clean_output, generate_draft, prompt_for
from app.services.posts import save_posts
from app.services.retrieval import Example

DIMS = 768


def vec(*xs):
    return list(xs) + [0.0] * (DIMS - len(xs))


class FakeAI:
    def __init__(self, reply="Shipped the importer today 🚀\n@fetedev"):
        self.reply = reply
        self.prompts: list[str] = []

    def embed_query(self, text):
        return vec(1)

    def generate(self, prompt, purpose="draft", temperature=0.9):
        self.prompts.append(prompt)
        return GenerationResult(self.reply, "gemini-flash-latest", "google", "gemini-3.8-flash")


def add_post(user, key, text, platform="telegram", v=None):
    with user_session(user) as s:
        save_posts(s, user, platform, [ParsedPost(key, text, datetime(2026, 1, 1, tzinfo=UTC))])
        post = s.scalars(select(SourcePost).where(SourcePost.external_id == key)).one()
        post.embedding, post.embedding_model = v or vec(1, 0.5), "gemini-embedding-2"


def test_prompt_has_examples_facts_rules_and_no_placeholders():
    profile = PlatformProfile(
        platform="telegram", char_limit=4096, counting_rule="plain",
        tone_notes="Relaxed.", structure_notes="Short lines.",
    )  # fmt: skip
    examples = [
        Example(None, "Day 2/10 #10DaysGrind 🪖", 0.9, False),
        Example(None, "Costs $5", 0.8, False),
    ]
    prompt = build_prompt(profile, examples, "Finished the importer")
    assert "[1]\nDay 2/10 #10DaysGrind 🪖" in prompt and "[2]\nCosts $5" in prompt
    assert "Finished the importer" in prompt
    assert "Use ONLY these facts" in prompt  # FR-19
    assert "Maximum length: 4096 characters" in prompt and "Relaxed." in prompt
    assert "$platform" not in prompt and "$facts" not in prompt


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ('"Shipped it."', "Shipped it."),
        ("“Shipped it.”", "Shipped it."),
        ("```\nShipped it.\n```", "Shipped it."),
        ("Here's your draft:\nShipped it.", "Shipped it."),
        ("  Shipped it.  ", "Shipped it."),
        ('He said "hi" and left', 'He said "hi" and left'),
    ],
)
def test_clean_output(raw, clean):
    assert clean_output(raw) == clean


def test_generate_saves_draft_version_and_exact_prompt(make_user):
    user = make_user()
    add_post(user, "1", "Day 2/10 #10DaysGrind 🪖")
    ai = FakeAI()
    result = generate_draft(user, "telegram", "Finished the Telegram importer", ai=ai)

    assert result.text == "Shipped the importer today 🚀\n@fetedev"
    assert (result.model, result.model_version) == ("gemini-flash-latest", "gemini-3.8-flash")
    assert result.char_limit == 4096 and not result.over_limit
    assert [e.text for e in result.examples] == ["Day 2/10 #10DaysGrind 🪖"]
    with user_session(user) as s:
        draft = s.get(Draft, result.draft_id)
        assert (draft.status, draft.platform, draft.topic) == (
            "draft",
            "telegram",
            "Finished the Telegram importer",
        )
        version = s.scalars(select(DraftVersion).where(DraftVersion.draft_id == draft.id)).one()
        assert version.text == result.text and version.model == "gemini-3.8-flash"
        log = s.scalars(select(PromptLog).where(PromptLog.draft_id == draft.id)).one()
        assert log.prompt == ai.prompts[0]  # the exact prompt sent (NFR-15)
        assert log.draft_version_id == version.id
        assert (log.model, log.model_version, log.provider) == (
            "gemini-flash-latest",
            "gemini-3.8-flash",
            "google",
        )


def test_only_the_platforms_own_posts_reach_the_prompt(make_user):
    user = make_user()
    add_post(user, "tg", "telegram voice post")
    add_post(user, "xp", "an X post", platform="x", v=vec(1))
    ai = FakeAI()
    generate_draft(user, "telegram", "anything", ai=ai)
    assert "telegram voice post" in ai.prompts[0] and "an X post" not in ai.prompts[0]


def test_x_draft_length_uses_weighted_counting(make_user):
    user = make_user()
    add_post(user, "xp", "an X post", platform="x")
    result = generate_draft(user, "x", "topic", ai=FakeAI(reply="🚀" * 141))
    assert result.length == 282 and result.char_limit == 280 and result.over_limit


def test_another_user_cannot_read_the_draft_or_prompt(make_user):
    a, b = make_user(), make_user()
    add_post(a, "1", "a post")
    result = generate_draft(a, "telegram", "topic", ai=FakeAI())
    assert prompt_for(a, result.draft_id) is not None
    assert prompt_for(b, result.draft_id) is None
    with user_session(b) as s:
        assert s.get(Draft, result.draft_id) is None


def test_empty_topic_is_refused(make_user):
    with pytest.raises(DraftError, match="topic"):
        generate_draft(make_user(), "telegram", "   ", ai=FakeAI())


def test_no_posts_yet_gives_a_clear_message(make_user):
    with pytest.raises(DraftError, match="Import your export first"):
        generate_draft(make_user(), "telegram", "topic", ai=FakeAI())
