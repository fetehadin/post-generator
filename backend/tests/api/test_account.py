"""Daily limits (FR-30), export and delete (FR-38, NFR-10), the publish rate (FR-15), and
edge cases around them."""

import pytest
from sqlalchemy import func, select, text

from app.core.config import get_settings
from app.core.db import user_session
from app.models import Draft, SourcePost, User
from app.services.library import edit_amount
from tests.api.conftest import FakeAI
from tests.api.test_api import upload

API = "/api/v1"


@pytest.fixture
def limits(monkeypatch):
    cfg = get_settings()

    def set_limits(drafts=None, posts=None):
        if drafts is not None:
            monkeypatch.setattr(cfg, "daily_draft_limit", drafts)
        if posts is not None:
            monkeypatch.setattr(cfg, "daily_post_limit", posts)

    return set_limits


def generate(api, topic="ship"):
    return api.post(f"{API}/drafts/generate", json={"platform": "telegram", "topic": topic})


# FR-30


def test_the_draft_limit_stops_more_drafts_and_says_why(api, limits, make_user):
    upload(api)
    limits(drafts=2)
    assert generate(api).status_code == 201
    draft = generate(api).json()["id"]
    r = generate(api)
    assert (r.status_code, r.json()["error"]["code"]) == (429, "daily_limit")
    assert "resets at midnight UTC" in r.json()["error"]["message"]
    r = api.post(f"{API}/drafts/{draft}/revise", json={"instruction": "Shorter"})
    assert r.status_code == 429  # chat revisions count too

    u = api.get(f"{API}/me/usage").json()
    assert (u["drafts"], u["draft_limit"]) == (2, 2) and u["resets_at"].endswith(("Z", "+00:00"))

    api.state["user"] = make_user()  # other users are unaffected
    upload(api)
    assert generate(api).status_code == 201


def test_an_import_over_the_post_limit_saves_nothing(api, limits):
    limits(posts=2)
    r = upload(api)
    assert (r.status_code, r.json()["error"]["code"]) == (429, "daily_limit")
    assert api.get(f"{API}/posts?platform=telegram").json()["items"] == []
    assert api.get(f"{API}/me/usage").json()["posts"] == 0


def test_a_reimport_of_known_posts_doesnt_count_against_the_limit(api, limits):
    first = upload(api).json()["parsed"]
    limits(posts=first)  # today's count is now exactly at the limit
    assert upload(api).status_code == 201  # nothing new, so nothing to learn


# FR-38, NFR-10


def test_export_has_the_users_words_and_no_embeddings(api):
    upload(api)
    api.put(f"{API}/profile", json={"role": "Student"})
    api.post(f"{API}/checkins", json={"text": "Fixed it"})
    generate(api)
    r = api.get(f"{API}/me/export")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    data = r.json()
    assert data["profile"]["role"] == "Student"
    assert data["posts"] and "embedding" not in data["posts"][0]
    assert data["checkins"][0]["text"] == "Fixed it"
    assert data["drafts"][0]["versions"][0]["text"]


def test_delete_needs_the_word_and_removes_every_row(api, make_user, owner_engine):
    other = make_user()
    me = api.state["user"]
    upload(api)
    generate(api)
    api.post(f"{API}/checkins", json={"text": "x"})

    r = api.request("DELETE", f"{API}/me", json={"confirm": "yes"})
    assert (r.status_code, r.json()["error"]["code"]) == (400, "confirm_required")
    assert api.request("DELETE", f"{API}/me", json={"confirm": "Delete"}).status_code == 204

    with owner_engine.connect() as conn:  # the owner sees past RLS: nothing left anywhere
        for table in ("users", "source_posts", "drafts", "draft_versions", "prompt_logs",
                      "checkins", "profiles", "imports"):  # fmt: skip
            col = "id" if table == "users" else "user_id"
            n = conn.execute(text(f"SELECT count(*) FROM {table} WHERE {col} = :u"), {"u": me})
            assert n.scalar() == 0, table
    with user_session(other) as s:
        assert s.get(User, other) is not None  # other users untouched


# FR-15


def test_the_publish_rate_and_edit_amount(api):
    upload(api)
    a, _ = generate(api).json()["id"], generate(api).json()["id"]
    api.patch(f"{API}/drafts/{a}", json={"text": "Shipped it 🚀\n@sam and more"})
    api.patch(f"{API}/drafts/{a}", json={"status": "approved"})
    api.patch(f"{API}/drafts/{a}", json={"status": "published"})
    st = api.get(f"{API}/drafts/stats").json()
    assert (st["created"], st["published"], st["publish_rate"]) == (2, 1, 0.5)
    assert 0 < st["edited"] < 0.5


def test_stats_with_no_drafts_are_empty_not_an_error(api):
    assert api.get(f"{API}/drafts/stats").json() == {
        "created": 0, "published": 0, "publish_rate": None, "edited": None,
    }  # fmt: skip


def test_edit_amount_bounds():
    assert edit_amount("same", "same") == 0
    assert edit_amount("abc", "xyz") == 1


# Edge cases


def test_deleting_a_checkin_keeps_its_drafts(api):
    upload(api)
    cid = api.post(f"{API}/checkins", json={"text": "Fixed it"}).json()["id"]
    d = api.post(
        f"{API}/drafts/generate", json={"platform": "telegram", "topic": "t", "checkin_id": cid}
    ).json()["id"]
    api.delete(f"{API}/checkins/{cid}")
    got = api.get(f"{API}/drafts/{d}").json()
    assert got["checkin_id"] is None and got["status"] == "draft"


def test_a_restore_of_another_drafts_version_is_not_found(api):
    upload(api)
    a, b = generate(api).json()["id"], generate(api).json()["id"]
    v = api.get(f"{API}/drafts/{b}").json()["versions"][0]["id"]
    assert api.post(f"{API}/drafts/{a}/versions/{v}/restore").status_code == 404


def test_a_whitespace_only_instruction_is_refused(api):
    upload(api)
    d = generate(api).json()["id"]
    r = api.post(f"{API}/drafts/{d}/revise", json={"instruction": "   "})
    assert r.json()["error"]["code"] == "missing_instruction"


def test_a_whitespace_only_checkin_is_refused(api):
    r = api.post(f"{API}/checkins", json={"text": "   "})
    assert (r.status_code, r.json()["error"]["code"]) == (400, "missing_text")
    assert api.get(f"{API}/checkins").json()["items"] == []


def test_unknown_draft_ids_and_bad_ids_are_clean_errors(api):
    assert api.get(f"{API}/drafts/00000000-0000-0000-0000-000000000000").status_code == 404
    assert api.get(f"{API}/drafts/not-a-uuid").status_code == 422


def test_counts_in_the_db_match_after_a_failed_ai_call(api):
    upload(api)

    class Down(FakeAI):
        def generate(self, *a, **k):
            from app.ai.client import AIUnavailable

            raise AIUnavailable("down")

    api.state["ai"] = Down()
    assert generate(api).status_code == 503
    with user_session(api.state["user"]) as s:
        assert s.scalar(select(func.count()).select_from(Draft)) == 0  # no half-saved draft
        assert s.scalar(select(func.count()).select_from(SourcePost)) > 0


def test_a_blank_hand_edit_is_refused(api):
    upload(api)
    d = generate(api).json()["id"]
    r = api.patch(f"{API}/drafts/{d}", json={"text": "  \n "})
    assert (r.status_code, r.json()["error"]["code"]) == (400, "missing_text")
    assert len(api.get(f"{API}/drafts/{d}").json()["versions"]) == 1


def test_an_empty_ai_answer_saves_nothing(api):
    from app.ai.client import GenerationResult

    upload(api)
    d = generate(api).json()["id"]

    class Empty(FakeAI):
        def generate(self, *a, **k):
            return GenerationResult('  ""  ', "m", "google", "v")

    api.state["ai"] = Empty()
    assert generate(api).status_code == 503
    r = api.post(f"{API}/drafts/{d}/revise", json={"instruction": "Shorter"})
    assert r.status_code == 503
    assert len(api.get(f"{API}/drafts/{d}").json()["versions"]) == 1
