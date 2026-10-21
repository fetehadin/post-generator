"""One tab per platform: rules, stats, the voice card and X Premium (FR-5, FR-22, FR-26, Q31)."""

import pytest

from app.ai.client import AIUnavailable, GenerationResult
from app.services.voice import X_PREMIUM_LIMIT, set_premium
from tests.api.conftest import FakeAI
from tests.api.test_api import upload


class VoiceAI(FakeAI):
    """Writes a fixed card; remembers prompts. The card drops the user's line on purpose."""

    def __init__(self):
        super().__init__()
        self.prompts: list[tuple[str, str]] = []

    def generate(self, prompt, purpose="draft", temperature=0.9):
        self.prompts.append((purpose, prompt))
        if purpose == "voice_card":
            return GenerationResult("- Short posts.\n- Uses emoji.", "m", "google", "v")
        return super().generate(prompt, purpose, temperature)


@pytest.fixture
def ai(api):
    api.state["ai"] = VoiceAI()
    return api.state["ai"]


def test_a_platform_tab_shows_rules_stats_and_a_thin_warning(api):
    upload(api)
    t = api.get("/api/v1/platforms/telegram").json()
    assert t["rules"]["char_limit"] == 4096 and t["effective_limit"] == 4096
    assert t["stats"]["post_count"] > 0 and t["voice_card"] == ""
    x = api.get("/api/v1/platforms/x").json()
    assert x["stats"]["post_count"] == 0 and x["stats"]["thin"]  # FR-5 warning
    assert x["x_premium"] is None


def test_an_unknown_platform_is_refused(api):
    assert api.get("/api/v1/platforms/mastodon").status_code == 422


def test_writing_a_card_needs_posts(api, ai):
    r = api.post("/api/v1/platforms/x/voice-card")
    assert (r.status_code, r.json()["error"]["code"]) == (400, "no_posts")


def test_the_card_is_written_from_stats_and_posts_only(api, ai):
    upload(api)
    card = api.post("/api/v1/platforms/telegram/voice-card").json()["voice_card"]
    assert card == "- Short posts.\n- Uses emoji."
    purpose, prompt = ai.prompts[-1]
    assert purpose == "voice_card" and "Describe STYLE only" in prompt
    assert "Typical length:" in prompt


def test_hand_edits_survive_a_rewrite(api, ai):
    upload(api)
    api.post("/api/v1/platforms/telegram/voice-card")
    edited = "- Short posts.\n- Uses emoji.\n- Always ends with 'ship it'."
    api.put("/api/v1/platforms/telegram/voice-card", json={"voice_card": edited})

    card = api.post("/api/v1/platforms/telegram/voice-card").json()["voice_card"]
    assert "- Always ends with 'ship it'." in card  # FR-26, though the model dropped it
    assert "- Always ends with 'ship it'." in ai.prompts[-1][1]  # and it was asked to keep it


def test_the_voice_card_reaches_the_draft_prompt_only_for_its_platform(api, ai):
    upload(api)
    api.put("/api/v1/platforms/telegram/voice-card", json={"voice_card": "- Ends with a question."})
    api.post("/api/v1/drafts/generate", json={"platform": "telegram", "topic": "ship"})
    assert "- Ends with a question." in ai.prompts[-1][1]


def test_without_a_card_the_draft_prompt_is_unchanged(api, ai):
    upload(api)
    api.post("/api/v1/drafts/generate", json={"platform": "telegram", "topic": "ship"})
    assert "notes on how they write" not in ai.prompts[-1][1]


def test_x_premium_raises_the_limit_and_the_users_answer_wins(api):
    user = api.state["user"]
    set_premium(user, True, source="export")  # what an X import with long posts does
    x = api.get("/api/v1/platforms/x").json()
    assert (x["x_premium"], x["premium_source"], x["effective_limit"]) == (
        True,
        "export",
        X_PREMIUM_LIMIT,
    )

    x = api.put("/api/v1/platforms/x/settings", json={"x_premium": False}).json()
    assert (x["x_premium"], x["effective_limit"]) == (False, 280)
    set_premium(user, True, source="export")  # a later import doesn't overwrite the user
    assert api.get("/api/v1/platforms/x").json()["x_premium"] is False


def test_only_x_has_settings(api):
    r = api.put("/api/v1/platforms/telegram/settings", json={"x_premium": True})
    assert (r.status_code, r.json()["error"]["code"]) == (400, "not_supported")


def test_each_user_has_their_own_voice_card(api, make_user):
    api.put("/api/v1/platforms/telegram/voice-card", json={"voice_card": "- Secret style."})
    api.state["user"] = make_user()
    assert api.get("/api/v1/platforms/telegram").json()["voice_card"] == ""


def test_the_card_says_so_when_the_ai_is_down(api):
    upload(api)

    class Down(FakeAI):
        def generate(self, *a, **k):
            raise AIUnavailable("all models failed")

    api.state["ai"] = Down()
    r = api.post("/api/v1/platforms/telegram/voice-card")
    assert (r.status_code, r.json()["error"]["code"]) == (503, "ai_unavailable")
