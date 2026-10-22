"""Audience settings, best hours and approve-with-a-day (FR-16, FR-33, FR-45), over the API."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from tests.api.test_api import upload, x_archive

API = "/api/v1"
ADDIS = ZoneInfo("Africa/Addis_Ababa")


def in_three_days() -> date:
    return datetime.now(ADDIS).date() + timedelta(days=3)


def new_draft(api, platform="telegram") -> str:
    r = api.post(f"{API}/drafts/generate", json={"platform": platform, "topic": "shipped"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def setup_user(api):
    api.patch(f"{API}/me", json={"timezone": "Africa/Addis_Ababa"})
    upload(api)


def test_audience_places_profession_and_channel_are_saved(api):
    r = api.put(
        f"{API}/platforms/telegram/settings",
        json={
            "audience_places": [
                {"timezone": "Africa/Addis_Ababa", "share": 70},
                {"timezone": "Europe/Berlin", "share": 30},
            ],
            "audience_profession": "developers",
            "goal": " grow my channel ",
            "posts_per_week": 4,
            "channel": "https://t.me/fetescript",
        },
    )
    assert r.status_code == 200, r.text
    body = api.get(f"{API}/platforms/telegram").json()
    assert body["audience_places"][1] == {"timezone": "Europe/Berlin", "share": 30}
    assert (body["audience_profession"], body["goal"], body["posts_per_week"]) == (
        "developers",
        "grow my channel",
        4,
    )
    assert body["channel"] == "fetescript"


def test_bad_settings_are_refused_with_a_reason(api):
    url = f"{API}/platforms/telegram/settings"
    place = {"timezone": "Mars/Base", "share": 50}
    assert api.put(url, json={"audience_places": [place]}).json()["error"]["code"] == (
        "invalid_timezone"
    )
    twice = [{"timezone": "Europe/Berlin", "share": 50}] * 2
    assert api.put(url, json={"audience_places": twice}).status_code == 400
    assert api.put(url, json={"channel": "no spaces!"}).json()["error"]["code"] == "invalid_channel"
    assert api.put(f"{API}/platforms/x/settings", json={"channel": "abcde"}).status_code == 400
    assert api.put(url, json={"x_premium": True}).status_code == 400
    four = [
        {"timezone": z, "share": 25} for z in ("UTC", "Europe/Berlin", "Asia/Tokyo", "Asia/Dubai")
    ]
    assert api.put(url, json={"audience_places": four}).status_code == 422


def test_best_hours_follow_the_audience_and_stay_inside_the_posting_window(api):
    setup_user(api)
    day = in_three_days()
    url = f"{API}/platforms/linkedin/best-hours?start={day}&days=2"
    home = api.get(url).json()
    assert (home["timezone"], home["source"], len(home["days"])) == (
        "Africa/Addis_Ababa",
        "studies",
        2,
    )
    first = home["days"][0]
    assert len(first["scores"]) == 24 and max(first["scores"]) == 1.0
    assert all(8 <= h < 22 for h in first["best"])
    # Move the whole audience to New York: the best hours shift later in the user's day.
    api.put(
        f"{API}/platforms/linkedin/settings",
        json={"audience_places": [{"timezone": "America/New_York", "share": 100}]},
    )
    away = api.get(url).json()["days"][0]
    assert away["best"][0] != first["best"][0]
    api.put(f"{API}/profile", json={"post_window_start": "06:00", "post_window_end": "10:00"})
    narrow = api.get(url).json()["days"][0]
    assert all(6 <= h < 10 for h in narrow["best"])


def test_approve_with_a_day_picks_the_best_then_the_next_best_hour(api):
    setup_user(api)
    files = {"file": ("twitter-archive.zip", x_archive())}
    api.post(f"{API}/imports", data={"platform": "x"}, files=files)
    day = in_three_days()
    first, second = new_draft(api, "x"), new_draft(api, "x")
    a = api.post(f"{API}/drafts/{first}/schedule", json={"day": day.isoformat()})
    assert a.status_code == 200, a.text
    a = a.json()
    assert a["draft"]["status"] == "approved" and a["rank"] == 1
    assert "your audience is in Addis Ababa" in a["reason"]
    b = api.post(f"{API}/drafts/{second}/schedule", json={"day": day.isoformat()}).json()
    assert b["rank"] == 2
    t1 = datetime.fromisoformat(a["scheduled_for"])
    t2 = datetime.fromisoformat(b["scheduled_for"])
    assert abs(t2 - t1) >= timedelta(hours=2)
    assert t1.astimezone(ADDIS).date() == t2.astimezone(ADDIS).date() == day
    best = api.get(f"{API}/platforms/x/best-hours?start={day}&days=1").json()["days"][0]["best"]
    assert t1.astimezone(ADDIS).hour == best[0]


def test_the_user_can_pick_the_time_instead(api):
    setup_user(api)
    day = in_three_days()
    chosen = datetime.combine(day, datetime.min.time(), ADDIS).replace(hour=13, minute=30)
    d = new_draft(api)
    r = api.post(
        f"{API}/drafts/{d}/schedule", json={"day": day.isoformat(), "at": chosen.isoformat()}
    ).json()
    assert datetime.fromisoformat(r["scheduled_for"]) == chosen
    assert r["reason"] == "You picked this time."


def test_a_second_linkedin_post_that_day_comes_with_a_warning(api):
    setup_user(api)
    upload(api, name="linkedin/Shares.csv", platform="linkedin")
    day = in_three_days().isoformat()
    first = api.post(f"{API}/drafts/{new_draft(api, 'linkedin')}/schedule", json={"day": day})
    assert first.json()["warning"] is None
    second = api.post(f"{API}/drafts/{new_draft(api, 'linkedin')}/schedule", json={"day": day})
    assert "second post" in second.json()["warning"]


def test_a_day_with_no_time_left_is_refused(api):
    setup_user(api)
    yesterday = (datetime.now(ADDIS).date() - timedelta(days=1)).isoformat()
    r = api.post(f"{API}/drafts/{new_draft(api)}/schedule", json={"day": yesterday})
    assert r.status_code == 400 and r.json()["error"]["code"] == "no_time_left"


def test_an_over_limit_draft_still_cant_be_approved(api):
    setup_user(api)
    d = new_draft(api, "telegram")
    api.patch(f"{API}/drafts/{d}", json={"text": "a" * 5000})
    r = api.post(f"{API}/drafts/{d}/schedule", json={"day": in_three_days().isoformat()})
    assert r.status_code == 409 and r.json()["error"]["code"] == "over_limit"


def test_posting_hours_need_a_start_and_a_different_end(api):
    r = api.put(f"{API}/profile", json={"post_window_start": "09:00", "post_window_end": "09:00"})
    assert r.status_code == 400
    ok = api.put(f"{API}/profile", json={"post_window_start": "20:00", "post_window_end": "02:00"})
    assert ok.json()["post_window_start"] == "20:00:00"
