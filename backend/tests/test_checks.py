from app.checks import invented_numbers, longest_copy, longest_shared_run, shared_run


def test_shared_run_finds_the_longest_phrase_ignoring_case_and_punctuation():
    assert shared_run("We shipped it. Big Day today!", "big day today, finally") == [
        "big",
        "day",
        "today",
    ]


def test_nothing_shared():
    assert longest_shared_run("alpha beta", "gamma delta") == 0
    assert longest_copy("alpha beta", []) == []


def test_longest_copy_picks_the_worst_example():
    assert len(longest_copy("one two three four", ["one two", "two three four"])) == 3


def test_amharic_words_count_as_words():
    assert longest_shared_run("ዛሬ ትንሽ ድል ነው", "ትንሽ ድል") == 2


def test_numbers_in_hashtags_handles_links_and_lists_are_not_facts():
    draft = "1. Day 7 of #10DaysGrind @fete2026 https://t.me/x/42 and 412 posts"
    assert invented_numbers(draft, "412 posts in") == ["7"]
