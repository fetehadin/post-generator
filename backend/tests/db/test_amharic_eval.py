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


def _setup(make_user, monkeypatch):
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
    return user


def _read(out):
    key = json.loads((out / "key.json").read_text(encoding="utf-8"))
    with (out / "sheet.csv").open(encoding="utf-8-sig") as f:
        return key, list(csv.DictReader(f))


def test_run_writes_a_blind_sheet_and_a_key_that_match(make_user, tmp_path, monkeypatch):
    user = _setup(make_user, monkeypatch)
    models = {"google:flash": FakeModel("flash"), "google:pro": FakeModel("pro")}
    cases = [ae.Case("am-01", "amharic", "telegram", "ዛሬ ቦቱን ጨረስኩ።")]

    out, left = ae.run(user, cases, tmp_path, client_for=models.__getitem__, seed=3, log=print)

    key, rows = _read(out)
    assert left == 0
    assert sorted(r["label"] for r in rows) == ["A", "B", "C"]
    assert sorted(key["am-01"].values()) == ["base", "flash+rules", "pro+rules"]
    sheet_text = (out / "sheet.csv").read_text(encoding="utf-8-sig")
    assert "base" not in sheet_text and "rules" not in sheet_text  # names stay hidden
    # Flash ran twice: once with today's prompt, once with the Amharic rules.
    with_rules = [p for p in models["google:flash"].prompts if "## Writing in Amharic" in p]
    assert len(models["google:flash"].prompts) == 2 and len(with_rules) == 1
    # With the rules, the Amharic post is the first voice example.
    assert with_rules[0].index("ዛሬ ቦቱን ጨረስኩ\n") < with_rules[0].index("Shipped the bot")


def test_a_model_out_of_quota_stops_the_run_and_resume_finishes_it(
    make_user, tmp_path, monkeypatch
):
    user = _setup(make_user, monkeypatch)
    pro = FakeModel("pro", fail=True)
    models = {"google:flash": FakeModel("flash"), "google:pro": pro}
    cases = [
        ae.Case("am-01", "amharic", "telegram", "ዛሬ ቦቱን ጨረስኩ።"),
        ae.Case("am-02", "amharic", "telegram", "ዛሬ ካላንደሩን ጨረስኩ።"),
    ]
    waits: list[float] = []

    out, left = ae.run(
        user, cases, tmp_path, client_for=models.__getitem__, seed=3, log=print,
        sleep=waits.append,
    )  # fmt: skip

    assert left == 2  # nothing half-done is kept: a case is saved only with all its drafts
    assert waits == [ae.WAIT_SECONDS] * (ae.TRIES - 1)  # it was waited for first
    assert _read(out)[1] == []

    pro.fail = False  # the next day
    out2, left = ae.run(user, cases, tmp_path, client_for=models.__getitem__, log=print, resume=out)
    key, rows = _read(out2)
    assert out2 == out and left == 0
    assert [r["case"] for r in rows] == ["am-01"] * 3 + ["am-02"] * 3
    assert set(key) == {"am-01", "am-02"}
    assert not any(r["draft"].startswith("(not generated") for r in rows)
