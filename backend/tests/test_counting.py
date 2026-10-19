import pytest

from app.counting import post_length, x_weighted_length


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("hello", 5),
        ("see https://example.com/a/very/long/path/that/is/way/over/23", 4 + 23),
        ("two links https://a.co and https://b.co", 15 + 46),
        ("shipped 🚀", 8 + 2),
        ("ok ✅", 3 + 2),
        ("日本語", 6),
        ("👍🏽", 4),  # emoji + skin tone modifier
        ("👨‍💻", 4),  # joiner adds nothing
        ("❤️", 2),  # variation selector adds nothing
        ("ሰላም Addis", 9),  # Ethiopic counts as one
    ],
)
def test_x_weighted_length(text, expected):
    assert x_weighted_length(text) == expected


def test_post_length_uses_the_platform_rule():
    text = "go https://example.com/x 🚀"
    assert post_length(text, "x_weighted") == 3 + 23 + 1 + 2
    assert post_length(text, "plain") == len(text)
