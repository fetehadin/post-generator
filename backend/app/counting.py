"""Post length by each platform's counting rule (FR-9). Never plain len() for X."""

import re

URL = re.compile(r"https?://\S+")
X_URL_WEIGHT = 23


# twitter-text v3 (the reference X counter): characters in these ranges weigh 1,
# everything else weighs 2. That includes Ethiopic (Amharic), CJK, Hangul and emoji.
LIGHT_RANGES = (
    (0x0000, 0x10FF),  # Latin, Greek, Cyrillic, Arabic, Hebrew, Indic, Georgian …
    (0x2000, 0x200D),  # spaces and zero-width characters
    (0x2010, 0x201F),  # dashes and quotation marks
    (0x2032, 0x2037),  # primes
)


def _weighs_two(cp: int) -> bool:
    return not any(lo <= cp <= hi for lo, hi in LIGHT_RANGES)


ZWJ = 0x200D  # zero-width joiner: 👨 + ZWJ + 💻 is one emoji


def _emoji_part(cp: int) -> bool:
    """Parts that belong to the emoji before them and add nothing."""
    return (
        cp == 0xFE0F  # variation selector: ❤ → ❤️
        or 0x1F3FB <= cp <= 0x1F3FF  # skin tones
        or 0xE0020 <= cp <= 0xE007F  # tag sequences (subdivision flags)
        or cp == 0x20E3  # keycap
    )


def _regional(cp: int) -> bool:
    return 0x1F1E6 <= cp <= 0x1F1FF  # two of these make one flag


def x_weighted_length(text: str) -> int:
    """X counts each link as 23, each whole emoji as 2, and characters outside the
    Latin-and-friends ranges as 2 (twitter-text v3). Cases: samples/x_counter_cases.json."""
    total = X_URL_WEIGHT * len(URL.findall(text))
    joined = flag_open = False
    for ch in URL.sub("", text):
        cp = ord(ch)
        if cp == ZWJ:
            joined = True
            continue
        if _emoji_part(cp):
            continue
        if joined:  # the emoji after a joiner is part of the one before
            joined = False
            continue
        if _regional(cp):
            flag_open = not flag_open
            total += 2 if flag_open else 0
            continue
        flag_open = False
        total += 2 if _weighs_two(cp) else 1
    return total


def post_length(text: str, counting_rule: str) -> int:
    if counting_rule == "x_weighted":
        return x_weighted_length(text)
    return len(text)
