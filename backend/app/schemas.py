"""Request and response bodies. They mirror docs/API.md; change both together."""

import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, field_validator

Platform = Literal["telegram", "x", "linkedin"]


class HealthOut(BaseModel):
    api: str
    db: str


class ImportOut(BaseModel):
    id: uuid.UUID
    platform: Platform
    status: Literal["parsing", "embedding", "done", "failed"]
    parsed: int
    skipped: dict[str, int]
    embedded: int
    waiting: int = Field(description="Posts from this import still waiting to be embedded")
    premium_hint: bool | None = Field(
        default=None,
        description="X only, on upload: a recent post over 280 suggests Premium (Q31)",
    )


class PostOut(BaseModel):
    id: uuid.UUID
    platform: Platform
    text: str
    posted_at: datetime
    likes: int
    pinned: bool
    excluded: bool
    embedded: bool


class PostPatchIn(BaseModel):
    """FR-25: pin a post (always an example) or exclude it (never one). Setting one clears
    the other: a post can't be both."""

    pinned: bool | None = None
    excluded: bool | None = None


class PostsPage(BaseModel):
    items: list[PostOut]
    next_cursor: str | None


class GenerateIn(BaseModel):
    platform: Platform
    topic: str = Field(
        "", max_length=4000, description="Empty = write from the summary card (needs one)"
    )
    checkin_id: uuid.UUID | None = None


class LengthOut(BaseModel):
    count: int
    limit: int
    over: bool


class DraftOut(BaseModel):
    id: uuid.UUID
    platform: Platform
    status: str
    text: str
    length: LengthOut
    model: str | None
    examples_used: int
    created_at: datetime
    thread_id: uuid.UUID


class PromptOut(BaseModel):
    prompt: str
    model: str
    model_version: str | None
    provider: str


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    admitted: bool  # invite redeemed or email allowed (FR-28)
    privacy_accepted: bool  # uploads are blocked until true (FR-37)
    timezone: str = Field("UTC", description='IANA name, e.g. "Africa/Addis_Ababa" (NFR-16)')


class MePatchIn(BaseModel):
    timezone: str = Field(min_length=1, max_length=64)


class ReminderIO(BaseModel):
    """GET/PUT /me/reminders (FR-42): the daily check-in reminder, shown in the app."""

    enabled: bool
    days: list[int] = Field(description="0 = Monday … 6 = Sunday")
    local_time: time = Field(description='In the user\'s own time zone, e.g. "18:00"')

    @field_validator("days")
    @classmethod
    def _weekdays(cls, days: list[int]) -> list[int]:
        if any(d not in range(7) for d in days):
            raise ValueError("days are 0 (Monday) to 6 (Sunday)")
        return days


class UsageOut(BaseModel):
    """GET /me/usage (FR-30): per UTC day."""

    drafts: int
    draft_limit: int
    posts: int
    post_limit: int
    resets_at: datetime


class DeleteMeIn(BaseModel):
    confirm: str = Field(max_length=20, description='Must be "delete"')


class InviteIn(BaseModel):
    code: str = Field(min_length=1, max_length=64)


class ProfileOut(BaseModel):
    """GET /profile: everything the user told Voxlace (FR-17, FR-18, FR-24, FR-33, FR-44)."""

    role: str
    stack: str
    current_projects: str
    focus: str
    goal: str
    topics: str
    audience: str
    avoid_list: str
    voice_words: str
    links: str
    discipline: str
    usual_hours: str
    language: str = Field(description='"auto" = the same language mix as their posts')
    excluded_hashtags: list[str]
    summary_card: str
    summary_updated_at: datetime | None


class ProfileIn(BaseModel):
    """PUT /profile: send only the fields that change."""

    role: str | None = Field(None, max_length=500)
    stack: str | None = Field(None, max_length=1000)
    current_projects: str | None = Field(None, max_length=2000)
    focus: str | None = Field(None, max_length=1000)
    goal: str | None = Field(None, max_length=1000)
    topics: str | None = Field(None, max_length=2000)
    audience: str | None = Field(None, max_length=2000)
    avoid_list: str | None = Field(None, max_length=2000)
    voice_words: str | None = Field(None, max_length=500)
    links: str | None = Field(None, max_length=2000)
    discipline: str | None = Field(None, max_length=500)
    usual_hours: str | None = Field(None, max_length=500)
    language: str | None = Field(None, min_length=2, max_length=32)
    excluded_hashtags: list[str] | None = Field(None, max_length=200)
    summary_card: str | None = Field(None, max_length=3000)


class RulesOut(BaseModel):
    char_limit: int
    counting_rule: str
    tone_notes: str
    structure_notes: str


class VoiceStatsOut(BaseModel):
    post_count: int
    thin: bool = Field(description="Fewer than 20 posts: the voice may be off (FR-5)")
    median_length: int
    median_lines: int
    emoji_share: float
    hashtag_share: float
    link_share: float
    question_share: float
    ethiopic_share: float
    top_hashtags: list[str]


class PlatformOut(BaseModel):
    """GET /platforms/{platform}: the Profile tab for one platform (FR-22)."""

    platform: Platform
    rules: RulesOut
    effective_limit: int = Field(description="The limit drafts are checked against (Q31)")
    stats: VoiceStatsOut
    voice_card: str
    voice_card_updated_at: datetime | None
    x_premium: bool | None = Field(description="X only; null = not known yet")
    premium_source: Literal["user", "export"] | None


class VoiceCardIn(BaseModel):
    voice_card: str = Field(max_length=3000)


class PlatformSettingsIn(BaseModel):
    x_premium: bool


DraftStatus = Literal["draft", "approved", "published", "discarded"]


class CheckinIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    day: date | None = Field(None, description="The user's own calendar day; default today (UTC)")


class CheckinPatchIn(BaseModel):
    text: str | None = Field(None, min_length=1, max_length=4000)
    day: date | None = None


class CheckinOut(BaseModel):
    id: uuid.UUID
    day: date
    text: str
    created_at: datetime
    updated_at: datetime


class CheckinsOut(BaseModel):
    items: list[CheckinOut]


class DraftRowOut(BaseModel):
    """One row of the library, Home's list or the calendar (FR-11, FR-13)."""

    id: uuid.UUID
    platform: Platform
    status: DraftStatus
    text: str
    length: LengthOut
    scheduled_for: datetime | None
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime = Field(description="When the current version was made")
    thread_id: uuid.UUID | None = None


class DraftsOut(BaseModel):
    items: list[DraftRowOut]


class NotificationsOut(BaseModel):
    """GET /me/notifications (FR-35, FR-42): asked every minute by the app."""

    due: list[DraftRowOut] = Field(description="Approved, from 10 min before to 30 min after")
    missed: list[DraftRowOut] = Field(description="Approved, time passed 30+ min ago, not posted")
    checkin_reminder: bool


class ThreadIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    day: date | None = Field(None, description="The user's own day; default today, their time")


class ThreadGenerateIn(BaseModel):
    platforms: list[Platform] = Field(min_length=1, max_length=3)


class ConvertIn(BaseModel):
    platform: Platform


class ThreadRowOut(BaseModel):
    id: uuid.UUID
    title: str
    platforms: list[Platform]
    updated_at: datetime


class ThreadsOut(BaseModel):
    items: list[ThreadRowOut]


class CardOut(BaseModel):
    """A draft version shown as a card in the thread."""

    version_id: uuid.UUID
    number: int
    text: str
    length: LengthOut


class ThreadMessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    text: str
    draft_id: uuid.UUID | None
    card: CardOut | None = Field(description="Set when this message is a draft version")
    created_at: datetime


class GenerateFailureOut(BaseModel):
    platform: Platform
    code: str
    message: str


class ThreadOut(BaseModel):
    id: uuid.UUID
    title: str
    checkin_id: uuid.UUID | None
    checkin_text: str
    created_at: datetime
    updated_at: datetime
    messages: list[ThreadMessageOut]
    drafts: list[DraftRowOut] = Field(description="Each draft's current state, oldest first")
    failures: list[GenerateFailureOut] = Field(
        default_factory=list, description="Platforms that couldn't be written (generate only)"
    )


class VersionOut(BaseModel):
    id: uuid.UUID
    number: int
    text: str
    instruction: str | None
    created_at: datetime


class MessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    text: str
    version_id: uuid.UUID | None
    created_at: datetime


class DraftDetailOut(DraftRowOut):
    """GET /drafts/{id}: the editor's data (FR-10, FR-40)."""

    topic: str
    checkin_id: uuid.UUID | None
    versions: list[VersionOut]
    messages: list[MessageOut]


class DraftPatchIn(BaseModel):
    text: str | None = Field(None, min_length=1, max_length=30_000)
    status: DraftStatus | None = None
    scheduled_for: AwareDatetime | None = Field(
        None, description="UTC; null takes it off the calendar. Needs approval."
    )


class ReviseIn(BaseModel):
    instruction: str = Field(min_length=1, max_length=2000)
    selection: str | None = Field(None, max_length=5000, description="Change only this part")


class DraftStatsOut(BaseModel):
    """GET /drafts/stats (FR-15): the last 7 days."""

    created: int
    published: int
    publish_rate: float | None = Field(description="published / created, 0–1; null with none")
    edited: float | None = Field(
        description="Average edit of posted drafts from v1, 0 (as written) – 1 (rewritten)"
    )
