"""One tab per platform: its rules, the user's voice card and stats, and settings (FR-22)."""

import re
import uuid
from dataclasses import asdict
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.ai.client import AIClient, AIUnavailable
from app.api.deps import get_ai
from app.core.auth import current_user
from app.core.errors import AppError
from app.schemas import (
    AudiencePlace,
    BestHoursDayOut,
    BestHoursOut,
    Platform,
    PlatformOut,
    PlatformSettingsIn,
    RulesOut,
    VoiceCardIn,
    VoiceStatsOut,
)
from app.services import scheduling, voice
from app.services.clock import valid_zone

CHANNEL = re.compile(r"^@?([A-Za-z][A-Za-z0-9_]{3,31})$")  # Telegram public names

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
        audience_places=[AudiencePlace(**p) for p in v.audience_places],
        audience_profession=v.audience_profession,
        goal=v.goal,
        posts_per_week=v.posts_per_week,
        channel=v.channel,
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
    """FR-33: who the audience is and where it lives; X Premium (Q31); the Telegram channel
    name for the hand-off (FR-12). Send only what changes."""
    changes = body.model_dump(exclude_unset=True)
    premium = changes.pop("x_premium", None)
    if premium is not None:
        if platform != "x":
            raise AppError("not_supported", "X Premium is an X setting.")
        voice.set_premium(user_id, premium, source="user")
    if "audience_places" in changes:
        places = changes["audience_places"] or []
        if any(not valid_zone(p["timezone"]) for p in places):
            raise AppError("invalid_timezone", "Pick each place from the list.")
        if len({p["timezone"] for p in places}) != len(places):
            raise AppError("duplicate_place", "Each place can be listed once.")
    if "channel" in changes:
        if platform != "telegram":
            raise AppError("not_supported", "Only Telegram has a channel name.")
        raw = (changes["channel"] or "").strip().removeprefix("https://t.me/")
        match = CHANNEL.match(raw)
        if raw and not match:
            raise AppError("invalid_channel", "Use the channel's public name, like @fetescript.")
        changes["channel"] = match.group(1) if match else None
    if "goal" in changes:
        changes["goal"] = (changes["goal"] or "").strip()
    voice.update_settings(user_id, platform, changes)
    return _out(user_id, platform)


@router.get("/{platform}/best-hours", response_model=BestHoursOut)
def best_hours(
    platform: Platform,
    start: date,
    days: int = Query(7, ge=1, le=42),
    user_id: uuid.UUID = Depends(current_user),
) -> BestHoursOut:
    """FR-16, FR-34: each day's hours scored for this platform's audience, in the user's own
    time, with the top hours inside their posting window."""
    out, source, tz = scheduling.best_hours(user_id, platform, start, days)
    return BestHoursOut(
        platform=platform,
        timezone=tz,
        source=source,
        days=[BestHoursDayOut(date=d.day, scores=d.scores, best=d.best) for d in out],
    )
