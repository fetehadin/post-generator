"""Chat actions (FR-55): rename, regenerate the title, pin, archive and delete a chat.
Deleting a chat never takes an approved, scheduled or posted draft with it."""

from datetime import UTC, datetime, timedelta

from app.ai.client import GenerationResult
from app.services.threads import clean_title
from tests.api.conftest import FakeAI
from tests.api.test_api import upload
from tests.api.test_drafting_workflow import ai as ai  # noqa: F401 (a fixture)
from tests.api.test_threads import API, generate, start


def rows(api):
    return {r["id"]: r for r in api.get(f"{API}/threads").json()["items"]}


def test_rename_trims_spaces_and_keeps_the_chats_place(api):
    older = start(api, "First")
    newer = start(api, "Second")
    r = api.patch(f"{API}/threads/{older['id']}", json={"title": "  Importer   week "})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Importer week"
    items = api.get(f"{API}/threads").json()["items"]
    assert [i["id"] for i in items] == [newer["id"], older["id"]]  # renaming isn't "touching"
    blank = api.patch(f"{API}/threads/{older['id']}", json={"title": "   "})
    assert blank.status_code == 400


def test_pinned_chats_come_first_and_archived_ones_are_flagged(api):
    a, b = start(api, "A"), start(api, "B")
    api.patch(f"{API}/threads/{a['id']}", json={"pinned": True})
    items = api.get(f"{API}/threads").json()["items"]
    assert [i["id"] for i in items] == [a["id"], b["id"]]
    assert items[0]["pinned"] is True and items[0]["archived"] is False
    api.patch(f"{API}/threads/{a['id']}", json={"archived": True})
    assert rows(api)[a["id"]]["archived"] is True
    assert rows(api)[a["id"]]["pinned"] is False  # archiving unpins
    api.patch(f"{API}/threads/{b['id']}", json={"archived": True})
    assert rows(api)[b["id"]]["archived"] is True
    api.patch(f"{API}/threads/{b['id']}", json={"archived": False})
    assert rows(api)[b["id"]]["archived"] is False


def test_delete_keeps_approved_and_scheduled_drafts(api, ai):
    upload(api)
    t = start(api)
    out = generate(api, t["id"], ["telegram", "linkedin", "x"])
    tg, li, x = (d["id"] for d in out["drafts"])
    day = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    assert api.post(f"{API}/drafts/{tg}/schedule", json={"day": day}).status_code == 200
    assert api.patch(f"{API}/drafts/{li}", json={"status": "approved"}).status_code == 200

    r = api.delete(f"{API}/threads/{t['id']}")
    assert r.status_code == 200, r.text
    assert r.json() == {"kept_drafts": 2}
    assert api.get(f"{API}/threads/{t['id']}").status_code == 404
    assert t["id"] not in rows(api)
    kept = {d["id"]: d for d in api.get(f"{API}/drafts").json()["items"]}
    assert tg in kept and li in kept and x not in kept
    assert kept[tg]["thread_id"] is None


def test_regenerate_title_uses_the_ai_and_cleans_its_answer(api, monkeypatch):
    t = start(api, "Finished the Telegram importer and wrote the tests for it today")

    def titled(self, prompt, purpose="draft", temperature=0.9):
        assert purpose == "thread_title"
        assert "Finished the Telegram importer" in prompt
        return GenerationResult('Title: "Telegram importer done."', "m", "google", "m")

    monkeypatch.setattr(FakeAI, "generate", titled)
    r = api.post(f"{API}/threads/{t['id']}/title")
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Telegram importer done"


def test_regenerate_title_when_the_ai_is_busy_keeps_the_old_one(api):
    t = start(api, "Wrote tests")
    api.state["ai"] = FakeAI(fail_generate=True)
    r = api.post(f"{API}/threads/{t['id']}/title")
    assert r.status_code == 503
    assert rows(api)[t["id"]]["title"] == "Wrote tests"


def test_another_user_cannot_touch_my_chat(api, make_user):
    t = start(api)
    api.state["user"] = make_user()
    assert api.patch(f"{API}/threads/{t['id']}", json={"title": "Mine"}).status_code == 404
    assert api.patch(f"{API}/threads/{t['id']}", json={"pinned": True}).status_code == 404
    assert api.post(f"{API}/threads/{t['id']}/title").status_code == 404
    assert api.delete(f"{API}/threads/{t['id']}").status_code == 404


def test_clean_title():
    assert clean_title("“Shipped the bot.”\nmore") == "Shipped the bot"
    assert clean_title("**Title:** Week one") == "Week one"
    assert clean_title("x" * 80).endswith("…") and len(clean_title("x" * 80)) == 60
