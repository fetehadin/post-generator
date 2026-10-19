"""Request and response bodies. They mirror docs/API.md; change both together."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

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


class PostOut(BaseModel):
    id: uuid.UUID
    platform: Platform
    text: str
    posted_at: datetime
    likes: int
    pinned: bool
    excluded: bool
    embedded: bool


class PostsPage(BaseModel):
    items: list[PostOut]
    next_cursor: str | None


class GenerateIn(BaseModel):
    platform: Platform
    topic: str = Field(max_length=4000)
    checkin_id: uuid.UUID | None = None  # check-ins arrive in Phase 4


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


class PromptOut(BaseModel):
    prompt: str
    model: str
    model_version: str | None
    provider: str
