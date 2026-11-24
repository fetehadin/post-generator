"""Profile strength (FR-53): a weighted percentage and the next step."""

from app.services.strength import ITEMS, score


def test_the_weights_add_up_to_100_and_nothing_done_is_zero():
    percent, items = score({})
    assert percent == 0 and sum(i.weight for i in items) == 100
    assert [i.id for i in items] == [i[0] for i in ITEMS]


def test_a_new_user_starts_low_and_filling_the_profession_adds_10(api):
    before = api.get("/api/v1/me/profile-strength").json()
    assert before["percent"] == 0
    assert before["items"][0] == {
        "id": "profession",
        "label": "Add your profession",
        "weight": 10,
        "done": False,
        "tab": "about",
        "section": "field-discipline",
    }
    api.put(
        "/api/v1/profile",
        json={
            "discipline": "student, developer",
            "focus": "Public speaking",
            "projects": [{"name": "Voxlace", "line": "", "link": "voxlace.app", "status": ""}],
        },
    )
    after = api.get("/api/v1/me/profile-strength").json()
    done = {i["id"] for i in after["items"] if i["done"]}
    assert done == {"profession", "getting_better", "projects"}
    assert after["percent"] == 25


def test_project_links_and_portfolio_are_saved_as_full_addresses(api):
    p = api.put(
        "/api/v1/profile",
        json={
            "portfolio_url": "www.abdunuri.me",
            "projects": [{"name": "Gagari", "line": "", "link": "gagari.app", "status": ""}],
        },
    ).json()
    assert p["portfolio_url"] == "https://www.abdunuri.me"
    assert p["projects"][0]["link"] == "https://gagari.app"
