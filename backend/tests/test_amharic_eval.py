"""FR-56 Amharic blind test: the parts that need no database or AI."""

import csv
import json
import random

import pytest

from app import amharic_eval as ae
from app.core.config import Settings
from app.models import PlatformProfile
from app.services.drafting import amharic_first, build_prompt, with_amharic_rules
from app.services.retrieval import Example

REPO = ae.REPO

PROFILE = PlatformProfile(
    platform="telegram", char_limit=4096, counting_rule="plain",
    tone_notes="Relaxed.", structure_notes="Short lines.",
)  # fmt: skip


def test_candidates_are_a_baseline_plus_every_model_with_the_rules():
    s = Settings(amharic_eval_models="google:flash-x, google:pro-y")
    names = [(c.model, c.amharic_rules) for c in ae.candidates(s)]
    assert names == [
        ("google:flash-x", False),  # baseline: today's prompt
        ("google:flash-x", True),
        ("google:pro-y", True),
    ]
    assert len({c.name for c in ae.candidates(s)}) == 3


def test_the_example_cases_file_loads_and_covers_every_kind():
    cases = ae.load_cases(REPO / "samples" / "amharic_eval_cases.example.json")
    assert {c.kind for c in cases} == set(ae.KINDS)


def test_bad_cases_are_refused(tmp_path):
    def load(cases):
        p = tmp_path / "c.json"
        p.write_text(json.dumps({"cases": cases}), encoding="utf-8")
        return ae.load_cases(p)

    with pytest.raises(ValueError, match="kind"):
        load([{"id": "a", "kind": "poem", "platform": "x", "topic": "t"}])
    with pytest.raises(ValueError, match="rewrite needs"):
        load([{"id": "a", "kind": "rewrite", "platform": "x", "topic": "t"}])
    with pytest.raises(ValueError, match="unique"):
        load([{"id": "a", "kind": "amharic", "platform": "x", "topic": "t"}] * 2)


def test_blind_labels_hide_the_names_and_shuffle_per_case():
    names = ["baseline", "flash + rules", "pro + rules"]
    rng = random.Random(1)
    orders = [ae.blind(names, rng) for _ in range(20)]
    assert all(list(o) == ["A", "B", "C"] and sorted(o.values()) == sorted(names) for o in orders)
    assert len({tuple(o.values()) for o in orders}) > 1  # not the same order every case


def test_amharic_rules_go_just_before_the_output_instruction():
    prompt = with_amharic_rules(build_prompt(PROFILE, [], "ዛሬ ቦቱን ጨረስኩ።"))
    rules, output = prompt.index("## Writing in Amharic"), prompt.index("## Output")
    assert prompt.index("## Facts you may use") < rules < output
    assert prompt.count("## Writing in Amharic") == 1


def test_amharic_posts_come_first_and_ties_keep_their_order():
    posts = [
        Example(None, "Shipped the bot today", 0.9, False),
        Example(None, "ዛሬ ቦቱን ጨረስኩ", 0.8, False),
        Example(None, "ዛሬ React ላይ ሰራሁ", 0.7, False),
        Example(None, "Another English post", 0.6, False),
    ]
    order = [e.text for e in amharic_first(posts)]
    assert order == [
        "ዛሬ ቦቱን ጨረስኩ",
        "ዛሬ React ላይ ሰራሁ",
        "Shipped the bot today",
        "Another English post",
    ]


class _About:
    summary_card, discipline, audience_kind, main_goal = "", "", "", ""


def test_a_rewrite_asks_for_amharic_and_carries_the_draft_as_approved_facts():
    case = ae.Case("rw", "rewrite", "telegram", "Finished login", "Shipped a cleaner login.")
    base, rules = ae.candidates(Settings(amharic_eval_models="google:m"))
    for cand in (base, rules):
        prompt = ae.prompt_for_case(case, cand, PROFILE, [], _About(), "")
        assert "Write the post in Amharic." in prompt
        assert "Shipped a cleaner login." in prompt and "approved by the writer" in prompt
        assert ("## Writing in Amharic" in prompt) is cand.amharic_rules


def _sheet(rows):
    return [
        {"case": c, "label": label, "grammar": g, "natural": g, "tone": g,
         "sounds_like_me": g, "invented_fact": inv}
        for c, label, g, inv in rows
    ]  # fmt: skip


KEY = {"c1": {"A": "base", "B": "rules", "C": "pro"}, "c2": {"A": "pro", "B": "base", "C": "rules"}}


def test_score_averages_judges_and_counts_invented_facts():
    judge1 = _sheet([("c1", "A", "3", ""), ("c1", "B", "4", ""), ("c1", "C", "5", "y")])
    judge2 = _sheet([("c2", "B", "3", ""), ("c2", "C", "5", "no"), ("c2", "A", "", "")])
    results = {r.candidate: r for r in ae.score(KEY, [judge1, judge2])}
    assert results["base"].mean == 3 and results["base"].judged == 2
    assert results["rules"].mean == 4.5 and results["rules"].invented == 0
    assert results["pro"].judged == 1 and results["pro"].invented == 1  # unscored row skipped


def test_scores_outside_one_to_five_are_refused():
    with pytest.raises(ValueError, match="1–5"):
        ae.score(KEY, [_sheet([("c1", "A", "7", "")])])


def test_winner_must_lead_by_half_a_point_with_no_invented_facts():
    R = ae.Result
    assert ae.winner([R("pro", 4.6, 0, 5), R("base", 4.0, 0, 5)], "base") == "pro"
    assert ae.winner([R("pro", 4.4, 0, 5), R("base", 4.0, 0, 5)], "base") == "base"
    # The best one invented a fact, so the next one that qualifies wins.
    results = [R("pro", 4.9, 1, 5), R("rules", 4.5, 0, 5), R("base", 4.0, 0, 5)]
    assert ae.winner(results, "base") == "rules"
    with pytest.raises(ValueError, match="baseline"):
        ae.winner([R("pro", 4.9, 0, 5)], "base")


def test_report_reads_the_run_folder_and_the_sheets(tmp_path, monkeypatch):
    monkeypatch.setattr(ae, "candidates", lambda: [ae.Candidate("base", "google:m", False)])
    (tmp_path / "key.json").write_text(json.dumps({"c1": {"A": "base", "B": "x"}}))
    sheet = tmp_path / "judge.csv"
    with sheet.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ae.SHEET_COLUMNS)
        w.writeheader()
        for label, g in (("A", "3"), ("B", "4")):
            w.writerow({"case": "c1", "label": label, **dict.fromkeys(ae.SCORES, g)})
    out = ae.report(tmp_path, [sheet])
    assert "Winner: x" in out
