"""Guest mode (FR-47): draft and revise without logging in. Nothing of the guest's is stored;
the drafts come back with signed receipts that `POST /threads/claim` saves after login."""

from fastapi import APIRouter, Depends, Request

from app.ai.client import AIClient, AIUnavailable, EmbeddingUnavailable
from app.api.deps import get_ai
from app.core.errors import AppError
from app.schemas import (
    GenerateFailureOut,
    GuestDraftIn,
    GuestDraftOut,
    GuestDraftsOut,
    GuestReviseIn,
    GuestReviseOut,
    LengthOut,
)
from app.services import guest
from app.services.drafting import DraftError
from app.services.threads import AI_BUSY

router = APIRouter(prefix="/guest", tags=["guest"])


def address(request: Request) -> str:
    """The visitor's IP: Cloudflare's header first (the edge Worker), then the proxy chain.
    Only used, hashed, to count guest drafts; it can be spoofed by calling the origin
    directly, which is why there's also a daily total for all guests."""
    h = request.headers
    forwarded = h.get("x-forwarded-for", "").split(",")[0].strip()
    return h.get("cf-connecting-ip") or forwarded or (request.client.host if request.client else "")


def _out(d: guest.GuestDraft) -> GuestDraftOut:
    return GuestDraftOut(
        platform=d.platform,
        text=d.text,
        length=LengthOut(count=d.length, limit=d.char_limit, over=d.length > d.char_limit),
        receipt=d.receipt,
    )


@router.post("/drafts", response_model=GuestDraftsOut)
def write(body: GuestDraftIn, request: Request, ai: AIClient = Depends(get_ai)) -> GuestDraftsOut:
    try:
        drafts, failures = guest.write(address(request), body.topic, body.platforms, ai=ai)
    except DraftError as e:
        raise AppError(e.code, e.message, e.status) from e
    return GuestDraftsOut(
        drafts=[_out(d) for d in drafts],
        failures=[
            GenerateFailureOut(platform=f.platform, code=f.code, message=f.message)
            for f in failures
        ],
    )


@router.post("/revise", response_model=GuestReviseOut)
def revise(body: GuestReviseIn, request: Request, ai: AIClient = Depends(get_ai)) -> GuestReviseOut:
    try:
        r = guest.revise(address(request), body.receipt, body.instruction, ai=ai)
    except DraftError as e:
        raise AppError(e.code, e.message, e.status) from e
    except (AIUnavailable, EmbeddingUnavailable) as e:
        raise AppError("ai_unavailable", AI_BUSY, 503) from e
    if isinstance(r, str):
        return GuestReviseOut(draft=None, question=r)
    return GuestReviseOut(draft=_out(r), question=None)
