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

    embedded = 0

    def embed_query(self, text):
        self.embedded += 1
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


def test_empty_topic_without_a_summary_card_is_refused(make_user):
    # With a summary card, an empty box is allowed (tests/api/test_drafting_workflow.py).
    with pytest.raises(DraftError, match="summary card"):
        generate_draft(make_user(), "telegram", "   ", ai=FakeAI())


@pytest.mark.parametrize("platform", ["telegram", "x", "linkedin"])
def test_with_no_posts_yet_the_inspiration_pool_shapes_the_draft(make_user, platform):
    ai = FakeAI()
    result = generate_draft(make_user(), platform, "Shipped the importer", ai=ai)
    prompt = ai.prompts[0]
    assert "## Inspiration (not their voice)" in prompt and "[A]" in prompt
    assert "(none yet: they haven't imported posts here)" in prompt
    assert result.examples == [] and ai.embedded == 0  # nothing to search, no embedding call


def test_inspiration_is_only_for_this_platform(make_user):
    ai = FakeAI()
    generate_draft(make_user(), "x", "topic", ai=ai)
    assert "dark mode" not in ai.prompts[0]  # a Telegram exemplar
    assert "Unpopular opinion" in ai.prompts[0]  # an X exemplar


def test_twenty_posts_turn_the_inspiration_off(make_user):
    user = make_user()
    for i in range(20):
        add_post(user, str(i), f"my own post number {i}", v=vec(1, i / 10))
    ai = FakeAI()
    generate_draft(user, "telegram", "topic", ai=ai)
    assert "Inspiration" not in ai.prompts[0]


def test_no_posts_and_no_pool_gives_a_clear_message(make_user, monkeypatch):
    monkeypatch.setattr("app.services.drafting.inspiration", lambda *_: [])
    with pytest.raises(DraftError, match="Import your export first"):
        generate_draft(make_user(), "telegram", "topic", ai=FakeAI())


def test_without_a_pool_the_prompt_is_unchanged():
    profile = PlatformProfile(
        platform="x",
        char_limit=280,
        counting_rule="x_weighted",
        tone_notes="t",
        structure_notes="s",
    )
    ex = [Example(None, "a post", 0.9, False)]
    assert build_prompt(profile, ex, "topic") == build_prompt(profile, ex, "topic", pool=[])
    assert "Inspiration" not in build_prompt(profile, ex, "topic")


COPIED = "Ship log fixed the timezone bug everything is UTC in the database now"


class ScriptedAI(FakeAI):
    """Returns the replies in order; an Exception in the list is raised instead."""

    def __init__(self, replies):
        super().__init__()
        self.replies = list(replies)

    def generate(self, prompt, purpose="draft", temperature=0.9):
        self.prompts.append(prompt)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return GenerationResult(reply, "gemini-flash-latest", "google", "gemini-3.8-flash")


def test_a_copied_draft_is_rewritten_once_and_the_log_keeps_that_prompt(make_user):
    user = make_user()
    add_post(user, "1", COPIED + ". Should have done that on day one.")
    ai = ScriptedAI(
        [COPIED + " today", "Timezones are finally sorted: UTC inside, local at the edges."]
    )
    result = generate_draft(user, "telegram", "fixed the timezone bug", ai=ai)
    assert result.text.startswith("Timezones are finally sorted")
    assert len(ai.prompts) == 2 and '"ship log fixed the timezone bug' in ai.prompts[1]
    assert "Fix your first try" in prompt_for(user, result.draft_id).prompt  # NFR-15


def test_a_rewrite_that_copies_just_as_much_is_not_used(make_user):
    user = make_user()
    add_post(user, "1", COPIED + ".")
    ai = ScriptedAI([COPIED + " A", COPIED + " B"])
    result = generate_draft(user, "telegram", "timezone bug", ai=ai)
    assert result.text.endswith(" A")
    assert "Fix your first try" not in prompt_for(user, result.draft_id).prompt


def test_a_failed_rewrite_keeps_the_first_draft(make_user):
    from app.ai.client import AIUnavailable

    user = make_user()
    add_post(user, "1", COPIED + ".")
    ai = ScriptedAI([COPIED + " A", AIUnavailable("all models failed")])
    assert generate_draft(user, "telegram", "timezone bug", ai=ai).text.endswith(" A")


def test_an_original_draft_is_not_rewritten(make_user):
    user = make_user()
    add_post(user, "1", COPIED + ".")
    ai = ScriptedAI(["Small win: UTC everywhere now."])
    generate_draft(user, "telegram", "timezone bug", ai=ai)
    assert len(ai.prompts) == 1


def test_an_invented_number_is_removed_by_one_rewrite(make_user):
    user = make_user()
    add_post(user, "1", "200 SUBSCRIBERS! Thank you all.")
    ai = ScriptedAI(["300 SUBSCRIBERS! 🎉", "A new milestone! Thank you all 🎉"])
    result = generate_draft(user, "telegram", "passed a new subscriber milestone", ai=ai)
    assert result.text == "A new milestone! Thank you all 🎉"
    assert "numbers that aren't in the facts: 300" in ai.prompts[1]


def test_a_rewrite_that_copies_less_is_kept(make_user):
    user = make_user()
    add_post(user, "1", COPIED + ".")
    shorter_copy = "Ship log fixed the timezone bug everything is UTC, finally"  # 9 words, not 13
    ai = ScriptedAI([COPIED + " A", shorter_copy])
    assert generate_draft(user, "telegram", "timezone bug", ai=ai).text == shorter_copy


def test_an_unapproved_source_draft_shapes_wording_but_adds_no_facts(make_user):
    """Rule 10: a draft the user hasn't approved is model output. Converting it must not turn
    a number the model made up into a fact."""
    user = make_user()
    add_post(user, "1", "200 SUBSCRIBERS! Thank you all.")
    source = "We hit 300 subscribers this week!"
    ai = ScriptedAI(["300 subscribers! 🎉", "A new milestone! Thank you all 🎉"])
    result = generate_draft(user, "telegram", "a subscriber milestone", ai=ai, adapt_from=source)
    assert "not approved yet" in ai.prompts[0] and source in ai.prompts[0]
    assert "numbers that aren't in the facts: 300" in ai.prompts[1]
    assert result.text == "A new milestone! Thank you all 🎉"


def test_an_approved_source_draft_counts_as_facts(make_user):
    user = make_user()
    add_post(user, "1", "200 SUBSCRIBERS! Thank you all.")
    source = "We hit 300 subscribers this week!"
    ai = ScriptedAI(["300 subscribers! 🎉"])
    result = generate_draft(
        user, "telegram", "a subscriber milestone", ai=ai, adapt_from=source, adapt_approved=True
    )
    assert "approved by the writer" in ai.prompts[0]
    assert result.text == "300 subscribers! 🎉" and len(ai.prompts) == 1
