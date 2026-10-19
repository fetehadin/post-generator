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


def x_weighted_length(text: str) -> int:
    """X counts each link as 23 and characters outside the Latin-and-friends ranges as 2."""
    total = X_URL_WEIGHT * len(URL.findall(text))
    for ch in URL.sub("", text):
        cp = ord(ch)
        if cp in (0xFE0F, 0x200D):  # emoji variation selector / joiner add nothing
            continue
        total += 2 if _weighs_two(cp) else 1
    return total


def post_length(text: str, counting_rule: str) -> int:
    if counting_rule == "x_weighted":
        return x_weighted_length(text)
    return len(text)
