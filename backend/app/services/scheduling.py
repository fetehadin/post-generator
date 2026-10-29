"""Best hours to post, and picking the hour when a draft is approved (FR-16, FR-34, FR-45).

How an hour is scored, for one platform and one of the user's days:
1. Each audience place (a time zone with a share) has its own clock. The user's 18:00 is
   21:00 in Dubai and 15:00 in Berlin; we look up how active that platform's readers are at
   that LOCAL hour and weekday (study-based curves, `posting_curves`), reshaped by when that
   kind of audience is free (developers, business, students, creatives).
2. The places are added up, weighted by share, and scaled so the day's best hour is 1.0.
3. With 50+ of the user's own posts with reactions, their results are blended in per hour,
   shrunk toward the studies where they have few posts (FR-34).

Picking the hour: only hours inside the user's posting window and not already past. The
first post on that platform that day gets the best hour; later ones the best hour that is
far enough from the posts already there. The user can always change it.
"""

import math
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.db import user_session
from app.models import Draft, PlatformSettings, PostingCurve, Profile, SourcePost
from app.services import library
from app.services.clock import user_zone, zone
from app.services.drafting import PLATFORM_NAMES, DraftError

OWN_DATA_MIN = 50  # FR-34: the user's own results count once they have this many posts
SHRINK = 4  # posts in an hour's bucket before the user's data and the studies count equally
GAP = {"x": timedelta(hours=2), "telegram": timedelta(hours=3), "linkedin": timedelta(hours=4)}
LEAD = timedelta(minutes=15)  # never suggest a time less than this from now
PEAK = 0.85  # a platform-curve value at least this high is called a peak


@dataclass(frozen=True)
class Place:
    timezone: str
    share: float  # any positive weight; shares are normalised


@dataclass(frozen=True)
class Curves:
    """Study curves for one platform: weekday → 24 local-hour values, plus the audience's
    24-hour shape (None for a general audience)."""

    by_weekday: dict[int, list[float]]
    audience: list[float] | None
    source: str


@dataclass(frozen=True)
class DayScores:
    day: date
    scores: list[float]  # the user's local hours 0–23, best = 1.0
    best: list[int]  # the top hours inside the posting window, best first


@dataclass(frozen=True)
class Pick:
    at: datetime  # UTC
    rank: int  # 1 = the first post on that platform that day
    reason: str
    warning: str | None


# ---- pure scoring ----


def place_city(tz: str) -> str:
    return tz.rsplit("/", 1)[-1].replace("_", " ")


def normalised(places: Sequence[Place]) -> list[Place]:
    total = sum(p.share for p in places if p.share > 0)
    return [Place(p.timezone, p.share / total) for p in places if p.share > 0] if total else []


def audience_scores(
    day: date, user_tz: ZoneInfo, places: Sequence[Place], curves: Curves
) -> list[float]:
    """24 values for the user's local hours of `day`, scaled so the best is 1.0."""
    raw = []
    for hour in range(24):
        at = datetime.combine(day, time(hour), user_tz)
        total = 0.0
        for p in normalised(places):
            there = at.astimezone(zone(p.timezone))
            value = curves.by_weekday[there.weekday()][there.hour]
            if curves.audience:
                value *= curves.audience[there.hour]
            total += p.share * value
        raw.append(total)
    peak = max(raw) or 1.0
    return [round(v / peak, 4) for v in raw]


def own_hourly(posts: Sequence[tuple[datetime, int]], user_tz: ZoneInfo) -> tuple[list, list]:
    """The user's own results by their local hour (all days together): the mean of
    log(1 + reactions), smoothed with the neighbouring hours, scaled to 1.0 at the best hour,
    plus how many posts back each hour. log() stops one viral post deciding everything."""
    sums, counts = [0.0] * 24, [0.0] * 24
    for posted_at, reactions in posts:
        h = posted_at.astimezone(user_tz).hour
        for dh, weight in ((-1, 0.5), (0, 1.0), (1, 0.5)):
            sums[(h + dh) % 24] += weight * math.log1p(max(reactions, 0))
            counts[(h + dh) % 24] += weight
    means = [s / c if c else 0.0 for s, c in zip(sums, counts, strict=True)]
    peak = max(means) or 1.0
    return [m / peak for m in means], counts


def blend(prior: list[float], own: list[float], counts: list[float]) -> list[float]:
    """Per hour: (count · yours + SHRINK · study) / (count + SHRINK), then best = 1.0."""
    mixed = [
        (c * o + SHRINK * p) / (c + SHRINK) for p, o, c in zip(prior, own, counts, strict=True)
    ]
    peak = max(mixed) or 1.0
    return [round(v / peak, 4) for v in mixed]


def in_window(hour: int, start: time, end: time) -> bool:
    """Whether an hour starting at hour:00 is inside the window; a window may cross midnight."""
    t = time(hour)
    return start <= t < end if start < end else (t >= start or t < end)


def _exists(t: datetime) -> bool:
    """False for a wall time the clock skips (02:30 on a spring-forward night): it would
    land on the same instant as the next hour."""
    return t.astimezone(UTC).astimezone(t.tzinfo).replace(tzinfo=None) == t.replace(tzinfo=None)


def pick_hour(
    day: date,
    scores: list[float],
    user_tz: ZoneInfo,
    window: tuple[time, time],
    taken: Sequence[datetime],
    gap: timedelta,
    now: datetime,
) -> tuple[datetime, bool] | None:
    """The best free hour of `day`, as an aware local datetime, and whether the gap had to be
    given up because the day is full. None when no hour of the window is left."""
    open_hours = [
        t
        for h in range(24)
        if in_window(h, *window)
        and _exists(t := datetime.combine(day, time(h), user_tz))
        and t > now + LEAD
    ]
    if not open_hours:
        return None
    by_score = sorted(open_hours, key=lambda t: (-scores[t.hour], t.hour))
    for t in by_score:
        if all(abs(t - other) >= gap for other in taken):
            return t, False
    return by_score[0], True


def band(hour: int) -> str:
    if 5 <= hour < 11:
        return "morning"
    if 11 <= hour < 14:
        return "midday"
    if 14 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "late evening"


def explain(at: datetime, platform: str, places: Sequence[Place], curves: Curves, own: bool) -> str:
    """One line: where most of the audience is, their local time, and why it's a good hour."""
    ranked = sorted(normalised(places), key=lambda p: -p.share)
    lead = ranked[0]
    there = at.astimezone(zone(lead.timezone))
    who = f"{round(lead.share * 100)}% of your audience" if len(ranked) > 1 else "your audience"
    parts = [f"{who} is in {place_city(lead.timezone)} ({there:%H:%M} there)"]
    value = curves.by_weekday[there.weekday()][there.hour]
    name = PLATFORM_NAMES[platform]
    if value >= PEAK:
        parts.append(f"{name}'s {band(there.hour)} peak")
    else:
        parts.append(f"a good {band(there.hour)} slot on {name}")
    if own:
        parts.append("your own posts do well around then")
    return " · ".join(parts)


# ---- reading the user's data ----


@dataclass(frozen=True)
class Context:
    user_tz: ZoneInfo
    places: list[Place]
    curves: Curves
    window: tuple[time, time]
    own: tuple[list[float], list[float]] | None


def _context(s, user_id: uuid.UUID, platform: str) -> Context:
    user_tz = user_zone(s, user_id)
    settings = s.get(PlatformSettings, (user_id, platform))
    saved = settings.audience_places if settings else []
    places = [Place(p["timezone"], float(p["share"])) for p in saved or []]
    if not normalised(places):  # nothing set yet: the audience lives where the user does
        places = [Place(user_tz.key, 1.0)]
    profession = settings.audience_profession if settings else "general"
    rows = s.scalars(
        select(PostingCurve).where(
            (PostingCurve.platform == platform) & (PostingCurve.audience == "general")
            | (PostingCurve.platform == "any") & (PostingCurve.audience == profession)
        )
    ).all()
    by_weekday = {r.weekday: list(r.hours) for r in rows if r.platform == platform}
    audience = next((list(r.hours) for r in rows if r.platform == "any"), None)
    source = next((r.source for r in rows if r.platform == platform), "")
    profile = s.get(Profile, user_id)
    window = (
        (profile.post_window_start, profile.post_window_end) if profile else (time(8), time(22))
    )
    posts = s.execute(
        select(SourcePost.posted_at, SourcePost.likes + SourcePost.reposts).where(
            SourcePost.user_id == user_id,
            SourcePost.platform == platform,
            SourcePost.likes + SourcePost.reposts > 0,
        )
    ).all()
    own = own_hourly(posts, user_tz) if len(posts) >= OWN_DATA_MIN else None
    return Context(user_tz, places, Curves(by_weekday, audience, source), window, own)


def _scores(ctx: Context, day: date) -> list[float]:
    prior = audience_scores(day, ctx.user_tz, ctx.places, ctx.curves)
    return blend(prior, *ctx.own) if ctx.own else prior


def best_hours(
    user_id: uuid.UUID, platform: str, start: date, days: int = 7
) -> tuple[list[DayScores], str, str]:
    """Each day's 24 scores and its top hours inside the window. Also the source of the
    numbers ("studies" or "your_posts") and the user's time zone name."""
    with user_session(user_id) as s:
        ctx = _context(s, user_id, platform)
    out = []
    for i in range(days):
        day = start + timedelta(days=i)
        scores = _scores(ctx, day)
        hours = [h for h in range(24) if in_window(h, *ctx.window)]
        out.append(DayScores(day, scores, sorted(hours, key=lambda h: (-scores[h], h))[:3]))
    return out, ("your_posts" if ctx.own else "studies"), ctx.user_tz.key


def schedule(
    user_id: uuid.UUID,
    draft_id: uuid.UUID,
    day: date,
    at: datetime | None = None,
    now: datetime | None = None,
) -> tuple[library.DraftDetail, Pick]:
    """FR-45: approve the draft (if it isn't yet) and put it on `day` at the best free hour,
    or at `at` when the user picked a time. Approval keeps its rules (FR-9)."""
    now = now or datetime.now(UTC)
    current = library.detail(user_id, draft_id)
    if current.draft.status == "discarded":
        raise DraftError("discarded", "Restore this draft before you schedule it.", 409)
    platform = current.draft.platform
    with user_session(user_id) as s:
        ctx = _context(s, user_id, platform)
        start = datetime.combine(day, time(0), ctx.user_tz)
        taken = s.scalars(
            select(Draft.scheduled_for).where(
                Draft.user_id == user_id,
                Draft.platform == platform,
                Draft.status.in_(("approved", "published")),
                Draft.id != draft_id,
                Draft.scheduled_for >= start,
                Draft.scheduled_for < start + timedelta(days=1),
            )
        ).all()
    warning = None
    if at is not None:
        when, reason = at, "You picked this time."
        if at.astimezone(ctx.user_tz).date() != day:
            raise DraftError("wrong_day", f"That time isn't on {day:%a %d %b} in your time zone.")
        start_t, end_t = ctx.window
        if not in_window(at.astimezone(ctx.user_tz).hour, start_t, end_t):
            warning = (
                f"That's outside the hours you post ({start_t:%H:%M}–{end_t:%H:%M}), "
                "so you may not be around to post it."
            )
    else:
        picked = pick_hour(
            day, _scores(ctx, day), ctx.user_tz, ctx.window, taken, GAP[platform], now
        )
        if picked is None:
            start_t, end_t = ctx.window
            raise DraftError(
                "no_time_left",
                f"No time is left on that day between {start_t:%H:%M} and {end_t:%H:%M}, "
                "the hours you post. Pick another day.",
            )
        when, crowded = picked
        reason = explain(when, platform, ctx.places, ctx.curves, ctx.own is not None)
        if crowded:
            name = PLATFORM_NAMES[platform]
            warning = f"That day already has {len(taken)} {name} posts close together."
    rank = sum(t < when for t in taken) + 1  # its place in the day's order, not a count
    if platform == "linkedin" and taken and warning is None:
        warning = "LinkedIn tends to show a second post on the same day to fewer people."
    changes: dict = {"scheduled_for": when.astimezone(UTC)}
    if current.draft.status != "approved":
        changes["status"] = "approved"
    detail = library.update(user_id, draft_id, changes)
    return detail, Pick(when.astimezone(UTC), rank, reason, warning)
