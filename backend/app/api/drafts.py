"""Generating a draft (FR-7, FR-8) and showing the exact prompt behind it (NFR-15)."""

import uuid

from fastapi import APIRouter, Depends

from app.ai.client import AIClient, AIUnavailable, EmbeddingUnavailable
from app.api.deps import get_ai
from app.core.auth import current_user
from app.core.errors import AppError
from app.schemas import DraftOut, GenerateIn, LengthOut, PromptOut
from app.services.drafting import DraftError, generate_draft, prompt_for

router = APIRouter(prefix="/drafts", tags=["drafts"])


@router.post("/generate", response_model=DraftOut, status_code=201)
def generate(
    body: GenerateIn,
    user_id: uuid.UUID = Depends(current_user),
    ai: AIClient = Depends(get_ai),
) -> DraftOut:
    try:
        r = generate_draft(user_id, body.platform, body.topic, ai=ai)
    except DraftError as e:
        raise AppError(e.code, e.message) from e
    except (AIUnavailable, EmbeddingUnavailable) as e:
        # The user's topic is in their own request; nothing is lost (NFR-4).
        raise AppError(
            "ai_unavailable", "The AI service is busy right now. Try again in a minute.", 503
        ) from e
    return DraftOut(
        id=r.draft_id,
        platform=body.platform,
        status="draft",
        text=r.text,
        length=LengthOut(count=r.length, limit=r.char_limit, over=r.over_limit),
        model=r.model_version or r.model,
        examples_used=len(r.examples),
        created_at=r.created_at,
    )


@router.get("/{draft_id}/prompt", response_model=PromptOut)
def get_prompt(draft_id: uuid.UUID, user_id: uuid.UUID = Depends(current_user)) -> PromptOut:
    log = prompt_for(user_id, draft_id)
    if log is None:
        raise AppError("not_found", "Not found.", 404)
    return PromptOut(
        prompt=log.prompt, model=log.model, model_version=log.model_version, provider=log.provider
    )
