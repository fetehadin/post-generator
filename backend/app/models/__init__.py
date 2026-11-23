"""SQLAlchemy models. Importing this package registers every table on Base.metadata."""

from app.models.accounts import GuestUsage, Invite, Profile, ReminderSettings, Upload
from app.models.ai import AICall, UserAIKey
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
from app.models.github import GitHubConnection, GitHubDigest, GitHubItem, GitHubRepo
from app.models.imports import Import, SourcePost
from app.models.telegram import TelegramAccount, TelegramChannel, TelegramLinkToken
from app.models.user import User
from app.models.voice import PlatformSettings, PostingCurve, VoiceCard

__all__ = [
    "TelegramAccount",
    "TelegramChannel",
    "TelegramLinkToken",
    "GitHubConnection",
    "GitHubDigest",
    "GitHubItem",
    "GitHubRepo",
    "AICall",
    "UserAIKey",
    "Checkin",
    "DraftMessage",
    "GuestUsage",
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
