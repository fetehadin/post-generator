"""Phase 4: check-ins, the library, hand edits, chat revisions, versions, approve, schedule
and "Posted" (FR-6, FR-9, FR-10, FR-11, FR-12, FR-13, FR-19, FR-40)."""

from datetime import UTC, datetime, timedelta

import pytest

from app.ai.client import GenerationResult
from tests.api.conftest import FakeAI
from tests.api.test_api import upload

API = "/api/v1"


class ScriptedAI(FakeAI):
    """Drafts as usual; revisions answer from a queue. Remembers every prompt."""

    def __init__(self):
        super().__init__()
        self.replies: list[str] = []
        self.prompts: list[tuple[str, str]] = []

    def generate(self, prompt, purpose="draft", temperature=0.9):
        self.prompts.append((purpose, prompt))
        if purpose == "revise":
            return GenerationResult(self.replies.pop(0), "m", "google", "v")
        return super().generate(prompt, purpose, temperature)


@pytest.fixture
def ai(api):
    api.state["ai"] = ScriptedAI()
    return api.state["ai"]


@pytest.fixture
def draft(api, ai):
    upload(api)
    r = api.post(f"{API}/drafts/generate", json={"platform": "telegram", "topic": "ship"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def later(hours=2):
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


# Check-ins (FR-6)


def test_checkins_can_be_saved_listed_edited_and_deleted(api):
    c = api.post(f"{API}/checkins", json={"text": " Fixed the importer ", "day": "2026-10-22"})
    assert c.status_code == 201 and c.json()["text"] == "Fixed the importer"
    cid = c.json()["id"]
    r = api.patch(f"{API}/checkins/{cid}", json={"text": "Fixed the X importer"})
    assert r.json()["text"] == "Fixed the X importer" and r.json()["day"] == "2026-10-22"
    assert [i["id"] for i in api.get(f"{API}/checkins").json()["items"]] == [cid]
    assert api.delete(f"{API}/checkins/{cid}").status_code == 204
    assert api.get(f"{API}/checkins").json()["items"] == []


def test_another_users_checkin_is_not_found(api, make_user):
    cid = api.post(f"{API}/checkins", json={"text": "Mine"}).json()["id"]
    api.state["user"] = make_user()
    assert api.get(f"{API}/checkins").json()["items"] == []
    assert api.patch(f"{API}/checkins/{cid}", json={"text": "x"}).status_code == 404
    assert api.delete(f"{API}/checkins/{cid}").status_code == 404
    upload(api)
    r = api.post(
        f"{API}/drafts/generate", json={"platform": "telegram", "topic": "t", "checkin_id": cid}
    )
    assert r.status_code == 404  # can't attach someone else's check-in


# Generate from what Voxlace knows (FR-19)


def test_an_empty_box_writes_from_the_summary_card(api, ai):
    upload(api)
    api.put(f"{API}/profile", json={"summary_card": "I build Voxlace, a post drafting tool."})
    r = api.post(f"{API}/drafts/generate", json={"platform": "telegram"})
    assert r.status_code == 201, r.text
    prompt = ai.prompts[-1][1]
    assert "I build Voxlace" in prompt and "(none today" in prompt


# Library and editor data (FR-10, FR-11)


def test_the_library_lists_drafts_with_their_current_text(api, draft):
    rows = api.get(f"{API}/drafts").json()["items"]
    assert [r["id"] for r in rows] == [draft]
    assert rows[0]["status"] == "draft" and rows[0]["length"]["limit"] == 4096
    assert api.get(f"{API}/drafts?status=approved").json()["items"] == []
    assert api.get(f"{API}/drafts?platform=x").json()["items"] == []
    d = api.get(f"{API}/drafts/{draft}").json()
    assert d["topic"] == "ship" and [v["number"] for v in d["versions"]] == [1]


def test_a_hand_edit_makes_a_new_version(api, draft):
    d = api.patch(f"{API}/drafts/{draft}", json={"text": "My own words."}).json()
    assert d["text"] == "My own words."
    assert [(v["number"], v["instruction"]) for v in d["versions"]] == [
        (1, None),
        (2, "Edited by hand"),
    ]
    d = api.patch(f"{API}/drafts/{draft}", json={"text": "My own words. "}).json()
    assert len(d["versions"]) == 2  # no change, no version


def test_restore_brings_an_old_version_back_as_the_newest(api, draft):
    first = api.get(f"{API}/drafts/{draft}").json()["versions"][0]
    api.patch(f"{API}/drafts/{draft}", json={"text": "Changed."})
    d = api.post(f"{API}/drafts/{draft}/versions/{first['id']}/restore").json()
    assert d["text"] == first["text"] and d["versions"][-1]["instruction"] == "Restored v1"


# Chat revisions (FR-10, FR-40)


def test_a_revision_adds_a_version_and_two_chat_lines(api, ai, draft):
    ai.replies.append("Shipped it. Short now.")
    d = api.post(f"{API}/drafts/{draft}/revise", json={"instruction": "Shorter"}).json()
    assert d["text"] == "Shipped it. Short now." and len(d["versions"]) == 2
    assert [(m["role"], m["text"]) for m in d["messages"]] == [
        ("user", "Shorter"),
        ("assistant", "v2: Shorter"),
    ]
    assert d["messages"][1]["version_id"] == d["versions"][1]["id"]
    purpose, prompt = ai.prompts[-1]
    assert purpose == "revise" and "Shorter" in prompt and "Never invent" in prompt


def test_a_selection_changes_only_that_part(api, ai, draft):
    api.patch(f"{API}/drafts/{draft}", json={"text": "First line stays.\nFix this line."})
    ai.replies.append("A better line.")
    d = api.post(
        f"{API}/drafts/{draft}/revise",
        json={"instruction": "fix this", "selection": "Fix this line."},
    ).json()
    assert d["text"] == "First line stays.\nA better line."
    assert "Change ONLY this part" in ai.prompts[-1][1]


def test_a_missing_fact_gets_a_question_not_a_guess(api, ai, draft):
    ai.replies.append("QUESTION: Which project, Voxlace or the CLI?")
    d = api.post(f"{API}/drafts/{draft}/revise", json={"instruction": "mention my project"}).json()
    assert len(d["versions"]) == 1  # the text didn't change
    assert d["messages"][-1] == {**d["messages"][-1], "role": "assistant", "version_id": None}
    assert d["messages"][-1]["text"] == "Which project, Voxlace or the CLI?"


# Approve, schedule, Posted (FR-9, FR-12, FR-13; CLAUDE.md rule 4)


def test_approve_is_refused_over_the_limit(api, draft):
    api.patch(f"{API}/drafts/{draft}", json={"text": "a" * 4100})
    r = api.patch(f"{API}/drafts/{draft}", json={"status": "approved"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "over_limit")
    assert "Cut 4 characters" in r.json()["error"]["message"]


def test_scheduling_needs_approval_first(api, draft):
    r = api.patch(f"{API}/drafts/{draft}", json={"scheduled_for": later()})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "not_approved")


def test_approve_and_schedule_puts_it_on_the_calendar(api, draft):
    when = later(3)
    d = api.patch(f"{API}/drafts/{draft}", json={"status": "approved", "scheduled_for": when})
    assert d.status_code == 200, d.text
    assert d.json()["status"] == "approved" and d.json()["scheduled_for"]
    week = {"scheduled_from": later(-24), "scheduled_to": later(24)}
    rows = api.get(f"{API}/drafts", params=week).json()["items"]
    assert [r["id"] for r in rows] == [draft]
    nothing = {"scheduled_from": later(48), "scheduled_to": later(72)}
    assert api.get(f"{API}/drafts", params=nothing).json()["items"] == []


def test_a_time_in_the_past_is_refused(api, draft):
    api.patch(f"{API}/drafts/{draft}", json={"status": "approved"})
    r = api.patch(f"{API}/drafts/{draft}", json={"scheduled_for": later(-2)})
    assert r.json()["error"]["code"] == "in_the_past"


def test_a_naive_time_is_refused(api, draft):
    api.patch(f"{API}/drafts/{draft}", json={"status": "approved"})
    r = api.patch(f"{API}/drafts/{draft}", json={"scheduled_for": "2030-01-01T09:00:00"})
    assert r.status_code == 422  # times are UTC with an offset (CLAUDE.md rule 6)


def test_approved_text_is_locked_until_moved_back_to_draft(api, ai, draft):
    api.patch(f"{API}/drafts/{draft}", json={"status": "approved", "scheduled_for": later()})
    r = api.patch(f"{API}/drafts/{draft}", json={"text": "Changed"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "not_editable")
    r = api.post(f"{API}/drafts/{draft}/revise", json={"instruction": "Shorter"})
    assert r.status_code == 409
    d = api.patch(f"{API}/drafts/{draft}", json={"status": "draft"}).json()
    assert d["status"] == "draft" and d["scheduled_for"] is None  # off the calendar


def test_posted_needs_approval_and_is_final(api, draft):
    r = api.patch(f"{API}/drafts/{draft}", json={"status": "published"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "not_approved")
    api.patch(f"{API}/drafts/{draft}", json={"status": "approved"})
    d = api.patch(f"{API}/drafts/{draft}", json={"status": "published"}).json()
    assert d["status"] == "published" and d["published_at"]
    r = api.patch(f"{API}/drafts/{draft}", json={"status": "draft"})
    assert r.json()["error"]["code"] == "already_published"


def test_discard_takes_it_off_the_calendar(api, draft):
    api.patch(f"{API}/drafts/{draft}", json={"status": "approved", "scheduled_for": later()})
    d = api.patch(f"{API}/drafts/{draft}", json={"status": "discarded"}).json()
    assert d["status"] == "discarded" and d["scheduled_for"] is None


# Isolation (FR-29)


def test_another_user_cant_see_or_change_a_draft(api, ai, draft, make_user):
    api.state["user"] = make_user()
    assert api.get(f"{API}/drafts").json()["items"] == []
    assert api.get(f"{API}/drafts/{draft}").status_code == 404
    assert api.patch(f"{API}/drafts/{draft}", json={"status": "approved"}).status_code == 404
    ai.replies.append("hijacked")
    assert api.post(f"{API}/drafts/{draft}/revise", json={"instruction": "x"}).status_code == 404
