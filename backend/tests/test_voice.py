"""Voice stats and hand-edit keeping: pure functions, no database (FR-5, FR-26)."""

from app.services.voice import THIN, kept_lines, measure, merge_kept


def test_stats_from_posts():
    texts = [
        "Shipped the importer 🚀\n#python #buildinpublic",
        "ዛሬ አዲስ ነገር ተማርኩ\nhttps://example.com",
        "What should I build next?",
        "Short line.\nSecond line.\nThird line.",
    ]
    s = measure(texts, "plain")
    assert s.post_count == 4 and s.thin
    assert (s.emoji_share, s.hashtag_share, s.link_share) == (0.25, 0.25, 0.25)
    assert (s.question_share, s.ethiopic_share) == (0.25, 0.25)
    assert s.top_hashtags == ["#python", "#buildinpublic"]
    assert s.median_lines == 2


def test_x_stats_use_the_weighted_count():
    # Ethiopic weighs 2 on X (twitter-text v3); plain counts each character once.
    assert measure(["ሰላም"], "x_weighted").median_length == 6
    assert measure(["ሰላም"], "plain").median_length == 3


def test_no_posts_means_empty_and_thin_stats():
    s = measure([], "plain")
    assert s.post_count == 0 and s.thin and s.top_hashtags == []


def test_twenty_posts_is_enough():
    assert not measure(["A post that is long enough."] * THIN, "plain").thin


def test_hand_edited_lines_are_found():
    ai = "- Short posts.\n- Uses emoji."
    card = "- Short posts.\n- Never uses emoji, ever.\n- Signs off with 'ship it'."
    assert kept_lines(card, ai) == ["- Never uses emoji, ever.", "- Signs off with 'ship it'."]
    assert kept_lines(ai, ai) == []


def test_kept_lines_survive_even_if_the_model_drops_them():
    new = "- Two to four lines.\n- Signs off with 'ship it'."
    merged = merge_kept(new, ["- Signs off with 'ship it'.", "- Never uses emoji, ever."])
    assert merged.splitlines() == [
        "- Two to four lines.",
        "- Signs off with 'ship it'.",
        "- Never uses emoji, ever.",
    ]
