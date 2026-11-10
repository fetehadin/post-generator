"""Guest mode (FR-47): drafting without logging in stores nothing of the guest's, is limited
per visitor and in total, and the drafts can be saved with their exact prompt after login."""

import uuid

import pytest
from sqlalchemy import text

from app.ai.client import GenerationResult
from app.core.config import get_settings
from tests.api.conftest import FakeAI

API = "/api/v1"


@pytest.fixture
def guest(api, owner_engine, monkeypatch):
    """The API client as a guest from one fresh IP address."""
    cfg = get_settings()
    monkeypatch.setattr(cfg, "guest_daily_drafts", 12)
    monkeypatch.setattr(cfg, "guest_daily_total", 1000)
    monkeypatch.setattr(cfg, "edge_secret", "edge-test-secret")
    monkeypatch.setattr(cfg, "guest_signing_key", "guest-test-key")  # CI runs as APP_ENV=test
    api.headers["X-Voxlace-Edge"] = "edge-test-secret"
    api.headers["X-Voxlace-Client-IP"] = f"203.0.113.{uuid.uuid4().int % 250}-{uuid.uuid4()}"
    yield api
    with owner_engine.begin() as conn:
        conn.execute(text("DELETE FROM guest_usage"))


def write(client, platforms=("x",), topic="Shipped the login fix today"):
    return client.post(f"{API}/guest/drafts", json={"topic": topic, "platforms": list(platforms)})


def counts(owner_engine) -> tuple[int, int, int]:
    with owner_engine.begin() as conn:
        return tuple(
            conn.execute(text(f"SELECT count(*) FROM {t}")).scalar_one()
            for t in ("drafts", "checkins", "prompt_logs")
        )


def test_a_guest_gets_one_draft_per_platform_and_nothing_is_stored(guest, owner_engine):
    before = counts(owner_engine)
    r = write(guest, ["x", "linkedin", "telegram"])
    assert r.status_code == 200
    body = r.json()
    assert [d["platform"] for d in body["drafts"]] == ["x", "linkedin", "telegram"]
    assert body["drafts"][0]["text"] == "Shipped it 🚀\n@sam"
    assert body["drafts"][0]["length"]["limit"] == 280
    assert all(d["receipt"] for d in body["drafts"])
    assert counts(owner_engine) == before  # no draft, check-in or prompt saved
    with owner_engine.begin() as conn:
        row = conn.execute(text("SELECT visitor, drafts FROM guest_usage")).one()
    assert row.drafts == 3 and "203.0.113" not in row.visitor  # only a hash of the address


def test_the_guest_prompt_uses_only_what_the_guest_wrote_and_the_shared_shapes(guest):
    seen = []

    class Spy(FakeAI):
        def generate(self, prompt, purpose="draft", temperature=0.9):
            seen.append(prompt)
            return super().generate(prompt, purpose, temperature)

    guest.state["ai"] = Spy()
    write(guest, ["telegram"], topic="Fixed the sign-up bug")
    assert "Fixed the sign-up bug" in seen[0]
    assert "Inspiration (not their voice)" in seen[0]
    assert "About the writer" not in seen[0]  # a guest has no summary card


def test_the_guest_limit_stops_before_any_ai_call(guest, monkeypatch):
    monkeypatch.setattr(get_settings(), "guest_daily_drafts", 2)
    assert write(guest, ["x", "linkedin"]).status_code == 200
    r = write(guest, ["x"])
    assert r.status_code == 429 and r.json()["error"]["code"] == "guest_limit"
    # A refused request uses nothing: another visitor still has their own allowance.
    guest.headers["X-Voxlace-Client-IP"] = "198.51.100.7"
    assert write(guest, ["x"]).status_code == 200


def test_the_daily_total_for_all_guests_holds_too(guest, monkeypatch):
    monkeypatch.setattr(get_settings(), "guest_daily_total", 1)
    assert write(guest).status_code == 200
    guest.headers["X-Voxlace-Client-IP"] = "198.51.100.8"
    assert write(guest).status_code == 429


def test_a_busy_ai_is_reported_per_platform(guest):
    guest.state["ai"] = FakeAI(fail_generate=True)
    body = write(guest, ["x", "telegram"]).json()
    assert body["drafts"] == []
    assert [f["code"] for f in body["failures"]] == ["ai_unavailable", "ai_unavailable"]


def test_a_guest_can_revise_and_gets_a_new_receipt(guest):
    first = write(guest).json()["drafts"][0]

    class Shorter(FakeAI):
        def generate(self, prompt, purpose="draft", temperature=0.9):
            return GenerationResult("Shipped.", "gemini-flash-latest", "google", "v")

    guest.state["ai"] = Shorter()
    r = guest.post(
        f"{API}/guest/revise", json={"receipt": first["receipt"], "instruction": "Shorter"}
    )
    assert r.status_code == 200
    out = r.json()
    assert out["question"] is None and out["draft"]["text"] == "Shipped."
    assert out["draft"]["receipt"] != first["receipt"]


def test_revise_asks_instead_of_inventing_a_fact(guest):
    first = write(guest).json()["drafts"][0]

    class Asks(FakeAI):
        def generate(self, prompt, purpose="draft", temperature=0.9):
            return GenerationResult("QUESTION: Which day did it ship?", "m", "google", "v")

    guest.state["ai"] = Asks()
    out = guest.post(
        f"{API}/guest/revise", json={"receipt": first["receipt"], "instruction": "Add the date"}
    ).json()
    assert out == {"draft": None, "question": "Which day did it ship?"}


def test_after_login_the_guest_drafts_become_one_chat_with_their_prompts(guest, owner_engine):
    drafts = write(guest, ["x", "telegram"]).json()["drafts"]
    r = guest.post(f"{API}/threads/claim", json={"receipts": [d["receipt"] for d in drafts]})
    assert r.status_code == 201
    thread = r.json()
    assert thread["checkin_text"] == "Shipped the login fix today"
    assert [d["platform"] for d in thread["drafts"]] == ["x", "telegram"]
    assert all(d["status"] == "draft" for d in thread["drafts"])
    draft_id = thread["drafts"][0]["id"]
    log = guest.get(f"{API}/drafts/{draft_id}/prompt").json()
    assert "Shipped the login fix today" in log["prompt"] and log["provider"] == "google"


def test_a_changed_receipt_is_refused_and_nothing_is_saved(guest, owner_engine):
    receipt = write(guest).json()["drafts"][0]["receipt"]
    body, _, mac = receipt.partition(".")
    forged = body[:-4] + ("AAAA" if body[-4:] != "AAAA" else "BBBB") + "." + mac
    before = counts(owner_engine)
    r = guest.post(f"{API}/threads/claim", json={"receipts": [receipt, forged]})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_receipt"
    assert counts(owner_engine) == before


def test_claiming_needs_a_login(guest):
    receipt = write(guest).json()["drafts"][0]["receipt"]
    guest.app.dependency_overrides.clear()  # no test user: a real, missing login
    r = guest.post(f"{API}/threads/claim", json={"receipts": [receipt]})
    assert r.status_code in (401, 403)


def test_guest_input_is_checked(guest):
    empty = guest.post(f"{API}/guest/drafts", json={"topic": "", "platforms": ["x"]})
    assert empty.status_code == 422
    assert write(guest, []).status_code == 422
    assert write(guest, ["myspace"]).status_code == 422


def test_a_made_up_ip_header_without_the_edge_secret_is_ignored(guest, monkeypatch):
    monkeypatch.setattr(get_settings(), "guest_daily_drafts", 1)
    guest.headers["X-Voxlace-Edge"] = "guessed"
    assert write(guest).status_code == 200
    # A new address each time doesn't help: without the secret, all count as one caller.
    guest.headers["X-Voxlace-Client-IP"] = "198.51.100.99"
    guest.headers["CF-Connecting-IP"] = "198.51.100.98"
    assert write(guest).status_code == 429


def test_a_receipt_with_odd_characters_is_refused_not_a_crash(guest):
    for bad in ["x.é", "nodot", "a" * 200_001, "eyJ9.00"]:
        r = guest.post(f"{API}/guest/revise", json={"receipt": bad[:200_000], "instruction": "x"})
        assert r.status_code in (400, 422), bad[:10]


def test_long_amharic_check_ins_still_fit_in_a_receipt(guest):
    topic = "ዛሬ የመግቢያውን ችግር አስተካከልኩ። " * 140  # about 3,900 characters
    first = write(guest, topic=topic[:3990]).json()["drafts"][0]
    assert len(first["receipt"]) < 200_000
    r = guest.post(
        f"{API}/guest/revise", json={"receipt": first["receipt"], "instruction": "Shorter"}
    )
    assert r.status_code == 200


def test_a_rewrite_call_counts_toward_the_guest_limit(guest, monkeypatch, owner_engine):
    class Copies(FakeAI):
        def generate(self, prompt, purpose="draft", temperature=0.9):
            return GenerationResult("We shipped 999 new things today", "m", "google", "v")

    guest.state["ai"] = Copies()  # 999 isn't in the topic: an invented number, so a rewrite
    write(guest)
    with owner_engine.begin() as conn:
        assert conn.execute(text("SELECT drafts FROM guest_usage")).scalar_one() == 2


def test_saving_the_same_drafts_twice_returns_the_first_chat(guest, owner_engine):
    receipts = [d["receipt"] for d in write(guest, ["x", "telegram"]).json()["drafts"]]
    first = guest.post(f"{API}/threads/claim", json={"receipts": receipts})
    before = counts(owner_engine)
    again = guest.post(f"{API}/threads/claim", json={"receipts": receipts})
    assert again.status_code == 201 and again.json()["id"] == first.json()["id"]
    assert counts(owner_engine) == before  # the lost-answer retry made no second copy


def test_a_receipt_saved_in_one_account_cant_be_saved_in_another(guest, make_user):
    receipt = write(guest).json()["drafts"][0]["receipt"]
    assert guest.post(f"{API}/threads/claim", json={"receipts": [receipt]}).status_code == 201
    guest.state["user"] = make_user()
    r = guest.post(f"{API}/threads/claim", json={"receipts": [receipt]})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_receipt"


def test_saving_guest_drafts_respects_the_accounts_daily_limit(guest, monkeypatch):
    receipt = write(guest).json()["drafts"][0]["receipt"]
    monkeypatch.setattr(get_settings(), "daily_draft_limit", 0)
    r = guest.post(f"{API}/threads/claim", json={"receipts": [receipt]})
    assert r.status_code == 429 and r.json()["error"]["code"] == "daily_limit"


def test_one_ipv6_block_counts_as_one_visitor(guest, monkeypatch):
    monkeypatch.setattr(get_settings(), "guest_daily_drafts", 1)
    guest.headers["X-Voxlace-Client-IP"] = "2001:db8:1:2::1"
    assert write(guest).status_code == 200
    guest.headers["X-Voxlace-Client-IP"] = "2001:db8:1:2:ffff::9"  # same /64
    assert write(guest).status_code == 429
    guest.headers["X-Voxlace-Client-IP"] = "2001:db8:1:3::1"  # another home
    assert write(guest).status_code == 200
