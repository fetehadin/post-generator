"""The chat board (FR-40, FR-46), notifications and reminders (FR-35, FR-42), the user's time
zone (NFR-16), delete forever, learning from published posts, and the embedding retry
(NFR-14)."""

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, text

from app.core.db import user_session
from app.models import Draft, SourcePost
from app.services import notifications
from app.services.embedding import embed_in_background, users_waiting
from tests.api.conftest import FakeAI
from tests.api.test_api import upload
from tests.api.test_drafting_workflow import ScriptedAI
from tests.api.test_drafting_workflow import ai as ai  # noqa: F401 (a fixture)

API = "/api/v1"
WAITING = "UPDATE source_posts SET embedding = NULL, embedding_model = NULL WHERE user_id = :u"


def start(api, text="Finished the Telegram importer"):
    r = api.post(f"{API}/threads", json={"text": text})
    assert r.status_code == 201, r.text
    return r.json()


def generate(api, thread_id, platforms):
    r = api.post(f"{API}/threads/{thread_id}/generate", json={"platforms": platforms})
    assert r.status_code == 201, r.text
    return r.json()


# The chat board


def test_save_opens_a_thread_with_todays_checkin(api):
    t = start(api, "  Finished the Telegram importer\nand wrote tests  ")
    assert t["title"] == "Finished the Telegram importer"
    assert t["checkin_text"] == "Finished the Telegram importer\nand wrote tests"
    assert [(m["role"], m["card"]) for m in t["messages"]] == [("user", None)]
    checkins = api.get(f"{API}/checkins").json()["items"]
    assert [c["id"] for c in checkins] == [t["checkin_id"]]


def test_generate_adds_one_card_per_platform_and_reports_the_rest(api, ai):
    upload(api)  # Telegram posts only: LinkedIn has nothing to learn from yet
    t = start(api)
    out = generate(api, t["id"], ["telegram", "linkedin"])
    cards = [m for m in out["messages"] if m["card"]]
    assert len(cards) == 1 and cards[0]["card"]["number"] == 1
    assert [d["platform"] for d in out["drafts"]] == ["telegram"]
    assert out["drafts"][0]["thread_id"] == t["id"]
    assert [(f["platform"], f["code"]) for f in out["failures"]] == [("linkedin", "no_posts")]
    # The check-in is the topic of every draft in the thread.
    assert "Finished the Telegram importer" in ai.prompts[-1][1]


def test_each_revision_is_a_new_full_card_in_the_thread(api, ai):
    upload(api)
    t = start(api)
    draft_id = generate(api, t["id"], ["telegram"])["drafts"][0]["id"]
    ai.replies.append("Shorter now.")
    api.post(f"{API}/drafts/{draft_id}/revise", json={"instruction": "Shorter"})
    api.patch(f"{API}/drafts/{draft_id}", json={"text": "Fixed by hand."})

    thread = api.get(f"{API}/threads/{t['id']}").json()
    lines = [(m["role"], m["text"], m["card"] and m["card"]["number"]) for m in thread["messages"]]
    assert lines == [
        ("user", "Finished the Telegram importer", None),
        ("assistant", "", 1),
        ("user", "Shorter", None),
        ("assistant", "v2: Shorter", 2),
        ("user", "Edited by hand", 3),
    ]
    assert thread["messages"][3]["card"]["text"] == "Shorter now."
    assert thread["drafts"][0]["text"] == "Fixed by hand."


def test_a_version_for_another_platform_is_a_new_draft_in_the_same_thread(api, ai):
    upload(api)
    upload(api, name="linkedin/Shares.csv", platform="linkedin")
    t = start(api)
    source = generate(api, t["id"], ["telegram"])["drafts"][0]
    r = api.post(f"{API}/drafts/{source['id']}/convert", json={"platform": "linkedin"})
    assert r.status_code == 201, r.text
    out = r.json()
    assert [d["platform"] for d in out["drafts"]] == ["telegram", "linkedin"]
    assert out["messages"][-2]["text"] == "Make a LinkedIn version"
    assert out["messages"][-1]["card"]["number"] == 1
    purpose, prompt = ai.prompts[-1]
    assert "already written for another platform" in prompt and source["text"] in prompt
    with user_session(api.state["user"]) as s:
        new = s.get(Draft, out["drafts"][1]["id"])
        assert new.source_draft_id is not None and new.thread_id is not None
    # The original is untouched.
    assert api.get(f"{API}/drafts/{source['id']}").json()["text"] == source["text"]
    same = api.post(f"{API}/drafts/{source['id']}/convert", json={"platform": "telegram"})
    assert same.status_code == 400


def test_threads_are_listed_newest_first_with_their_platforms(api, ai):
    upload(api)
    first = start(api, "first")
    second = start(api, "second")
    generate(api, first["id"], ["telegram"])  # touching a thread moves it to the top
    items = api.get(f"{API}/threads").json()["items"]
    assert [(i["id"], i["platforms"]) for i in items] == [
        (first["id"], ["telegram"]),
        (second["id"], []),
    ]


def test_another_users_thread_is_not_found(api, ai, make_user):
    upload(api)
    t = start(api)
    draft_id = generate(api, t["id"], ["telegram"])["drafts"][0]["id"]
    api.state["user"] = make_user()
    assert api.get(f"{API}/threads/{t['id']}").status_code == 404
    assert (
        api.post(f"{API}/threads/{t['id']}/generate", json={"platforms": ["x"]}).status_code == 404
    )
    convert = api.post(f"{API}/drafts/{draft_id}/convert", json={"platform": "x"})
    assert convert.status_code == 404
    assert api.delete(f"{API}/drafts/{draft_id}").status_code == 404
    assert api.get(f"{API}/threads").json()["items"] == []


def test_a_failed_conversion_leaves_no_request_in_the_thread(api, ai):
    upload(api)  # Telegram posts only: there's nothing to learn an X voice from yet
    t = start(api)
    source = generate(api, t["id"], ["telegram"])["drafts"][0]
    before = api.get(f"{API}/threads/{t['id']}").json()["messages"]
    r = api.post(f"{API}/drafts/{source['id']}/convert", json={"platform": "x"})
    assert r.status_code == 400, r.text
    assert api.get(f"{API}/threads/{t['id']}").json()["messages"] == before


# Time zone, notifications and reminders


def test_time_zone_is_saved_and_checked(api):
    assert api.get(f"{API}/me").json()["timezone"] == "UTC"
    r = api.patch(f"{API}/me", json={"timezone": "Africa/Addis_Ababa"})
    assert r.status_code == 200 and r.json()["timezone"] == "Africa/Addis_Ababa"
    assert api.patch(f"{API}/me", json={"timezone": "Mars/Base"}).status_code == 400


def test_a_new_checkin_defaults_to_the_users_own_day(api):
    api.patch(f"{API}/me", json={"timezone": "Pacific/Kiritimati"})  # UTC+14
    c = api.post(f"{API}/checkins", json={"text": "late night work"}).json()
    assert c["day"] == datetime.now(ZoneInfo("Pacific/Kiritimati")).date().isoformat()


def approved_at(api, when: datetime) -> str:
    upload(api)
    d = api.post(f"{API}/drafts/generate", json={"platform": "telegram", "topic": "x"}).json()
    api.patch(f"{API}/drafts/{d['id']}", json={"status": "approved"})
    with user_session(api.state["user"]) as s:  # the API refuses past times; set it directly
        s.get(Draft, d["id"]).scheduled_for = when
    return d["id"]


def test_a_post_is_due_around_its_time_then_missed(api):
    now = datetime.now(UTC)
    soon = approved_at(api, now + timedelta(minutes=5))
    gone = approved_at(api, now - timedelta(hours=2))
    n = api.get(f"{API}/me/notifications").json()
    assert [d["id"] for d in n["due"]] == [soon]
    assert [d["id"] for d in n["missed"]] == [gone]
    api.patch(f"{API}/drafts/{gone}", json={"status": "published"})  # Posted clears it
    assert api.get(f"{API}/me/notifications").json()["missed"] == []


def test_checkin_reminder_shows_from_its_time_until_a_checkin(api):
    user = api.state["user"]
    api.patch(f"{API}/me", json={"timezone": "Africa/Addis_Ababa"})
    r = api.put(
        f"{API}/me/reminders",
        json={"enabled": True, "days": [0, 1, 2, 3, 4, 5, 6], "local_time": "09:00"},
    )
    assert r.status_code == 200 and r.json()["local_time"] == "09:00:00"
    addis = ZoneInfo("Africa/Addis_Ababa")
    today = datetime.now(addis).date()
    morning = datetime.combine(today, time(8, 59), addis)
    later = datetime.combine(today, time(9, 30), addis)
    assert notifications.notifications(user, now=morning).checkin_reminder is False
    assert notifications.notifications(user, now=later).checkin_reminder is True
    api.post(f"{API}/checkins", json={"text": "done", "day": today.isoformat()})
    assert notifications.notifications(user, now=later).checkin_reminder is False


def test_reminder_days_are_checked(api):
    bad = api.put(f"{API}/me/reminders", json={"enabled": True, "days": [7], "local_time": "9:00"})
    assert bad.status_code == 422
    assert api.get(f"{API}/me/reminders").json() == {
        "enabled": False,
        "days": [0, 1, 2, 3, 4],
        "local_time": "18:00:00",
    }


# Delete forever, and learning from what was published


def test_only_a_discarded_draft_can_be_deleted_forever(api, ai):
    upload(api)
    d = api.post(f"{API}/drafts/generate", json={"platform": "telegram", "topic": "x"}).json()
    assert api.delete(f"{API}/drafts/{d['id']}").status_code == 409
    api.patch(f"{API}/drafts/{d['id']}", json={"status": "discarded"})
    assert api.delete(f"{API}/drafts/{d['id']}").status_code == 204
    assert api.get(f"{API}/drafts/{d['id']}").status_code == 404


def test_a_published_post_joins_the_users_own_posts(api, ai):
    upload(api)
    d = api.post(f"{API}/drafts/generate", json={"platform": "telegram", "topic": "x"}).json()
    api.patch(f"{API}/drafts/{d['id']}", json={"status": "approved"})
    api.patch(f"{API}/drafts/{d['id']}", json={"status": "published"})
    with user_session(api.state["user"]) as s:
        post = s.scalars(select(SourcePost).where(SourcePost.origin == "voxlace")).one()
        assert (post.text, post.platform, post.embedding) == (d["text"], "telegram", None)


# The embedding retry (NFR-14)


def test_the_retry_finds_waiting_users_and_finishes_their_posts(api, owner_engine):
    user = api.state["user"]
    api.state["ai"] = ScriptedAI()
    upload(api)
    with owner_engine.begin() as conn:  # as if the model had been down during the import
        conn.execute(
            text(WAITING),
            {"u": user},
        )
    assert user in users_waiting()
    embed_in_background(user, ai=FakeAI())
    assert user not in users_waiting()


def test_a_second_retry_for_the_same_user_waits_its_turn(api, owner_engine):
    """While one process holds the user's lock, another doesn't embed them too."""
    user = api.state["user"]
    upload(api)
    with owner_engine.begin() as conn:
        conn.execute(
            text(WAITING),
            {"u": user},
        )
    with owner_engine.connect() as holder:
        holder.execute(text("SELECT pg_advisory_lock(hashtext(:k))"), {"k": f"embed:{user}"})
        embed_in_background(user, ai=FakeAI())
        assert user in users_waiting()  # skipped: someone else is on it
        holder.execute(text("SELECT pg_advisory_unlock(hashtext(:k))"), {"k": f"embed:{user}"})
    embed_in_background(user, ai=FakeAI())
    assert user not in users_waiting()
