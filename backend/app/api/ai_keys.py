"""Your own AI keys (FR-48): add, list and remove a Gemini or Groq key. The key itself is
never sent back; only its last four characters."""

from fastapi import APIRouter, Depends, Response

from app.ai.client import AIClient
from app.api.deps import get_ai
from app.core.auth import current_user
from app.core.errors import AppError
from app.models import UserAIKey
from app.schemas import AIKeyIn, AIKeyOut, AIKeysOut, AIProviderOut
from app.services import ai_keys

router = APIRouter(prefix="/me/ai-keys", tags=["me"])


def _out(row: UserAIKey) -> AIKeyOut:
    return AIKeyOut(
        provider=row.provider,
        last4=row.last4,
        status=row.status,
        last_error=row.last_error,
        added_at=row.updated_at,
        last_used_at=row.last_used_at,
    )


@router.get("", response_model=AIKeysOut)
def list_keys(user_id=Depends(current_user)) -> AIKeysOut:
    return AIKeysOut(
        enabled=ai_keys.enabled(),
        providers=[
            AIProviderOut(id=p.id, name=p.name, key_url=p.key_url, used_for=p.used_for)
            for p in ai_keys.PROVIDERS.values()
        ],
        keys=[_out(k) for k in ai_keys.list_keys(user_id)],
    )


@router.put("/{provider}", response_model=AIKeyOut)
def save_key(
    provider: str, body: AIKeyIn, user_id=Depends(current_user), ai: AIClient = Depends(get_ai)
) -> AIKeyOut:
    try:
        return _out(ai_keys.save(user_id, provider, body.key, ai.check_key))
    except ai_keys.AIKeyError as e:
        raise AppError(e.code, e.message, e.status) from e


@router.delete("/{provider}", status_code=204)
def delete_key(provider: str, user_id=Depends(current_user)) -> Response:
    if not ai_keys.delete(user_id, provider):
        raise AppError("not_found", "There's no key for that provider.", 404)
    return Response(status_code=204)
