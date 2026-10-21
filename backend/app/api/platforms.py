"""One tab per platform: its rules, the user's voice card and stats, and settings (FR-22)."""

import uuid
from dataclasses import asdict

from fastapi import APIRouter, Depends

from app.ai.client import AIClient, AIUnavailable
from app.api.deps import get_ai
from app.core.auth import current_user
from app.core.errors import AppError
from app.schemas import (
    Platform,
    PlatformOut,
    PlatformSettingsIn,
    RulesOut,
    VoiceCardIn,
    VoiceStatsOut,
)
from app.services import voice

router = APIRouter(prefix="/platforms", tags=["platforms"])


def _out(user_id: uuid.UUID, platform: str) -> PlatformOut:
    v = voice.view(user_id, platform)
    return PlatformOut(
        platform=platform,
        rules=RulesOut(
            char_limit=v.rules.char_limit,
            counting_rule=v.rules.counting_rule,
            tone_notes=v.rules.tone_notes,
            structure_notes=v.rules.structure_notes,
        ),
        effective_limit=v.effective_limit,
        stats=VoiceStatsOut(**asdict(v.stats), thin=v.stats.thin),
        voice_card=v.card,
        voice_card_updated_at=v.card_updated_at,
        x_premium=v.x_premium,
        premium_source=v.premium_source,
    )


@router.get("/{platform}", response_model=PlatformOut)
def read_platform(platform: Platform, user_id: uuid.UUID = Depends(current_user)) -> PlatformOut:
    return _out(user_id, platform)


@router.put("/{platform}/voice-card", response_model=PlatformOut)
def edit_voice_card(
    platform: Platform, body: VoiceCardIn, user_id: uuid.UUID = Depends(current_user)
) -> PlatformOut:
    voice.edit_card(user_id, platform, body.voice_card)
    return _out(user_id, platform)


@router.post("/{platform}/voice-card", response_model=PlatformOut)
def write_voice_card(
    platform: Platform, user_id: uuid.UUID = Depends(current_user), ai: AIClient = Depends(get_ai)
) -> PlatformOut:
    """FR-5, FR-26: the AI rewrites the card from the posts; hand-edited lines stay."""
    try:
        voice.write_card(user_id, platform, ai=ai)
    except voice.NoPosts as e:
        raise AppError("no_posts", "Import some posts for this platform first.") from e
    except AIUnavailable as e:
        raise AppError(
            "ai_unavailable", "The voice card can't be written right now. Try again soon.", 503
        ) from e
    return _out(user_id, platform)


@router.put("/{platform}/settings", response_model=PlatformOut)
def edit_settings(
    platform: Platform, body: PlatformSettingsIn, user_id: uuid.UUID = Depends(current_user)
) -> PlatformOut:
    if platform != "x":
        raise AppError("not_supported", "Only X has settings for now.")
    voice.set_premium(user_id, body.x_premium, source="user")
    return _out(user_id, platform)
