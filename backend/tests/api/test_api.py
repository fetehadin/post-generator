"""The HTTP API end to end: real database, fake AI, a fresh test user per test."""

import uuid
from pathlib import Path

from tests.api.conftest import FakeAI

SAMPLES = Path(__file__).resolve().parents[3] / "samples"
DIMS = 768


def upload(api, name="telegram/result.json", platform="telegram"):
    data = (SAMPLES / name).read_bytes()
    return api.post(
        "/api/v1/imports", data={"platform": platform}, files={"file": ("result.json", data)}
    )


def test_health(api):
    assert api.get("/api/v1/health").json() == {"api": "ok", "db": "ok"}


def test_import_then_progress_reaches_done(api):
    r = upload(api)
    assert r.status_code == 201
    body = r.json()
    assert (body["platform"], body["parsed"], body["status"]) == ("telegram", 5, "embedding")
    assert body["skipped"] == {"service": 1, "empty": 1, "forwarded": 1}
    # TestClient runs background tasks before returning, so embedding has finished.
    done = api.get(f"/api/v1/imports/{body['id']}").json()
    assert (done["status"], done["embedded"], done["waiting"]) == ("done", 5, 0)


def test_reimport_reports_already_imported(api):
    upload(api)
    body = upload(api).json()
    assert body["skipped"]["already_imported"] == 5


def test_broken_file_is_rejected_and_nothing_saved(api):
    r = upload(api, "broken/telegram_truncated.json")
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_file"
    assert "Telegram" in r.json()["error"]["message"]
    assert api.get("/api/v1/posts").json()["items"] == []


def test_an_unknown_platform_is_refused(api):
    r = upload(api, platform="mastodon")
    assert (r.status_code, r.json()["error"]["code"]) == (400, "unsupported_platform")


def test_linkedin_shares_csv_imports(api):
    r = upload(api, name="linkedin/Shares.csv", platform="linkedin")
    assert r.status_code == 201, r.text
    assert (r.json()["parsed"], r.json()["skipped"]) == (3, {"repost": 1})
    assert len(api.get("/api/v1/posts?platform=linkedin").json()["items"]) == 3


def x_archive() -> bytes:
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name in ("tweets.js", "note-tweet.js", "account.js"):
            z.writestr(f"data/{name}", (SAMPLES / "x" / name).read_bytes())
    return buf.getvalue()


def test_an_x_archive_imports_with_threads_long_posts_and_a_premium_hint(api):
    r = api.post(
        "/api/v1/imports",
        data={"platform": "x"},
        files={"file": ("twitter-archive.zip", x_archive())},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["platform"], body["parsed"]) == ("x", 7)
    assert body["skipped"] == {"reply": 1, "repost": 1}
    assert isinstance(body["premium_hint"], bool)  # the sample's long post is from Aug 2026

    posts = api.get("/api/v1/posts?platform=x").json()["items"]
    assert len(posts) == 7 and all("t.co/" not in p["text"] for p in posts)
    assert api.get("/api/v1/posts?platform=telegram").json()["items"] == []


def test_an_x_upload_that_isnt_an_archive_is_refused(api):
    r = api.post(
        "/api/v1/imports", data={"platform": "x"}, files={"file": ("result.json", b'{"name": "x"}')}
    )
    assert (r.status_code, r.json()["error"]["code"]) == (400, "invalid_file")


def test_posts_paging(api):
    upload(api)
    seen, cursor = [], None
    for _ in range(5):
        page = api.get(
            "/api/v1/posts", params={"limit": 2, **({"cursor": cursor} if cursor else {})}
        ).json()
        seen += [p["posted_at"] for p in page["items"]]
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert len(seen) == 5 and seen == sorted(seen, reverse=True)
    assert (
        api.get("/api/v1/posts", params={"cursor": "nonsense"}).json()["error"]["code"]
        == "invalid_cursor"
    )


def test_generate_and_read_the_prompt(api):
    upload(api)
    r = api.post(
        "/api/v1/drafts/generate", json={"platform": "telegram", "topic": "Shipped the parser"}
    )
    assert r.status_code == 201
    d = r.json()
    assert d["text"] == "Shipped it 🚀\n@sam" and d["status"] == "draft"
    assert d["length"] == {"count": len(d["text"]), "limit": 4096, "over": False}
    assert d["model"] == "gemini-3.8-flash" and d["examples_used"] == 5
    p = api.get(f"/api/v1/drafts/{d['id']}/prompt").json()
    assert "Shipped the parser" in p["prompt"] and p["provider"] == "google"


def test_generate_errors_use_the_shared_shape(api, monkeypatch):
    monkeypatch.setattr("app.services.drafting.inspiration", lambda *_: [])
    r = api.post("/api/v1/drafts/generate", json={"platform": "telegram", "topic": "x"})
    assert (r.status_code, r.json()["error"]["code"]) == (400, "no_posts")
    r = api.post("/api/v1/drafts/generate", json={"platform": "telegram", "topic": "   "})
    assert r.json()["error"]["code"] == "missing_topic"
    r = api.post("/api/v1/drafts/generate", json={"platform": "myspace"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    fields = {f["field"] for f in r.json()["error"]["fields"]}
    assert fields == {"platform"}  # topic is optional: empty = from the summary card


def test_ai_down_gives_503_and_a_clear_message(api):
    upload(api)
    api.state["ai"] = FakeAI(fail_generate=True)
    r = api.post("/api/v1/drafts/generate", json={"platform": "telegram", "topic": "topic"})
    assert (r.status_code, r.json()["error"]["code"]) == (503, "ai_unavailable")


def test_another_users_data_is_not_found(api, make_user):
    upload(api)
    d = api.post("/api/v1/drafts/generate", json={"platform": "telegram", "topic": "t"}).json()
    imports = api.get("/api/v1/posts").json()["items"]
    assert imports
    api.state["user"] = make_user()  # now someone else
    assert api.get(f"/api/v1/drafts/{d['id']}/prompt").status_code == 404
    assert api.get("/api/v1/posts").json()["items"] == []
    assert api.get(f"/api/v1/imports/{uuid.uuid4()}").json()["error"]["code"] == "not_found"


def test_unknown_route_uses_the_shared_shape(api):
    r = api.get("/api/v1/nope")
    assert r.status_code == 404 and r.json() == {
        "error": {"code": "not_found", "message": "Not found."}
    }


# ---- pin and exclude (FR-25)


def first_post(api):
    return api.get("/api/v1/posts").json()["items"][0]


def test_pin_and_exclude_clear_each_other(api):
    upload(api)
    post = first_post(api)
    pinned = api.patch(f"/api/v1/posts/{post['id']}", json={"pinned": True}).json()
    assert (pinned["pinned"], pinned["excluded"]) == (True, False)
    excluded = api.patch(f"/api/v1/posts/{post['id']}", json={"excluded": True}).json()
    assert (excluded["pinned"], excluded["excluded"]) == (False, True)
    assert [p["id"] for p in api.get("/api/v1/posts?show=excluded").json()["items"]] == [post["id"]]
    assert api.get("/api/v1/posts?show=pinned").json()["items"] == []


def test_another_users_post_cannot_be_pinned(api, make_user):
    upload(api)
    post = first_post(api)
    api.state["user"] = make_user()
    r = api.patch(f"/api/v1/posts/{post['id']}", json={"pinned": True})
    assert r.status_code == 404


def test_search_matches_words_and_treats_wildcards_literally(api):
    upload(api)
    all_posts = api.get("/api/v1/posts").json()["items"]
    word = all_posts[0]["text"].split()[1]
    found = api.get(f"/api/v1/posts?q={word}").json()["items"]
    assert found and all(word.lower() in p["text"].lower() for p in found)
    assert api.get("/api/v1/posts?q=%25").json()["items"] == []  # a literal %, not "anything"


def test_a_pinned_post_is_always_an_example_and_an_excluded_one_never(api):
    upload(api)
    posts = api.get("/api/v1/posts").json()["items"]
    keep, drop = posts[0], posts[1]
    api.patch(f"/api/v1/posts/{keep['id']}", json={"pinned": True})
    api.patch(f"/api/v1/posts/{drop['id']}", json={"excluded": True})
    draft = api.post("/api/v1/drafts/generate", json={"platform": "telegram", "topic": "ship"})
    prompt = api.get(f"/api/v1/drafts/{draft.json()['id']}/prompt").json()["prompt"]
    assert keep["text"] in prompt
    assert drop["text"] not in prompt
