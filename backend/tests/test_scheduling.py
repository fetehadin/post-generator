"""The best-hours math (FR-16, FR-34, FR-45), without a database. Dates are fixed so time
zone offsets are known: on 4 Nov 2026 Berlin is UTC+1, Addis Ababa UTC+3, New York UTC-5."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.services.scheduling import (
    Curves,
    Place,
    audience_scores,
    blend,
    explain,
    in_window,
    own_hourly,
    pick_hour,
)

ADDIS = ZoneInfo("Africa/Addis_Ababa")
WED = date(2026, 11, 4)


def peak_at(hour: int) -> list[float]:
    """A curve that is 1.0 at `hour` local and falls off by 0.1 an hour either side."""
    return [max(0.0, 1 - 0.1 * min(abs(h - hour), 24 - abs(h - hour))) for h in range(24)]


def curves(hour: int = 9, audience=None) -> Curves:
    return Curves({d: peak_at(hour) for d in range(7)}, audience, "test")


def best(scores: list[float]) -> int:
    return max(range(24), key=lambda h: scores[h])


def test_an_audience_in_the_users_zone_peaks_at_the_curves_hour():
    scores = audience_scores(WED, ADDIS, [Place("Africa/Addis_Ababa", 1)], curves(9))
    assert best(scores) == 9 and scores[9] == 1.0


def test_an_audience_elsewhere_is_scored_on_its_own_clock():
    # Berlin's 09:00 is 11:00 in Addis, so that is the user's best hour.
    scores = audience_scores(WED, ADDIS, [Place("Europe/Berlin", 1)], curves(9))
    assert best(scores) == 11


def test_places_count_by_their_share():
    places = [Place("Africa/Addis_Ababa", 70), Place("America/New_York", 30)]
    assert best(audience_scores(WED, ADDIS, places, curves(9))) == 9
    flipped = [Place("Africa/Addis_Ababa", 30), Place("America/New_York", 70)]
    assert best(audience_scores(WED, ADDIS, flipped, curves(9))) == 17  # New York's 09:00


def test_the_audience_shape_reshapes_the_platform_curve():
    evenings = [1.0 if h >= 19 else 0.2 for h in range(24)]
    scores = audience_scores(WED, ADDIS, [Place("Africa/Addis_Ababa", 1)], curves(18, evenings))
    assert best(scores) == 19  # the platform peaks at 18, but this audience is free from 19


def test_a_daylight_saving_day_still_has_24_scores():
    berlin = ZoneInfo("Europe/Berlin")
    scores = audience_scores(date(2026, 3, 29), berlin, [Place("Europe/Berlin", 1)], curves(9))
    assert len(scores) == 24 and max(scores) == 1.0


def test_own_posts_pull_the_best_hour_toward_what_works_for_the_user():
    prior = audience_scores(WED, ADDIS, [Place("Africa/Addis_Ababa", 1)], curves(9))
    at_20 = datetime(2026, 10, 1, 17, tzinfo=UTC)  # 20:00 in Addis
    at_9 = datetime(2026, 10, 1, 6, tzinfo=UTC)  # 09:00 in Addis
    many = [(at_20, 200)] * 40 + [(at_9, 2)] * 20
    own, counts = own_hourly(many, ADDIS)
    assert best(blend(prior, own, counts)) == 20
    few_own, few_counts = own_hourly([(at_20, 200)], ADDIS)
    assert best(blend(prior, few_own, few_counts)) == 9  # one post doesn't outvote the studies


def test_a_window_can_cross_midnight():
    assert in_window(23, time(20), time(2)) and in_window(1, time(20), time(2))
    assert not in_window(12, time(20), time(2))
    assert in_window(8, time(8), time(22)) and not in_window(22, time(8), time(22))


def pick(scores, taken=(), window=(time(8), time(22)), now=None, gap=timedelta(hours=2)):
    now = now or datetime(2026, 11, 1, tzinfo=UTC)
    return pick_hour(WED, scores, ADDIS, window, list(taken), gap, now)


def test_first_post_gets_the_best_hour_and_the_second_the_next_best_far_enough_away():
    scores = peak_at(9)
    first, crowded = pick(scores)
    assert (first.hour, crowded) == (9, False)
    second, _ = pick(scores, taken=[first])
    assert second.hour in (7, 11) and abs(second.hour - 9) >= 2
    assert second.hour == 11  # 07:00 is before the posting window opens at 08:00


def test_hours_outside_the_window_or_already_past_are_never_picked():
    scores = peak_at(6)
    assert pick(scores)[0].hour == 8  # 06:00 is before the window
    now = datetime.combine(WED, time(10), ADDIS).astimezone(UTC)
    assert pick(peak_at(9), now=now)[0].hour == 11  # 09:00 and 10:00 are gone (15 min lead)


def test_a_full_day_gives_up_the_gap_and_says_so():
    taken = [datetime.combine(WED, time(h), ADDIS) for h in range(8, 22, 2)]
    t, crowded = pick(peak_at(9), taken=taken, gap=timedelta(hours=3))
    assert crowded and t.hour == 9


def test_nothing_left_today_returns_none():
    late = datetime.combine(WED, time(23), ADDIS).astimezone(UTC)
    assert pick(peak_at(9), now=late) is None


def test_the_reason_names_the_place_its_local_time_and_the_peak():
    places = [Place("Africa/Addis_Ababa", 70), Place("Europe/Berlin", 30)]
    at = datetime.combine(WED, time(9), ADDIS)
    line = explain(at, "telegram", places, curves(9), own=False)
    assert line == "70% of your audience is in Addis Ababa (09:00 there) · Telegram's morning peak"
    quiet = explain(datetime.combine(WED, time(15), ADDIS), "x", places[:1], curves(9), own=True)
    assert quiet == (
        "your audience is in Addis Ababa (15:00 there) · a good afternoon slot on X"
        " · your own posts do well around then"
    )


def test_an_hour_the_clock_skips_is_never_picked():
    # 29 Mar 2026: Berlin jumps from 02:00 to 03:00, so 02:00 doesn't exist that night.
    berlin = ZoneInfo("Europe/Berlin")
    scores = [0.0] * 24
    scores[2] = 1.0
    scores[3] = 0.5
    picked = pick_hour(
        date(2026, 3, 29), scores, berlin, (time(0), time(23)), [], timedelta(hours=2),
        datetime(2026, 3, 1, tzinfo=UTC),
    )  # fmt: skip
    assert picked is not None and picked[0].hour == 3
