import json

from app.evals import TOPICS, invented_numbers, longest_shared_run


def test_ten_topics_with_unique_ids():
    topics = json.loads(TOPICS.read_text(encoding="utf-8"))["topics"]
    assert len(topics) == 10
    assert len({t["id"] for t in topics}) == 10
    assert all(t["topic"].strip() and t["checks"].strip() for t in topics)


def test_invented_numbers_flags_only_new_digits():
    topic = "Day 6 of #10DaysGrind: 81 tests passing."
    assert invented_numbers("6/10 — 81 tests ✅", topic) == []
    assert invented_numbers("Day 6: 81 tests, 500 users!", topic) == ["500"]
    assert invented_numbers("We hit 1000 subscribers", "a new subscriber milestone") == ["1000"]


def test_longest_shared_run_counts_consecutive_words():
    assert longest_shared_run("shipped the parser today", "I shipped the parser yesterday") == 3
    assert (
        longest_shared_run("Shipped. The parser!", "shipped the parser") == 3
    )  # case/punct ignored
    assert longest_shared_run("nothing alike", "completely different") == 0


def test_list_numbers_are_not_invented_facts():
    draft = "Advice:\n1. Start small\n2) Build projects\n3. Share 10 of them"
    assert invented_numbers(draft, "start small, build, share") == ["10"]
