import json
from pathlib import Path

import pytest

from app.counting import post_length, x_weighted_length

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "samples" / "x_counter_cases.json").read_text("utf-8")
)["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["why"] for c in CASES])
def test_x_weighted_length_matches_the_shared_cases(case):
    """The frontend runs the same file, so both sides always agree."""
    assert x_weighted_length(case["text"]) == case["expected"]


def test_post_length_uses_the_platform_rule():
    text = "go https://example.com/x 🚀"
    assert post_length(text, "x_weighted") == 3 + 23 + 1 + 2
    assert post_length(text, "plain") == len(text)
