"""Types and rules shared by every importer. Importers are pure: no database, no network."""

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime

# FR-44 default list; each user can edit their own copy in Settings.
DEFAULT_EXCLUDED_HASHTAGS = (
    "#scripture", "#spiritual", "#christianart", "#alhamdulillah", "#eidvibes", "#ኢድ_ሙባረክ",
    "#ramadanbreak", "#family", "#forher", "#relationship", "#friends", "#me", "#dailylife",
    "#memes", "#jokes", "#songs", "#lyrics", "#wallpapers", "#profilepics", "#tiktoks",
    "#funnyvideos", "#comics", "#movies", "#games",
)  # fmt: skip

MIN_TEXT_LENGTH = 15


class ImportFormatError(ValueError):
    """The file isn't the export we expected. The message is shown to the user (FR-3)."""


@dataclass(frozen=True)
class ParsedPost:
    external_id: str
    text: str
    posted_at: datetime
    reactions: int = 0


@dataclass
class ParseResult:
    posts: list[ParsedPost]
    skipped: Counter = field(default_factory=Counter)
    source_name: str = ""


def normalize_hashtags(tags: Iterable[str]) -> set[str]:
    """'Family', '#family' and '#FAMILY' all mean the same excluded tag."""
    out = set()
    for t in tags:
        t = t.strip().lower()
        if t:
            out.add(t if t.startswith("#") else "#" + t)
    return out
