"""Pictures on a draft (FR-58, ADR 0002): checked and re-encoded on upload, private to their
owner, posted by the bot in one message, and deleted once the draft is Posted or discarded."""

import io

import pytest
from PIL import Image

from app.core.config import get_settings
from app.services import pictures as pictures_service
from tests.api.test_telegram import SECRET as TELEGRAM_SECRET
from tests.api.test_telegram import (
    FakeTelegram,
    _added,
    _approved_telegram_draft,
    _link,
    _start,
)

API = "/api/v1"


def picture(kind: str = "JPEG", size=(64, 48), mode: str = "RGB", exif: bool = False) -> bytes:
    img = Image.new(mode, size, (200, 30, 30) if mode == "RGB" else (200, 30, 30, 120))
    out = io.BytesIO()
    extra = {}
    if exif:
        tags = Image.Exif()
        tags[0x010F] = "SpyCam"  # camera make
        tags[0x8825] = {1: "N", 2: (9.0, 1.0, 2.0)}  # GPS: latitude
        extra["exif"] = tags.tobytes()
    img.save(out, kind, **extra)
    return out.getvalue()


@pytest.fixture(autouse=True)
def folder(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "pictures_dir", str(tmp_path))
    monkeypatch.setattr(pictures_service, "FRESH_SECONDS", -1)  # prune at once in tests
    return tmp_path


@pytest.fixture
def agreed(api):
    assert api.post(f"{API}/me/privacy-accept").status_code in (200, 204)
    return api


def _draft(api, platform: str = "x") -> str:
    r = api.post(f"{API}/drafts/generate", json={"platform": platform, "topic": "ship"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _add(api, did: str, data: bytes, name: str = "p.jpg"):
    return api.post(f"{API}/drafts/{did}/pictures", files={"file": (name, data)})


def _files(folder) -> list:
    return [f for f in folder.rglob("*") if f.is_file()]


def test_a_picture_is_added_without_its_hidden_data(agreed, folder):
    did = _draft(agreed)
    r = _add(agreed, did, picture(exif=True))
    assert r.status_code == 201, r.text
    [pic] = r.json()["pictures"]
    assert (pic["content_type"], pic["width"], pic["height"]) == ("image/jpeg", 64, 48)

    got = agreed.get(f"{API}{pic['url']}")
    assert got.status_code == 200
    assert got.headers["content-type"] == "image/jpeg"
    assert b"SpyCam" not in got.content
    assert not Image.open(io.BytesIO(got.content)).getexif()
    assert agreed.get(f"{API}/drafts/{did}").json()["pictures"][0]["id"] == pic["id"]


def test_png_stays_png_and_webp_becomes_jpeg(agreed):
    did = _draft(agreed)
    r = _add(agreed, did, picture("PNG", mode="RGBA"), "shot.png")
    assert r.json()["pictures"][0]["content_type"] == "image/png"
    r = _add(agreed, did, picture("WEBP"), "photo.webp")
    assert r.json()["pictures"][1]["content_type"] == "image/jpeg"


def test_anything_else_is_refused_with_a_plain_reason(agreed, folder):
    did = _draft(agreed)
    assert _add(agreed, did, b"%PDF-1.7 not a picture", "cv.jpg").json()["error"]["code"] == (
        "not_a_picture"
    )
    assert _add(agreed, did, picture("GIF"), "a.gif").status_code == 415
    big = _add(agreed, did, b"\xff" * (pictures_service.MAX_BYTES + 1))
    assert big.status_code == 413
    assert _files(folder) == []


def test_at_most_four_pictures(agreed):
    did = _draft(agreed)
    for _ in range(4):
        assert _add(agreed, did, picture()).status_code == 201
    r = _add(agreed, did, picture())
    assert (r.status_code, r.json()["error"]["code"]) == (409, "too_many_pictures")


def test_privacy_notice_comes_first(api, make_user):
    did = _draft(api)
    api.state["user"] = make_user(privacy_accepted=False)
    r = _add(api, did, picture())
    assert (r.status_code, r.json()["error"]["code"]) == (403, "privacy_required")


def test_reorder_and_remove(agreed, folder):
    did = _draft(agreed)
    a = _add(agreed, did, picture()).json()["pictures"][0]["id"]
    b = _add(agreed, did, picture("PNG"), "b.png").json()["pictures"][1]["id"]
    r = agreed.put(f"{API}/drafts/{did}/pictures/order", json={"ids": [b, a]})
    assert [p["id"] for p in r.json()["pictures"]] == [b, a]
    bad = agreed.put(f"{API}/drafts/{did}/pictures/order", json={"ids": [a]})
    assert bad.json()["error"]["code"] == "wrong_pictures"

    assert agreed.delete(f"{API}/drafts/{did}/pictures/{b}").status_code == 204
    left = agreed.get(f"{API}/drafts/{did}").json()["pictures"]
    assert [(p["id"], p["position"]) for p in left] == [(a, 0)]
    assert len(_files(folder)) == 1


def test_another_user_can_never_see_or_change_them(agreed, make_user):
    did = _draft(agreed)
    pic = _add(agreed, did, picture()).json()["pictures"][0]
    owner = agreed.state["user"]

    agreed.state["user"] = make_user()
    agreed.post(f"{API}/me/privacy-accept")
    assert agreed.get(f"{API}{pic['url']}").status_code == 404
    assert _add(agreed, did, picture()).status_code == 404
    assert agreed.delete(f"{API}{pic['url']}").status_code == 404

    agreed.state["user"] = owner
    assert agreed.get(f"{API}{pic['url']}").status_code == 200


def test_posted_or_discarded_drafts_keep_no_pictures(agreed, folder):
    posted, thrown = _draft(agreed), _draft(agreed)
    for did in (posted, thrown):
        _add(agreed, did, picture())
    assert len(_files(folder)) == 2

    agreed.patch(f"{API}/drafts/{posted}", json={"status": "approved"})
    r = agreed.patch(f"{API}/drafts/{posted}", json={"status": "published"})
    assert r.status_code == 200 and r.json()["pictures"] == []
    r = agreed.patch(f"{API}/drafts/{thrown}", json={"status": "discarded"})
    assert r.json()["pictures"] == []
    assert _files(folder) == []
    assert _add(agreed, posted, picture()).json()["error"]["code"] == "not_editable"


def test_deleting_the_account_deletes_the_files(agreed, folder):
    _add(agreed, _draft(agreed), picture())
    r = agreed.request("DELETE", f"{API}/me", json={"confirm": "delete"})
    assert r.status_code == 204
    assert _files(folder) == []


def test_a_telegram_caption_is_limited_to_1024_characters(agreed):
    did = _draft(agreed, "telegram")
    agreed.patch(f"{API}/drafts/{did}", json={"text": "a" * 1100})
    assert agreed.get(f"{API}/drafts/{did}").json()["length"]["limit"] == 4096
    r = _add(agreed, did, picture())
    assert r.json()["length"] == {"count": 1100, "limit": 1024, "over": True}
    refused = agreed.patch(f"{API}/drafts/{did}", json={"status": "approved"})
    assert refused.json()["error"]["code"] == "over_limit"


class PhotoTelegram(FakeTelegram):
    def __init__(self) -> None:
        super().__init__()
        self.albums: list[tuple[int, str, list]] = []

    def send_photos(self, chat_id, caption, photos) -> int:
        self.albums.append((chat_id, caption, [t for _, t in photos]))
        return 1


@pytest.fixture
def photo_bot(api, monkeypatch):
    from app.api.telegram import get_telegram

    cfg = get_settings()
    monkeypatch.setattr(cfg, "telegram_bot_token", "123:fake")
    monkeypatch.setattr(cfg, "telegram_bot_username", "VoxlaceBot")
    monkeypatch.setattr(cfg, "telegram_webhook_secret", TELEGRAM_SECRET)
    fake = PhotoTelegram()
    api.app.dependency_overrides[get_telegram] = lambda: fake
    return fake


def test_the_bot_posts_text_and_pictures_as_one_message_then_deletes_them(
    agreed, photo_bot, folder
):
    _start(agreed, _link(agreed))
    _added(agreed)
    did = _approved_telegram_draft(agreed)
    _add(agreed, did, picture())
    _add(agreed, did, picture("PNG"), "b.png")
    text = agreed.get(f"{API}/drafts/{did}").json()["text"]

    r = agreed.post(f"{API}/drafts/{did}/publish")
    assert r.status_code == 200, r.text
    assert photo_bot.albums == [(-100777, text, ["image/jpeg", "image/png"])]
    assert [s for s in photo_bot.sent if s[0] < 0] == []  # no separate text message
    assert r.json()["pictures"] == [] and _files(folder) == []
