"""The Amharic blind test (FR-56): which free model and prompt write the best Amharic.

    python -m app.dev amharic-eval [--cases FILE] [--resume RUN_DIR]
    python -m app.dev amharic-score RUN_DIR SHEET.csv [SHEET.csv ...]

`amharic-eval` writes one draft per case for every candidate, in the dev user's voice:
- the baseline: the first model in AMHARIC_EVAL_MODELS with today's prompt;
- every model in AMHARIC_EVAL_MODELS with the Amharic rules (ai/prompts/amharic.md) and the
  user's most-Amharic posts first.

Each model runs alone, with no fallback, so a draft really comes from the model it says.
The drafts are shuffled per case and labelled A, B, C… so the judges can't tell which model
wrote which. The run folder (in samples/private/, git-ignored: it holds the user's real
posts' voice) gets:
- sheet.csv: one row per draft for the judges to score; each judge fills their own copy;
- drafts.md: the same drafts, easier to read;
- key.json: which label is which candidate. Don't open it before scoring.

`amharic-score` averages the sheets and names the winner by FR-56's rule.

Cases file: {"cases": [{"id", "kind": "amharic" | "mixed" | "rewrite", "platform",
"topic", "draft"}]}. `draft` is only for rewrites: the English draft to write again in
Amharic, from the same facts in `topic`. Shape examples (FR-41) are left out: they are for
structure, the same for every candidate, and need the local model.
"""

import csv
import json
import random
import time
import uuid
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import partial
from pathlib import Path

from app.ai.client import AIClient, AIUnavailable, EmbeddingUnavailable
from app.checks import invented_numbers
from app.core.config import Settings, get_settings
from app.core.db import user_session
from app.counting import post_length
from app.models import PlatformProfile
from app.services.drafting import (
    amharic_first,
    build_prompt,
    clean_output,
    who_is_writing,
    with_amharic_rules,
)
from app.services.profile import get_profile
from app.services.retrieval import find_examples
from app.services.voice import voice_card

REPO = Path(__file__).resolve().parents[2]
CASES = REPO / "samples" / "private" / "amharic-eval" / "cases.json"
KINDS = ("amharic", "mixed", "rewrite")
SCORES = ("grammar", "natural", "tone", "sounds_like_me")
SHEET_COLUMNS = (
    "case",
    "kind",
    "platform",
    "label",
    "draft",
    "length",
    "auto_numbers_not_in_topic",
    *SCORES,
    "invented_fact",
    "notes",
)
MIN_LEAD = 0.5  # FR-56: how much better than the baseline the winner must be
# A long Amharic draft can take a minute on a free model. The eval has no user waiting, so
# each call gets longer than the app's 40 s deadline, and a busy or paused model is waited
# for and tried again rather than written down as a failed draft.
EVAL_DEADLINE_SECONDS = 180
TRIES = 4
WAIT_SECONDS = 65  # a little longer than the circuit breaker's usual pause


@dataclass(frozen=True)
class Candidate:
    name: str  # e.g. "google:gemini-pro-latest + amharic rules"
    model: str  # "provider:model", run alone
    amharic_rules: bool


@dataclass(frozen=True)
class Case:
    id: str
    kind: str
    platform: str
    topic: str
    draft: str = ""


def candidates(settings: Settings | None = None) -> list[Candidate]:
    models = [f"{p}:{m}" for p, m in (settings or get_settings()).amharic_eval_chain]
    if not models:
        raise ValueError("AMHARIC_EVAL_MODELS is empty")
    baseline = Candidate(f"{models[0]} (today's prompt)", models[0], False)
    return [baseline] + [Candidate(f"{m} + amharic rules", m, True) for m in models]


def load_cases(path: Path) -> list[Case]:
    raw = json.loads(path.read_text(encoding="utf-8"))["cases"]
    cases = [Case(**c) for c in raw]
    for c in cases:
        if c.kind not in KINDS:
            raise ValueError(f"case {c.id}: kind must be one of {', '.join(KINDS)}")
        if c.kind == "rewrite" and not c.draft.strip():
            raise ValueError(f"case {c.id}: a rewrite needs the English draft in 'draft'")
    if len({c.id for c in cases}) != len(cases):
        raise ValueError("case ids must be unique")
    return cases


def blind(names: list[str], rng: random.Random) -> dict[str, str]:
    """Labels A, B, C… for one case, in a fresh random order: label → candidate name."""
    order = names[:]
    rng.shuffle(order)
    return {chr(65 + i): name for i, name in enumerate(order)}


def prompt_for_case(
    case: Case,
    candidate: Candidate,
    profile: PlatformProfile,
    examples,
    about,
    voice: str,
) -> str:
    """The prompt drafting would build today, plus the Amharic rules for that candidate.
    A rewrite asks for Amharic, as the language setting (FR-24) does today."""
    rewrite = case.kind == "rewrite"
    prompt = build_prompt(
        profile,
        amharic_first(examples) if candidate.amharic_rules else examples,
        case.topic,
        about.summary_card,
        "Amharic" if rewrite else "auto",
        voice,
        adapt_from=case.draft if rewrite else None,
        adapt_approved=rewrite,  # the writer's own draft: its facts are theirs
        who=who_is_writing(about.discipline, about.audience_kind, about.main_goal),
    )
    return with_amharic_rules(prompt) if candidate.amharic_rules else prompt


def _profile(user_id: uuid.UUID, platform: str) -> PlatformProfile:
    with user_session(user_id) as s:
        profile = s.get(PlatformProfile, platform)
        if profile is None:
            raise ValueError(f"Unknown platform: {platform}")
        s.expunge(profile)
        return profile


def _client_for(model: str) -> AIClient:
    """A client whose whole chain is this one model, on the app's keys."""
    update = {
        "generation_models": model,
        "generation_deadline_seconds": EVAL_DEADLINE_SECONDS,
        "ai_timeout_seconds": EVAL_DEADLINE_SECONDS,
    }
    return AIClient(settings=get_settings().model_copy(update=update))


def generate_patiently(
    client: AIClient,
    prompt: str,
    sleep: Callable[[float], None] = time.sleep,
    log: Callable[[str], None] = print,
) -> str:
    """One draft, tried up to TRIES times with a wait between: a timeout or a 429 then pauses
    the model, and without waiting every later case would fail too. Raises the last error."""
    return _patiently(
        lambda: clean_output(client.generate(prompt, purpose="draft").text), sleep, log
    )


def _patiently(call: Callable[[], object], sleep, log) -> object:
    """Any AI call (an embedding too), tried TRIES times with a wait between."""
    for attempt in range(1, TRIES + 1):
        try:
            return call()
        except (AIUnavailable, EmbeddingUnavailable) as e:
            if attempt == TRIES:
                raise
            log(f"  busy ({str(e)[:80]}), waiting {WAIT_SECONDS}s")
            sleep(WAIT_SECONDS)
    raise AssertionError("unreachable")


def _write(out: Path, cases: list[Case]) -> None:
    """sheet.csv, drafts.md and key.json from every finished case, in the cases file's order."""
    rows, key, md = [], {}, [f"# Amharic blind test · {out.name}", ""]
    for case in cases:
        path = out / "cases" / f"{case.id}.json"
        if not path.exists():
            continue
        done = json.loads(path.read_text(encoding="utf-8"))
        key[case.id] = done["labels"]
        md += [f"## {case.id} · {case.kind} · {case.platform}", f"> {case.topic}", ""]
        for row in done["rows"]:
            rows.append(row)
            md += [f"### {row['label']}", "```text", row["draft"], "```", row["length"], ""]
    with (out / "sheet.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=SHEET_COLUMNS)
        w.writeheader()
        w.writerows(rows)
    (out / "drafts.md").write_text("\n".join(md), encoding="utf-8")
    (out / "key.json").write_text(json.dumps(key, indent=2, ensure_ascii=False), encoding="utf-8")


def run(
    user_id: uuid.UUID,
    cases: list[Case],
    out_root: Path,
    client_for: Callable[[str], AIClient] = _client_for,
    seed: int | None = None,
    log: Callable[[str], None] = print,
    sleep: Callable[[float], None] = time.sleep,
    resume: Path | None = None,
) -> tuple[Path, int]:
    """Draft every case not done yet; returns (run folder, cases still left).

    Each case is saved in `cases/<id>.json` as soon as all its drafts exist, and the sheet is
    rewritten after it. When a model is still down after every try (a daily quota, the
    network), the run stops there; `resume` with the same folder carries on later. The free
    Gemini tier allows about 20 drafts a day, so a full run takes several days."""
    cands = candidates()
    clients = {c.model: client_for(c.model) for c in cands}
    by_name = {c.name: c for c in cands}
    rng = random.Random(seed)
    about = get_profile(user_id)
    out = resume or out_root / datetime.now(UTC).strftime("%Y-%m-%d-%H%M")
    (out / "cases").mkdir(parents=True, exist_ok=True)
    todo = [c for c in cases if not (out / "cases" / f"{c.id}.json").exists()]

    for n, case in enumerate(todo):
        try:
            profile = _profile(user_id, case.platform)
            first = clients[cands[0].model]
            find = partial(find_examples, user_id, case.platform, case.topic, ai=first)
            examples = _patiently(find, sleep, log)
            voice = voice_card(user_id, case.platform)
            labels = blind([c.name for c in cands], rng)
            rows = []
            for label, name in labels.items():
                cand = by_name[name]
                prompt = prompt_for_case(case, cand, profile, examples, about, voice)
                text = generate_patiently(clients[cand.model], prompt, sleep, log)
                length = post_length(text, profile.counting_rule)
                facts = f"{case.topic}\n{about.summary_card}\n{case.draft}"
                rows.append(
                    {
                        "case": case.id,
                        "kind": case.kind,
                        "platform": case.platform,
                        "label": label,
                        "draft": text,
                        "length": f"{length}/{profile.char_limit}",
                        "auto_numbers_not_in_topic": ", ".join(invented_numbers(text, facts)),
                    }
                )
        except (AIUnavailable, EmbeddingUnavailable) as e:
            log(f"stopped at {case.id}: {str(e)[:160]}")
            _write(out, cases)
            return out, len(todo) - n
        done = {"labels": labels, "rows": rows}
        (out / "cases" / f"{case.id}.json").write_text(
            json.dumps(done, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        _write(out, cases)
        log(f"{case.id}: {len(labels)} drafts")

    _write(out, cases)
    return out, 0


# --- scoring -------------------------------------------------------------------------------


@dataclass(frozen=True)
class Result:
    candidate: str
    mean: float  # average of the four scores over every judged draft
    invented: int  # drafts a judge marked as inventing a fact
    judged: int  # rows with all four scores


def _yes(value: str) -> bool:
    return value.strip().lower() in {"y", "yes", "1", "true", "x"}


def score(key: dict[str, dict[str, str]], sheets: Iterable[list[dict[str, str]]]) -> list[Result]:
    totals: dict[str, list[float]] = {}
    invented: dict[str, int] = {}
    judged: dict[str, int] = {}
    for sheet in sheets:
        for row in sheet:
            name = key.get(row.get("case", ""), {}).get(row.get("label", ""))
            if name is None:
                raise ValueError(f"row not in the key: case {row.get('case')} {row.get('label')}")
            values = [(row.get(s) or "").strip() for s in SCORES]
            if not all(values):
                continue  # not scored yet
            nums = [float(v) for v in values]
            if any(not 1 <= n <= 5 for n in nums):
                raise ValueError(f"scores are 1–5: case {row['case']} {row['label']}")
            totals.setdefault(name, []).extend(nums)
            judged[name] = judged.get(name, 0) + 1
            invented[name] = invented.get(name, 0) + _yes(row.get("invented_fact") or "")
    return sorted(
        (Result(n, sum(v) / len(v), invented.get(n, 0), judged[n]) for n, v in totals.items() if v),
        key=lambda r: r.mean,
        reverse=True,
    )


def winner(results: list[Result], baseline: str) -> str:
    """FR-56: the best candidate that beats the baseline by at least MIN_LEAD with zero
    invented facts. Otherwise the baseline stays: nothing changes."""
    base = next((r for r in results if r.candidate == baseline), None)
    if base is None:
        raise ValueError("the baseline has no scores")
    for r in results:  # best first
        if r.candidate != baseline and r.invented == 0 and r.mean >= base.mean + MIN_LEAD:
            return r.candidate
    return baseline


def read_sheet(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def report(run_dir: Path, sheet_paths: list[Path]) -> str:
    key = json.loads((run_dir / "key.json").read_text(encoding="utf-8"))
    results = score(key, [read_sheet(p) for p in sheet_paths])
    baseline = candidates()[0].name
    lines = [f"{'candidate':55} mean  invented  judged"]
    lines += [f"{r.candidate:55} {r.mean:.2f}  {r.invented:8}  {r.judged:6}" for r in results]
    best = winner(results, baseline)
    lines.append(
        f"\nWinner: {best}"
        if best != baseline
        else f"\nNo candidate beat the baseline by {MIN_LEAD} with zero invented facts: "
        "keep today's setup."
    )
    return "\n".join(lines)
