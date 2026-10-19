"""The ten test topics: draft each one and write a report to compare after prompt changes.

    python -m app.dev eval [--platform telegram]

Reports go to backend/evals/out/ (git-ignored: they contain the user's real posts).
Each draft gets three automatic checks:
- invented numbers: digits in the draft that are not in the topic (FR-19 facts guard)
- over the limit: the platform's length rule (FR-9)
- copying: the longest run of words shared with any example post (should stay small)
"""

import json
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.ai.client import AIClient, AIUnavailable, EmbeddingUnavailable
from app.services.drafting import DraftError, DraftResult, generate_draft

BACKEND = Path(__file__).resolve().parents[1]
TOPICS = BACKEND / "evals" / "topics.json"
OUT = BACKEND / "evals" / "out"
NUMBER = re.compile(r"\d+")
LIST_MARKER = re.compile(r"^\s*\d+[.)]\s", re.MULTILINE)  # "1. Start small" is not a fact
WORD = re.compile(r"[^\W_]+", re.UNICODE)
COPY_WARN = 8  # words in a row shared with one example


@dataclass(frozen=True)
class Check:
    invented_numbers: list[str]
    over_limit: bool
    longest_copy: int

    @property
    def ok(self) -> bool:
        return not self.invented_numbers and not self.over_limit and self.longest_copy < COPY_WARN


def invented_numbers(draft: str, topic: str) -> list[str]:
    given = set(NUMBER.findall(topic))
    found = NUMBER.findall(LIST_MARKER.sub("", draft))
    return sorted({n for n in found if n not in given}, key=int)


def longest_shared_run(draft: str, example: str) -> int:
    """Length of the longest run of consecutive words that appears in both texts."""
    a, b = WORD.findall(draft.lower()), WORD.findall(example.lower())
    best, prev = 0, [0] * (len(b) + 1)
    for i in range(1, len(a) + 1):
        cur = [0] * (len(b) + 1)
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                cur[j] = prev[j - 1] + 1
                best = max(best, cur[j])
        prev = cur
    return best


def check(result: DraftResult, topic: str) -> Check:
    return Check(
        invented_numbers=invented_numbers(result.text, topic),
        over_limit=result.over_limit,
        longest_copy=max(
            (longest_shared_run(result.text, e.text) for e in result.examples), default=0
        ),
    )


def run_eval(
    user_id: uuid.UUID, platform: str = "telegram", ai: AIClient | None = None, out_dir: Path = OUT
) -> Path:
    topics = json.loads(TOPICS.read_text(encoding="utf-8"))["topics"]
    stamp = datetime.now(UTC).strftime("%Y-%m-%d-%H%M")
    lines = [f"# Eval · {platform} · {stamp} UTC", ""]
    passed, models = 0, set()

    for t in topics:
        lines += [f"## {t['id']}", f"> {t['topic']}", "", f"_Checks: {t['checks']}_", ""]
        try:
            r = generate_draft(user_id, platform, t["topic"], ai=ai)
        except (DraftError, AIUnavailable, EmbeddingUnavailable) as e:
            lines += [f"**Not generated:** {e}", ""]
            continue
        c = check(r, t["topic"])
        models.add(r.model_version or r.model)
        passed += c.ok
        flags = []
        if c.invented_numbers:
            flags.append(f"⚠ numbers not in the topic: {', '.join(c.invented_numbers)}")
        if c.over_limit:
            flags.append(f"⚠ over the limit ({r.length}/{r.char_limit})")
        if c.longest_copy >= COPY_WARN:
            flags.append(f"⚠ {c.longest_copy} words in a row copied from an example")
        lines += [
            "```text",
            r.text,
            "```",
            f"{r.length}/{r.char_limit} chars · {r.model_version} · {len(r.examples)} examples · "
            f"longest shared run {c.longest_copy} words · "
            + ("✅ checks pass" if c.ok else " · ".join(flags)),
            "",
            "<details><summary>Closest examples</summary>",
            "",
            *[f"- {e.similarity:.3f} · {' '.join(e.text.split())[:140]}" for e in r.examples[:3]],
            "",
            "</details>",
            "",
        ]

    lines[1:1] = [
        f"**{passed}/{len(topics)} drafts pass all checks** · "
        f"models: {', '.join(sorted(models)) or 'none'}",
        "",
    ]
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{stamp}-{platform}.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path
