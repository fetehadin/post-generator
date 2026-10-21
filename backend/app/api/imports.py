"""Uploading an export (FR-1, FR-3, FR-39) and following its progress.

The file is read in memory, parsed, and never stored (NFR-11). Embedding runs after the
response as a background task; if the server restarts, the queue is still in the
database and GET /imports/{id} starts it again (OPEN_QUESTIONS Q6).
"""

import logging
import threading
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from sqlalchemy import func, select

from app.ai.client import AIClient
from app.api.deps import get_ai
from app.core.auth import current_user
from app.core.db import user_session
from app.core.errors import AppError
from app.importers.common import ImportFormatError
from app.importers.linkedin import parse_linkedin
from app.importers.telegram import parse_telegram
from app.importers.x import parse_x
from app.models import Import, SourcePost, User
from app.schemas import ImportOut
from app.services.embedding import embed_pending
from app.services.posts import save_posts
from app.services.profile import excluded_hashtags

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/imports", tags=["imports"])

# One parser per platform. Each reads only the posts from its export (FR-39).
PARSERS = {"telegram": parse_telegram, "x": parse_x, "linkedin": parse_linkedin}
MAX_UPLOAD_BYTES = 64 * 1024 * 1024  # the largest real channel export so far is 41 MB
_running: set[uuid.UUID] = set()
_running_lock = threading.Lock()


def embed_in_background(user_id: uuid.UUID, ai: AIClient) -> None:
    """Embed everything waiting for this user, best posts first. One run per user at a time."""
    with _running_lock:
        if user_id in _running:
            return
        _running.add(user_id)
    try:
        while True:
            report = embed_pending(user_id, ai=ai)
            if report.stopped_reason or report.remaining == 0 or report.embedded == 0:
                if report.stopped_reason:
                    logger.info("embedding paused for a user: %s", report.stopped_reason[:80])
                break
    finally:
        with _running_lock:
            _running.discard(user_id)


def _out(s, imp: Import) -> ImportOut:
    waiting = s.scalar(
        select(func.count()).where(
            SourcePost.import_id == imp.id,
            SourcePost.embedding.is_(None),
            SourcePost.excluded.is_(False),
        )
    )
    return ImportOut(
        id=imp.id,
        platform=imp.platform,
        status=imp.status,
        parsed=imp.parsed,
        skipped=imp.skipped,
        embedded=imp.embedded,
        waiting=waiting,
    )


@router.post("", response_model=ImportOut, status_code=201)
def create_import(
    background: BackgroundTasks,
    platform: str = Form(...),
    file: UploadFile = File(...),
    user_id: uuid.UUID = Depends(current_user),
    ai: AIClient = Depends(get_ai),
) -> ImportOut:
    with user_session(user_id) as s:
        if s.get(User, user_id).privacy_accepted_at is None:  # FR-37
            raise AppError(
                "privacy_required", "Read and accept the privacy notice before uploading.", 403
            )
    parse = PARSERS.get(platform)
    if parse is None:
        raise AppError(
            "unsupported_platform",
            "Choose Telegram, X or LinkedIn.",
        )
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise AppError(
            "invalid_file", "The file is larger than 64 MB. Export without photos and videos."
        )
    try:
        result = parse(data, excluded_hashtags=excluded_hashtags(user_id))  # FR-44: theirs
    except ImportFormatError as e:
        raise AppError("invalid_file", str(e)) from e  # nothing was saved (FR-3)
    finally:
        del data  # the raw file is never kept (NFR-11)

    with user_session(user_id) as s:
        imp = Import(
            user_id=user_id, platform=platform, status="embedding", parsed=len(result.posts)
        )
        s.add(imp)
        s.flush()
        saved = save_posts(s, user_id, platform, result.posts, import_id=imp.id)
        skipped = dict(result.skipped)
        unchanged = len(result.posts) - saved.new - saved.updated
        if unchanged:
            skipped["already_imported"] = unchanged
        imp.skipped = skipped
        s.flush()
        s.refresh(imp)
        out = _out(s, imp)

    background.add_task(embed_in_background, user_id, ai)
    if platform == "x":
        out.premium_hint = result.premium_hint  # Q31: the UI asks the user to confirm
    return out


@router.get("/{import_id}", response_model=ImportOut)
def get_import(
    import_id: uuid.UUID,
    background: BackgroundTasks,
    user_id: uuid.UUID = Depends(current_user),
    ai: AIClient = Depends(get_ai),
) -> ImportOut:
    with user_session(user_id) as s:
        imp = s.get(Import, import_id)  # RLS: another user's import is simply not found
        if imp is None:
            raise AppError("not_found", "Not found.", 404)
        out = _out(s, imp)
    if out.status == "embedding":
        background.add_task(embed_in_background, user_id, ai)  # resume after a restart
    return out
