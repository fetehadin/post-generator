"""Profile: the About-you form, the summary card and how they reach drafts (FR-17–FR-19)."""

import pytest

from app.ai.client import AIUnavailable, GenerationResult
from tests.api.conftest import FakeAI
from tests.api.test_api import upload


class RecordingAI(FakeAI):
    """Remembers every prompt; the summary prompt gets a fixed card back."""

    def __init__(self):
        super().__init__()
        self.prompts: list[tuple[str, str]] = []

    def generate(self, prompt, purpose="draft", temperature=0.9):
        self.prompts.append((purpose, prompt))
        if purpose == "summary":
            return GenerationResult("I build Voxlace in Addis.", "m", "google", "v")
        return super().generate(prompt, purpose, temperature)


@pytest.fixture
def ai(api):
    api.state["ai"] = RecordingAI()
    return api.state["ai"]


def test_a_new_profile_has_defaults(api):
    p = api.get("/api/v1/profile").json()
    assert p["role"] == "" and p["language"] == "auto" and p["summary_card"] == ""
    assert "#family" in p["excluded_hashtags"]  # the default list until edited (FR-44)


def test_partial_edits_persist_and_hashtags_are_normalised(api):
    api.put("/api/v1/profile", json={"role": " Backend developer ", "topics": "Python, AI"})
    api.put("/api/v1/profile", json={"excluded_hashtags": ["Family", "#ME"]})
    p = api.get("/api/v1/profile").json()
    assert (p["role"], p["topics"]) == ("Backend developer", "Python, AI")
    assert p["excluded_hashtags"] == ["#family", "#me"]


def test_the_summary_is_written_only_from_the_answers(api, ai):
    api.put("/api/v1/profile", json={"role": "Student", "current_projects": "Voxlace"})
    p = api.post("/api/v1/profile/summary").json()
    assert p["summary_card"] == "I build Voxlace in Addis." and p["summary_updated_at"]
    purpose, prompt = ai.prompts[-1]
    assert purpose == "summary"
    assert "- Role: Student" in prompt and "- Current projects: Voxlace" in prompt
    assert "Use ONLY the facts above" in prompt
    assert "- Focus:" not in prompt  # empty answers are left out


def test_the_users_edited_card_reaches_the_draft_prompt(api, ai):
    upload(api)
    api.put("/api/v1/profile", json={"summary_card": "I teach Python to first-year students."})
    api.post("/api/v1/drafts/generate", json={"platform": "telegram", "topic": "ship"})
    prompt = ai.prompts[-1][1]
    assert "I teach Python to first-year students." in prompt  # FR-18: the edited version
    assert "About the writer" in prompt


def test_without_a_card_or_language_the_prompt_is_unchanged(api, ai):
    upload(api)
    api.post("/api/v1/drafts/generate", json={"platform": "telegram", "topic": "ship"})
    prompt = ai.prompts[-1][1]
    assert "About the writer" not in prompt and "Write the post in" not in prompt


def test_a_chosen_language_is_asked_for(api, ai):
    upload(api)
    api.put("/api/v1/profile", json={"language": "Amharic"})
    api.post("/api/v1/drafts/generate", json={"platform": "telegram", "topic": "ship"})
    assert "Write the post in Amharic." in ai.prompts[-1][1]


def test_imports_use_the_users_own_excluded_hashtags(api):
    api.put("/api/v1/profile", json={"excluded_hashtags": ["#buildinpublic"]})
    body = upload(api).json()
    assert body["skipped"].get("excluded_topic", 0) >= 1


def test_each_user_has_their_own_profile(api, make_user):
    api.put("/api/v1/profile", json={"role": "Secret role"})
    api.state["user"] = make_user()
    assert api.get("/api/v1/profile").json()["role"] == ""


def test_the_summary_says_so_when_the_ai_is_down(api):
    class Down(FakeAI):
        def generate(self, *a, **k):
            raise AIUnavailable("all models failed")

    api.state["ai"] = Down()
    r = api.post("/api/v1/profile/summary")
    assert (r.status_code, r.json()["error"]["code"]) == (503, "ai_unavailable")
