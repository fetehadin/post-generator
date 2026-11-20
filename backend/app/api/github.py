"""GitHub → daily dev drafts (FR-14): connect, private repos, per-repo mention, frequency,
digests, "post anyway", disconnect, and the signed webhook for the GitHub App."""

import json
import threading
import uuid

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse

from app.api.deps import get_ai
from app.core.auth import current_user
from app.core.config import get_settings
from app.core.errors import AppError, error_body
from app.schemas import (
    GitHubCallbackIn,
    GitHubDigestOut,
    GitHubInstallationIn,
    GitHubLinkOut,
    GitHubOut,
    GitHubRepoIn,
    GitHubRepoOut,
    GitHubSettingsIn,
)
from app.services import github
from app.services.github_api import GitHubAPI

router = APIRouter(prefix="/github", tags=["github"])
webhooks = APIRouter(tags=["github"])


def get_github() -> GitHubAPI:
    return GitHubAPI()


def _fail(e: github.GitHubFlowError) -> AppError:
    return AppError(e.code, e.message, e.status)


def _out(user_id: uuid.UUID) -> GitHubOut:
    st = github.status(user_id)
    cfg = get_settings()
    return GitHubOut(
        enabled=cfg.github_enabled,
        private_enabled=cfg.github_app_enabled,
        connected=st.connected,
        login=st.login,
        private_repos=st.private_repos,
        frequency=st.frequency,
        repos=[
            GitHubRepoOut(
                id=r.id, full_name=r.full_name, private=r.private, mention_ok=r.mention_ok
            )
            for r in st.repos
        ],
        digests=[
            GitHubDigestOut(
                id=d.id,
                day=d.day,
                kind=d.kind,
                status=d.status,
                score=d.score,
                reason=d.reason,
                angle=d.angle,
                thread_id=d.thread_id,
                based_on=lines,
            )
            for d, lines in st.digests
        ],
    )


@router.get("", response_model=GitHubOut)
def get_github_status(user_id=Depends(current_user)) -> GitHubOut:
    return _out(user_id)


@router.post("/connect", response_model=GitHubLinkOut)
def start_connect(user_id=Depends(current_user)) -> GitHubLinkOut:
    try:
        return GitHubLinkOut(url=github.connect_url(user_id))
    except github.GitHubFlowError as e:
        raise _fail(e) from e


@router.post("/callback", response_model=GitHubOut)
def finish_connect(
    body: GitHubCallbackIn, user_id=Depends(current_user), api: GitHubAPI = Depends(get_github)
) -> GitHubOut:
    try:
        github.finish_connect(user_id, body.code, body.state, api)
    except github.GitHubFlowError as e:
        raise _fail(e) from e
    return _out(user_id)


@router.post("/install", response_model=GitHubLinkOut)
def start_install(user_id=Depends(current_user)) -> GitHubLinkOut:
    try:
        return GitHubLinkOut(url=github.install_url(user_id))
    except github.GitHubFlowError as e:
        raise _fail(e) from e


@router.post("/installation", response_model=GitHubOut)
def finish_install(
    body: GitHubInstallationIn,
    user_id=Depends(current_user),
    api: GitHubAPI = Depends(get_github),
) -> GitHubOut:
    try:
        github.finish_install(user_id, body.installation_id, body.state, api)
    except github.GitHubFlowError as e:
        raise _fail(e) from e
    return _out(user_id)


@router.patch("/repos/{repo_id}", response_model=GitHubOut)
def set_mention(repo_id: uuid.UUID, body: GitHubRepoIn, user_id=Depends(current_user)):
    if not github.set_mention(user_id, repo_id, body.mention_ok):
        raise AppError("not_found", "Not found.", 404)
    return _out(user_id)


@router.put("/settings", response_model=GitHubOut)
def set_settings(body: GitHubSettingsIn, user_id=Depends(current_user)) -> GitHubOut:
    try:
        github.set_frequency(user_id, body.frequency)
    except github.GitHubFlowError as e:
        raise _fail(e) from e
    return _out(user_id)


@router.post("/digests/{digest_id}/draft", response_model=GitHubOut)
def post_anyway(digest_id: uuid.UUID, user_id=Depends(current_user), ai=Depends(get_ai)):
    try:
        github.post_anyway(user_id, digest_id, ai)
    except github.GitHubFlowError as e:
        raise _fail(e) from e
    return _out(user_id)


@router.delete("", status_code=204)
def disconnect(user_id=Depends(current_user)) -> Response:
    if not github.disconnect(user_id):
        raise AppError("not_connected", "GitHub isn't connected.", 404)
    return Response(status_code=204)


@webhooks.post("/webhooks/github", status_code=202)
async def webhook(request: Request) -> Response:
    """The GitHub App's events. Checked by signature (no login), answered at once, stored in
    the background so GitHub never waits."""
    body = await request.body()
    if not github.verify_signature(body, request.headers.get("X-Hub-Signature-256")):
        return JSONResponse(error_body("bad_signature", "Signature doesn't match."), 401)
    event = request.headers.get("X-GitHub-Event", "")
    try:
        payload = json.loads(body)
    except ValueError:
        return JSONResponse(error_body("bad_payload", "Not JSON."), 400)
    if event in ("push", "pull_request", "release", "installation"):
        threading.Thread(target=github.handle_webhook, args=(event, payload), daemon=True).start()
    return Response(status_code=202)
