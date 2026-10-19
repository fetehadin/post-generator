"""Checks on a generated draft: copied phrases (style, not sentences) and invented numbers
(FR-19: drafts state only given facts). Used by drafting (one rewrite) and the eval."""

import re

WORD = re.compile(r"[^\W_]+", re.UNICODE)
NUMBER = re.compile(r"\d+")
LIST_MARKER = re.compile(r"^\s*\d+[.)]\s", re.MULTILINE)  # "1. Start small" is not a fact
NOT_FACTS = re.compile(r"https?://\S+|[#@][^\W_][\w]*", re.UNICODE)  # links, #tags, @handles


def invented_numbers(draft: str, facts: str) -> list[str]:
    """Numbers in the draft that the facts don't contain."""
    given = set(NUMBER.findall(facts))
    found = NUMBER.findall(NOT_FACTS.sub(" ", LIST_MARKER.sub("", draft)))
    return sorted({n for n in found if n not in given}, key=int)


def shared_run(draft: str, example: str) -> list[str]:
    """The longest run of consecutive words that appears in both texts (case-insensitive)."""
    a, b = WORD.findall(draft.lower()), WORD.findall(example.lower())
    best_len, best_end, prev = 0, 0, [0] * (len(b) + 1)
    for i in range(1, len(a) + 1):
        cur = [0] * (len(b) + 1)
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                cur[j] = prev[j - 1] + 1
                if cur[j] > best_len:
                    best_len, best_end = cur[j], i
        prev = cur
    return a[best_end - best_len : best_end]


def longest_shared_run(draft: str, example: str) -> int:
    return len(shared_run(draft, example))


def longest_copy(draft: str, examples: list[str]) -> list[str]:
    """The longest copied run across all examples (empty when nothing is shared)."""
    return max((shared_run(draft, e) for e in examples), key=len, default=[])
