"""SQLAlchemy models. Importing this package registers every table on Base.metadata."""

from app.models.accounts import Invite, Profile, ReminderSettings, Upload
from app.models.base import Base
from app.models.drafts import (
    Checkin,
    Draft,
    DraftMessage,
    DraftVersion,
    ExemplarPost,
    PlatformProfile,
    PromptLog,
    Thread,
)
from app.models.imports import Import, SourcePost
from app.models.user import User
from app.models.voice import PlatformSettings, PostingCurve, VoiceCard

__all__ = [
    "Checkin",
    "DraftMessage",
    "Invite",
    "Profile",
    "Base",
    "Draft",
    "DraftVersion",
    "ExemplarPost",
    "Import",
    "PlatformProfile",
    "PlatformSettings",
    "PostingCurve",
    "PromptLog",
    "ReminderSettings",
    "SourcePost",
    "Thread",
    "Upload",
    "User",
    "VoiceCard",
]
