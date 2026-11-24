"""Profile strength (FR-53): how complete the profile is, as a percentage, like Upwork's.

Each item is weighted by how much it improves drafts, so importing posts (the voice) counts
more than connecting GitHub. The weights add up to 100.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import exists, func, select

from app.core.db import user_session
from app.models import (
    GitHubConnection,
    PlatformSettings,
    SourcePost,
    TelegramChannel,
    Upload,
    UserAIKey,
)
from app.services.profile import get_profile


@dataclass(frozen=True)
class Item:
    id: str
    label: str  # what to do, shown as the next step: "Add your profession"
    weight: int
    done: bool
    tab: str  # the Profile tab that has it
    section: str  # the element id to scroll to and focus


# (id, label, weight, tab, section), in the order they are suggested.
ITEMS = [
    ("profession", "Add your profession", 10, "about", "field-discipline"),
    ("posts", "Import your posts so drafts sound like you", 25, "voice", "import-posts"),
    ("summary", "Write your summary card", 20, "about", "summary-card"),
    ("working_on", "Say what you are working on", 5, "about", "field-current_projects"),
    ("getting_better", "Say what you are getting better at", 5, "about", "field-focus"),
    ("projects", "Add a project", 10, "about", "projects"),
    ("audience", "Say where your audience lives", 10, "audience", "audience"),
    ("resume", "Add your resume or portfolio", 10, "about", "resume"),
    ("connection", "Connect Telegram, GitHub or an API key", 5, "connections", "free-key"),
]
assert sum(w for _, _, w, _, _ in ITEMS) == 100


def score(done: dict[str, bool]) -> tuple[int, list[Item]]:
    """The percentage and every item, from which items are done."""
    items = [Item(i, label, w, bool(done.get(i)), tab, sec) for i, label, w, tab, sec in ITEMS]
    return sum(x.weight for x in items if x.done), items


def profile_strength(user_id: uuid.UUID) -> tuple[int, list[Item]]:
    p = get_profile(user_id)

    def has(model, *where) -> bool:
        return bool(s.scalar(select(exists().where(model.user_id == user_id, *where))))

    with user_session(user_id) as s:
        done = {
            "profession": bool(p.discipline.strip()),
            "posts": has(SourcePost),
            "summary": bool(p.summary_card.strip()),
            "working_on": bool(p.current_projects.strip()),
            "getting_better": bool(p.focus.strip()),
            "projects": any((x.get("name") or "").strip() for x in p.projects or []),
            "audience": has(
                PlatformSettings, func.jsonb_array_length(PlatformSettings.audience_places) > 0
            ),
            "resume": has(Upload),
            "connection": has(TelegramChannel) or has(GitHubConnection) or has(UserAIKey),
        }
    return score(done)
