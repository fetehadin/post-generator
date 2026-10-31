"""The Profile page's data: the About-you form and the summary card (FR-17, FR-18)."""

import uuid

from fastapi import APIRouter, Depends

from app.ai.client import AIClient, AIUnavailable
from app.api.deps import get_ai
from app.core.auth import current_user
from app.core.errors import AppError
from app.importers.common import normalize_hashtags
from app.models import Profile
from app.schemas import ProfileIn, ProfileOut
from app.services import profile as service

router = APIRouter(prefix="/profile", tags=["profile"])


def _out(p: Profile) -> ProfileOut:
    tags = service.DEFAULT_EXCLUDED_HASHTAGS if p.excluded_hashtags is None else p.excluded_hashtags
    return ProfileOut(
        **{name: getattr(p, name) for name in service.FIELDS},
        language=p.language,
        excluded_hashtags=list(tags),
        summary_card=p.summary_card,
        summary_updated_at=p.summary_updated_at,
        post_window_start=p.post_window_start,
        post_window_end=p.post_window_end,
        projects=p.projects or [],
    )


@router.get("", response_model=ProfileOut)
def read_profile(user_id: uuid.UUID = Depends(current_user)) -> ProfileOut:
    return _out(service.get_profile(user_id))


@router.put("", response_model=ProfileOut)
def edit_profile(body: ProfileIn, user_id: uuid.UUID = Depends(current_user)) -> ProfileOut:
    changes = body.model_dump(exclude_unset=True)
    for name, value in list(changes.items()):
        if value is None:
            del changes[name]
        elif isinstance(value, str):
            changes[name] = value.strip()
    window = {"post_window_start", "post_window_end"} & changes.keys()
    if window:
        for name in window:  # whole minutes on the user's own clock
            changes[name] = changes[name].replace(second=0, microsecond=0, tzinfo=None)
        current = service.get_profile(user_id)
        start = changes.get("post_window_start", current.post_window_start)
        end = changes.get("post_window_end", current.post_window_end)
        if start == end:
            raise AppError("empty_window", "Your posting hours need a start and a later end.")
    if "excluded_hashtags" in changes:
        changes["excluded_hashtags"] = sorted(normalize_hashtags(changes["excluded_hashtags"]))
    return _out(service.update_profile(user_id, changes))


@router.post("/summary", response_model=ProfileOut)
def write_summary(
    user_id: uuid.UUID = Depends(current_user), ai: AIClient = Depends(get_ai)
) -> ProfileOut:
    """FR-18: the AI drafts the card from the answers; the user reviews and edits it."""
    try:
        return _out(service.write_summary(user_id, ai=ai))
    except AIUnavailable as e:
        raise AppError(
            "ai_unavailable", "The summary can't be written right now. Your answers are saved.", 503
        ) from e
