"""Uploads over HTTP: resume and portfolio text, review, isolation, and the summary card
(FR-20, FR-21, FR-29, FR-37, FR-38)."""

import pytest

from app.services import uploads
from tests.api.test_profile import RecordingAI
from tests.test_uploads import make_docx

RESUME = make_docx(
    "Sara Tesfaye", "sara@example.com · +251 91 123 4567", "Backend developer at Gebeta"
)


def send_resume(api, data=RESUME, name="cv.docx"):
    return api.post("/api/v1/uploads/resume", files={"file": (name, data)})


def test_a_resume_is_saved_without_contacts(api):
    r = send_resume(api)
    assert r.status_code == 201
    body = r.json()
    assert body["kind"] == "resume" and body["source"] == "cv.docx"
    assert "Backend developer at Gebeta" in body["text"]
    assert "@" not in body["text"] and "4567" not in body["text"]
    assert body["removed"] == {"emails": 1, "phones": 1}
    assert body["reviewed"] is False
    assert api.get("/api/v1/uploads").json()["items"][0]["id"] == body["id"]


def test_a_wrong_file_is_refused_and_nothing_is_saved(api):
    r = send_resume(api, b"hello", "cv.txt")
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_file"
    assert api.get("/api/v1/uploads").json()["items"] == []


def test_uploads_wait_for_the_privacy_notice(api, make_user):
    api.state["user"] = make_user(privacy_accepted=False)
    r = send_resume(api)
    assert r.status_code == 403 and r.json()["error"]["code"] == "privacy_required"
    r = api.post("/api/v1/uploads/portfolio", json={"url": "https://me.dev"})
    assert r.status_code == 403


def test_a_private_portfolio_address_is_refused(api):
    r = api.post("/api/v1/uploads/portfolio", json={"url": "http://localhost:8000/"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_url"


def test_a_portfolio_page_is_saved_as_text(api, monkeypatch):
    monkeypatch.setattr(uploads, "fetch_page", lambda url: "I'm Sara.\nMail me: s@x.io")
    r = api.post("/api/v1/uploads/portfolio", json={"url": " https://me.dev "})
    assert r.status_code == 201
    assert (r.json()["source"], r.json()["text"]) == ("https://me.dev", "I'm Sara.\nMail me:")


def test_edited_text_is_cleaned_again_and_counts_add_up(api):
    uid = send_resume(api).json()["id"]
    r = api.patch(f"/api/v1/uploads/{uid}", json={"text": "Backend dev. Call +1 555 123 4567"})
    assert r.json()["text"] == "Backend dev. Call"
    assert r.json()["removed"] == {"emails": 1, "phones": 2}
    r = api.patch(f"/api/v1/uploads/{uid}", json={"text": "   "})
    assert r.status_code == 400 and r.json()["error"]["code"] == "missing_text"


def test_another_user_cant_see_edit_or_delete_an_upload(api, make_user):
    uid = send_resume(api).json()["id"]
    owner = api.state["user"]
    api.state["user"] = make_user()
    assert api.get("/api/v1/uploads").json()["items"] == []
    assert api.patch(f"/api/v1/uploads/{uid}", json={"reviewed": True}).status_code == 404
    assert api.delete(f"/api/v1/uploads/{uid}").status_code == 404
    api.state["user"] = owner
    assert api.get("/api/v1/uploads").json()["items"][0]["reviewed"] is False


def test_delete_removes_an_upload(api):
    uid = send_resume(api).json()["id"]
    assert api.delete(f"/api/v1/uploads/{uid}").status_code == 204
    assert api.get("/api/v1/uploads").json()["items"] == []


@pytest.fixture
def ai(api):
    api.state["ai"] = RecordingAI()
    return api.state["ai"]


def summary_prompt(ai):
    return [p for purpose, p in ai.prompts if purpose == "summary"][-1]


def test_only_reviewed_text_reaches_the_summary_prompt(api, ai):
    uid = send_resume(api).json()["id"]
    api.post("/api/v1/profile/summary")
    assert "Gebeta" not in summary_prompt(ai)  # not reviewed yet (FR-21)

    api.patch(f"/api/v1/uploads/{uid}", json={"reviewed": True})
    api.post("/api/v1/profile/summary")
    prompt = summary_prompt(ai)
    assert "Backend developer at Gebeta" in prompt
    assert "sara@example.com" not in prompt and "4567" not in prompt


def test_new_profile_fields_and_projects_reach_the_summary(api, ai):
    r = api.put(
        "/api/v1/profile",
        json={
            "seniority": "Mid-level",
            "facts": "40 beta users",
            "projects": [{"name": " Voxlace ", "line": "posts in your voice", "status": "live"}],
        },
    )
    assert r.status_code == 200
    assert r.json()["projects"] == [
        {"name": "Voxlace", "line": "posts in your voice", "link": "", "status": "live"}
    ]
    api.post("/api/v1/profile/summary")
    prompt = summary_prompt(ai)
    assert "Seniority: Mid-level" in prompt and "40 beta users" in prompt
    assert "Project: Voxlace (posts in your voice, live)" in prompt


def test_a_project_needs_a_name(api):
    r = api.put("/api/v1/profile", json={"projects": [{"name": "  "}]})
    assert r.status_code == 422


def test_export_has_uploads(api):
    send_resume(api)
    data = api.get("/api/v1/me/export").json()
    assert data["uploads"][0]["kind"] == "resume"
    assert "Gebeta" in data["uploads"][0]["text"]
