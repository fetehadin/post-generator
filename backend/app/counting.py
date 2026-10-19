"""Post length by each platform's counting rule (FR-9). Never plain len() for X."""

import re

URL = re.compile(r"https?://\S+")
X_URL_WEIGHT = 23


def _weighs_two(cp: int) -> bool:
    return (
        cp >= 0x1F000  # most emoji
        or 0x2600 <= cp <= 0x27BF  # symbols and dingbats used as emoji
        or 0x1100 <= cp <= 0x115F  # Hangul Jamo
        or 0x2E80 <= cp <= 0xA4CF  # CJK
        or 0xAC00 <= cp <= 0xD7A3  # Hangul syllables
    )


def x_weighted_length(text: str) -> int:
    """X counts each link as 23 and most emoji and CJK characters as 2."""
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
