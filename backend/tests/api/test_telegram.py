"""Telegram bot (FR-36): link an account, connect a channel from Telegram's update, post an
approved draft on the user's click only. Telegram itself is a fake; nothing leaves the test."""

import pytest
from sqlalchemy import text as sql

from app.api.telegram import get_telegram
from app.core.config import get_settings
from app.services import telegram as telegram_service
from app.services.telegram_api import TelegramError

API = "/api/v1"
SECRET = "test-webhook-secret"
HEADERS = {"X-Telegram-Bot-Api-Secret-Token": SECRET}


class FakeTelegram:
    def __init__(self) -> None:
        self.sent: list[tuple[int, str, list]] = []
        self.fail: TelegramError | None = None

    def send_message(self, chat_id: int, text: str, buttons=()) -> int:
        if self.fail and chat_id < 0:  # channels have negative ids; DMs to users still work
            raise self.fail
        self.sent.append((chat_id, text, list(buttons)))
        return len(self.sent)


@pytest.fixture
def bot(api, monkeypatch):
    cfg = get_settings()
    monkeypatch.setattr(cfg, "telegram_bot_token", "123:fake")
    monkeypatch.setattr(cfg, "telegram_bot_username", "VoxlaceBot")
    monkeypatch.setattr(cfg, "telegram_webhook_secret", SECRET)
    fake = FakeTelegram()
    api.app.dependency_overrides[get_telegram] = lambda: fake
    return fake


def _start(api, token: str, tg_id: int = 501):
    return api.post(
        f"{API}/webhooks/telegram",
        headers=HEADERS,
        json={
            "message": {
                "chat": {"id": tg_id, "type": "private"},
                "from": {"id": tg_id, "username": "fete"},
                "text": f"/start {token}",
            }
        },
    )


def _added(
    api, tg_id: int = 501, chat_id: int = -100777, can_post: bool = True, state="administrator"
):
    return api.post(
        f"{API}/webhooks/telegram",
        headers=HEADERS,
        json={
            "my_chat_member": {
                "chat": {
                    "id": chat_id,
                    "type": "channel",
                    "title": "FeteScript",
                    "username": "fetescript",
                },
                "from": {"id": tg_id},
                "new_chat_member": {"status": state, "can_post_messages": can_post},
            }
        },
    )


def _link(api) -> str:
    url = api.post(f"{API}/telegram/link").json()["url"]
    assert url.startswith("https://t.me/VoxlaceBot?start=")
    return url.split("start=")[1]


def _approved_telegram_draft(api) -> str:
    draft = api.post(f"{API}/drafts/generate", json={"platform": "telegram", "topic": "ship"})
    did = draft.json()["id"]
    assert api.patch(f"{API}/drafts/{did}", json={"status": "approved"}).status_code == 200
    return did


def test_off_until_the_bot_is_set_up(api):
    r = api.get(f"{API}/telegram").json()
    assert r["enabled"] is False
    assert api.post(f"{API}/telegram/link").status_code == 404


def test_the_webhook_refuses_anything_without_the_secret(api, bot):
    r = api.post(f"{API}/webhooks/telegram", json={"message": {}})
    assert r.status_code == 401
    r = api.post(
        f"{API}/webhooks/telegram",
        headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"},
        json={"message": {}},
    )
    assert r.status_code == 401
    assert bot.sent == []


def test_link_then_add_to_a_channel_connects_it(api, bot):
    token = _link(api)
    assert _start(api, token).status_code == 200
    # The bot answers with the one-tap "make me an admin" link.
    reply = bot.sent[-1]
    assert reply[0] == 501
    assert reply[2][0][1] == (
        "https://t.me/VoxlaceBot?startchannel&admin=post_messages+edit_messages+delete_messages"
    )
    assert api.get(f"{API}/telegram").json()["linked"] is True

    assert _added(api).status_code == 200
    channel = api.get(f"{API}/telegram").json()["channel"]
    assert channel == {"title": "FeteScript", "username": "fetescript", "can_post": True}
    assert "Connected to FeteScript" in bot.sent[-1][1]


def test_a_link_works_once_and_never_for_a_made_up_token(api, bot):
    token = _link(api)
    _start(api, token)
    _start(api, token, tg_id=999)  # used: a second person can't take the account
    assert "expired or was already used" in bot.sent[-1][1]
    _start(api, "made-up-token")
    assert "expired or was already used" in bot.sent[-1][1]


def test_without_post_rights_it_says_what_to_turn_on(api, bot):
    _start(api, _link(api))
    _added(api, can_post=False)
    assert api.get(f"{API}/telegram").json()["channel"]["can_post"] is False
    assert "Post messages" in bot.sent[-1][1]


def test_removing_the_bot_disconnects_the_channel(api, bot):
    _start(api, _link(api))
    _added(api)
    _added(api, state="left")
    assert api.get(f"{API}/telegram").json()["channel"] is None


def test_a_stranger_adding_the_bot_connects_nothing(api, bot):
    _added(api, tg_id=12345)
    assert api.get(f"{API}/telegram").json()["channel"] is None


def test_post_now_sends_an_approved_draft_once_and_marks_it_posted(api, bot):
    _start(api, _link(api))
    _added(api)
    did = _approved_telegram_draft(api)
    r = api.post(f"{API}/drafts/{did}/publish")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "published"
    sends = [s for s in bot.sent if s[0] == -100777]
    assert len(sends) == 1
    # A second click can't post it again.
    again = api.post(f"{API}/drafts/{did}/publish")
    assert again.status_code == 409
    assert len([s for s in bot.sent if s[0] == -100777]) == 1


def test_nothing_is_posted_before_approval(api, bot):
    _start(api, _link(api))
    _added(api)
    did = api.post(f"{API}/drafts/generate", json={"platform": "telegram", "topic": "t"}).json()[
        "id"
    ]
    r = api.post(f"{API}/drafts/{did}/publish")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "not_approved"
    assert not [s for s in bot.sent if s[0] == -100777]


def test_post_now_without_a_channel_says_how_to_connect(api, bot):
    did = _approved_telegram_draft(api)
    r = api.post(f"{API}/drafts/{did}/publish")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "no_channel"


def test_a_refused_post_stays_approved_with_a_plain_fix(api, bot):
    _start(api, _link(api))
    _added(api)
    did = _approved_telegram_draft(api)
    bot.fail = TelegramError(403, "Forbidden: bot is not a member of the channel chat")
    r = api.post(f"{API}/drafts/{did}/publish")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "telegram_refused"
    assert "Forbidden" not in r.json()["error"]["message"]
    assert api.get(f"{API}/drafts/{did}").json()["status"] == "approved"


def test_one_user_never_sees_or_posts_to_anothers_channel(api, bot, make_user):
    _start(api, _link(api))
    _added(api)
    other = make_user()
    api.state["user"] = other
    assert api.get(f"{API}/telegram").json()["channel"] is None
    did = _approved_telegram_draft(api)
    assert api.post(f"{API}/drafts/{did}/publish").json()["error"]["code"] == "no_channel"


# ---- the bot posts at the planned time (ADR 0001) -----------------------------------------


def _plan(owner_engine, draft_id: str, minutes_from_now: int) -> None:
    """Put an approved draft's time in the past or future, as the clock would."""
    with owner_engine.begin() as conn:
        conn.execute(
            sql(
                "UPDATE drafts SET scheduled_for = now() + make_interval(mins => :m) WHERE id = :i"
            ),
            {"m": minutes_from_now, "i": draft_id},
        )


def _connected(api) -> None:
    _start(api, _link(api))
    _added(api)


def _channel_sends(bot, chat_id: int = -100777) -> list:
    return [s for s in bot.sent if s[0] == chat_id]


def test_the_bot_posts_at_the_planned_time_exactly_once(api, bot, owner_engine):
    _connected(api)
    did = _approved_telegram_draft(api)
    _plan(owner_engine, did, -1)
    assert telegram_service.send_due(bot) == 1
    assert telegram_service.send_due(bot) == 0  # a second pass finds nothing
    assert len(_channel_sends(bot)) == 1
    assert api.get(f"{API}/drafts/{did}").json()["status"] == "published"


def test_not_before_its_time_and_not_hours_late(api, bot, owner_engine):
    _connected(api)
    soon = _approved_telegram_draft(api)
    _plan(owner_engine, soon, 5)
    late = _approved_telegram_draft(api)
    _plan(owner_engine, late, -45)  # the server was down: missed, not sent at the wrong hour
    assert telegram_service.send_due(bot) == 0
    assert _channel_sends(bot) == []
    missed = [d["id"] for d in api.get(f"{API}/me/notifications").json()["missed"]]
    assert late in missed


def test_a_refused_post_is_missed_with_its_reason_and_not_retried(api, bot, owner_engine):
    _connected(api)
    did = _approved_telegram_draft(api)
    _plan(owner_engine, did, -1)
    bot.fail = TelegramError(403, "Forbidden: bot was kicked from the channel chat")
    assert telegram_service.send_due(bot) == 0
    assert telegram_service.send_due(bot) == 0
    missed = api.get(f"{API}/me/notifications").json()["missed"]
    assert [d["id"] for d in missed] == [did]
    assert "FeteScript" in missed[0]["bot_error"]
    assert "Forbidden" not in missed[0]["bot_error"]


def test_telegram_being_down_is_tried_again_next_pass(api, bot, owner_engine):
    _connected(api)
    did = _approved_telegram_draft(api)
    _plan(owner_engine, did, -1)
    bot.fail = TelegramError(0, "Telegram can't be reached")
    assert telegram_service.send_due(bot) == 0
    bot.fail = None
    assert telegram_service.send_due(bot) == 1


def test_a_new_time_clears_a_refusal(api, bot, owner_engine):
    _connected(api)
    did = _approved_telegram_draft(api)
    _plan(owner_engine, did, -1)
    bot.fail = TelegramError(403, "Forbidden")
    telegram_service.send_due(bot)
    bot.fail = None
    api.post(f"{API}/drafts/{did}/schedule", json={"day": "2099-01-01"})
    assert api.get(f"{API}/drafts/{did}").json()["bot_error"] is None


def test_bot_drafts_are_never_due_but_hand_offs_still_are(api, bot, owner_engine):
    did = _approved_telegram_draft(api)
    _plan(owner_engine, did, 2)
    due = [d["id"] for d in api.get(f"{API}/me/notifications").json()["due"]]
    assert did in due  # no channel yet: the user hands it off
    _connected(api)
    due = [d["id"] for d in api.get(f"{API}/me/notifications").json()["due"]]
    assert did not in due  # the bot will post it


def test_drafts_that_are_not_approved_are_never_sent(api, bot, owner_engine):
    _connected(api)
    did = api.post(f"{API}/drafts/generate", json={"platform": "telegram", "topic": "t"}).json()[
        "id"
    ]
    _plan(owner_engine, did, -1)
    assert telegram_service.send_due(bot) == 0


def test_each_users_drafts_go_only_to_their_own_channel(api, bot, owner_engine, make_user):
    _connected(api)
    mine = _approved_telegram_draft(api)
    _plan(owner_engine, mine, -1)
    api.state["user"] = make_user()
    _start(api, _link(api), tg_id=602)
    _added(api, tg_id=602, chat_id=-100888)
    theirs = _approved_telegram_draft(api)
    _plan(owner_engine, theirs, -1)
    assert telegram_service.send_due(bot) == 2
    assert len(_channel_sends(bot, -100777)) == 1
    assert len(_channel_sends(bot, -100888)) == 1


def test_linking_from_another_voxlace_account_moves_the_channel_there(api, bot, make_user):
    _connected(api)
    first = api.state["user"]
    api.state["user"] = make_user()
    _start(api, _link(api))  # the same Telegram account, now signed in to a second account
    assert api.get(f"{API}/telegram").json()["channel"]["title"] == "FeteScript"
    assert "connected to this account now" in bot.sent[-1][1]
    api.state["user"] = first
    status = api.get(f"{API}/telegram").json()
    assert status["linked"] is False and status["channel"] is None
