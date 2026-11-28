"""FR-56 Amharic blind test: a whole run with fake models and a real database."""

import csv
import json

from app import amharic_eval as ae
from app.ai.client import AIUnavailable, GenerationResult
from tests.db.test_drafting import add_post, vec


class FakeModel:
    def __init__(self, model, fail=False):
        self.model, self.fail = model, fail
        self.prompts: list[str] = []

    def embed_query(self, text):
        return vec(1)

    def generate(self, prompt, purpose="draft", temperature=0.9):
        if self.fail:
            raise AIUnavailable("busy")
        self.prompts.append(prompt)
        return GenerationResult(f"ዛሬ ጨረስኩ ({self.model})", self.model, "google", self.model)


def test_run_writes_a_blind_sheet_and_a_key_that_match(make_user, tmp_path, monkeypatch):
    user = make_user()
    # Different vectors (near-copies are dropped); the English post is closer to the topic.
    add_post(user, "1", "ዛሬ ቦቱን ጨረስኩ", v=vec(0.6, 0.8))
    add_post(user, "2", "Shipped the bot today", v=vec(1, 0.1))
    monkeypatch.setattr(
        ae, "candidates", lambda: [
            ae.Candidate("base", "google:flash", False),
            ae.Candidate("flash+rules", "google:flash", True),
            ae.Candidate("pro+rules", "google:pro", True),
        ],
    )  # fmt: skip
    models = {"google:flash": FakeModel("flash"), "google:pro": FakeModel("pro", fail=True)}
    cases = [ae.Case("am-01", "amharic", "telegram", "ዛሬ ቦቱን ጨረስኩ።")]

    out = ae.run(user, cases, tmp_path, client_for=models.__getitem__, seed=3, log=lambda _: None)

    key = json.loads((out / "key.json").read_text(encoding="utf-8"))
    with (out / "sheet.csv").open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    assert sorted(r["label"] for r in rows) == ["A", "B", "C"]
    assert sorted(key["am-01"].values()) == ["base", "flash+rules", "pro+rules"]
    sheet_text = (out / "sheet.csv").read_text(encoding="utf-8-sig")
    assert "base" not in sheet_text and "rules" not in sheet_text  # names stay hidden
    by_name = {key["am-01"][r["label"]]: r["draft"] for r in rows}
    assert by_name["pro+rules"].startswith("(not generated")  # one model down: the run goes on
    # Flash ran twice: once with today's prompt, once with the Amharic rules.
    with_rules = [p for p in models["google:flash"].prompts if "## Writing in Amharic" in p]
    assert len(models["google:flash"].prompts) == 2 and len(with_rules) == 1
    # With the rules, the Amharic post is the first voice example.
    assert with_rules[0].index("ዛሬ ቦቱን ጨረስኩ\n") < with_rules[0].index("Shipped the bot")
