"""GitHub → daily dev drafts (FR-14). A fake GitHub and a fake AI; no network."""

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text

from app.ai.client import GenerationResult
from app.core import secrets
from app.core.config import get_settings
from app.core.db import user_session
from app.models import GitHubConnection, GitHubDigest, GitHubItem, GitHubRepo, Thread, User
from app.services import github
from app.services.github_api import GitHubError, GitHubUser
from app.services.github_scrub import scrub

LOGIN, GH_ID = "octo", 4242
# A Friday, 20:00 in Addis Ababa (UTC+3): past the 19:00 suggestion hour.
FRIDAY_EVENING = datetime(2026, 11, 20, 17, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def github_on(monkeypatch):
    cfg = get_settings()
    for name, value in {
        "github_client_id": "cid",
        "github_client_secret": "csecret",
        "github_app_id": "1",
        "github_app_slug": "voxlace-test",
        "github_app_private_key": "unused-in-tests",
        "github_webhook_secret": "whsecret",
        "ai_key_encryption_keys": secrets.new_key(),
    }.items():
        monkeypatch.setattr(cfg, name, value)


class FakeGitHub:
    def __init__(self, installation_owner=GH_ID, events=(), repos=None, commits=None, prs=()):
        self.installation_owner = installation_owner
        self._events, self._repos = list(events), repos or {}
        self._commits, self._prs = commits or {}, list(prs)

    def exchange_code(self, code):
        if code == "bad":
            raise GitHubError(401, "bad_verification_code")
        return "gho_" + "t" * 36

    def user(self, token):
        return GitHubUser(GH_ID, LOGIN)

    def installation(self, installation_id):
        return {"account": {"id": self.installation_owner, "type": "User", "login": "x"}}

    def installation_token(self, installation_id):
        return "ghs_install"

    def installation_repos(self, token):
        return [{"id": 7, "full_name": "octo/secret-app", "private": True}]

    def languages(self, full_name, token):
        return ["Python"]

    def events(self, login, token):
        return self._events

    def repo(self, name, token):
        return self._repos[name]

    def commits(self, name, login, since, token):
        return self._commits.get(name, [])

    def commit_stats(self, name, sha, token):
        return {"files_changed": 2, "additions": 10, "deletions": 1, "deps_only": False}

    def pull_requests(self, login, since, token):
        return self._prs

    def pull(self, name, number, token):
        return next(p for p in self._prs if p["number"] == number) | {"merged": True}


class JudgeAI:
    """Judges every GitHub day worth it; writes plain drafts."""

    def __init__(self, worth=True):
        self.worth, self.purposes = worth, []

    def embed_query(self, text):
        return [1.0] + [0.0] * 767

    def generate(self, prompt, purpose="draft", temperature=0.9):
        self.purposes.append(purpose)
        if purpose == "github_judge":
            body = {"worth_posting": self.worth, "reason": "A real step.", "angle": "The new login"}
            return GenerationResult(json.dumps(body), "g", "groq", "g")
        return GenerationResult("Shipped the new login flow today.", "g", "groq", "g")


def connected(make_user, tz="Africa/Addis_Ababa"):
    user = make_user()
    with user_session(user) as s:
        s.get(User, user).timezone = tz
    github.finish_connect(user, "code", github.make_state(user, "connect"), FakeGitHub())
    return user


def add_item(user, title, kind="commit", when=None, private=False, mention=None, **extra):
    when = when or FRIDAY_EVENING - timedelta(hours=3)
    with user_session(user) as s:
        repo = github._repo(
            s, user, {"id": 99 if private else 1, "full_name": "octo/app", "private": private}
        )
        if mention is not None:
            repo.mention_ok = mention
        github._item(s, user, repo, kind, uuid.uuid4().hex, title, extra.pop("body", ""), when,
                     **extra)  # fmt: skip


# ---- stage 1 rules (no AI)


def _items(*specs):
    repo = GitHubRepo(id=uuid.uuid4(), full_name="o/r", repo_created_at=None)
    out = []
    for title, kind, state, body, deps in specs:
        out.append(GitHubItem(id=uuid.uuid4(), repo_id=repo.id, kind=kind, title=title,
                              body=body, state=state, deps_only=deps))  # fmt: skip
    return out, {repo.id: repo}


def test_noise_scores_nothing():
    items, repos = _items(
        ("Merge pull request #3 from x/y", "commit", None, "", False),
        ("wip", "commit", None, "", False),
        ("fix typo in readme", "commit", None, "", False),
        ("Revert 'oops'", "commit", None, "", False),
        ("format with ruff", "commit", None, "", False),
        ("update deps", "commit", None, "", True),
    )
    result = github.score(items, repos, get_settings().github_weights, FRIDAY_EVENING)
    assert result.points == 0 and result.kept == []


def test_signals_add_up_with_configured_weights():
    items, repos = _items(
        ("Add GitHub drafts", "pr", "merged", "x" * 120, False),
        ("Implement scoring", "commit", None, "", False),
        ("Add tests", "commit", None, "", False),
        ("Wire the webhook", "commit", None, "", False),
    )
    weights = {"merged_pr": 5, "described_pr": 2, "feature": 2, "theme": 2, "commit": 1}
    result = github.score(items, repos, weights, FRIDAY_EVENING)
    # merged 5 + described 2 + 3 feature titles (2 each, max 3) + theme 2 + 3 commits = 18
    assert result.points == 5 + 2 + 6 + 2 + 3


def test_streaks_and_first_activity_count():
    items, repos = _items(("Build the importer", "commit", None, "", False))
    w = {"milestone": 3, "streak": 3}
    assert github.score(items, repos, w, FRIDAY_EVENING, first_ever=True, streak_days=5).points == 6


def test_secrets_are_scrubbed():
    assert scrub("token ghp_" + "a" * 36 + " leaked") == "token [removed] leaked"
    fake = "api_key=" + "x" * 12  # built, so it never looks like a real key in the repo
    assert scrub(fake) == "api_key=[removed]"
    assert scrub("Add login flow (#12)") == "Add login flow (#12)"


# ---- connecting


def test_connecting_stores_the_token_sealed(make_user, owner_engine):
    user = connected(make_user)
    with owner_engine.connect() as c:
        sealed = c.scalar(text("SELECT sealed_token FROM github_connections WHERE user_id=:u"),
                          {"u": user})  # fmt: skip
    assert "gho_" not in sealed and secrets.unseal(sealed).startswith("gho_")
    assert github.status(user).login == LOGIN


def test_someone_elses_state_is_refused(make_user):
    me, other = make_user(), make_user()
    with pytest.raises(github.GitHubFlowError, match="isn't yours"):
        github.finish_connect(me, "code", github.make_state(other, "connect"), FakeGitHub())
    with pytest.raises(github.GitHubFlowError, match="expired"):
        github.finish_connect(me, "code", "not-a-state", FakeGitHub())


def test_installation_on_another_account_is_refused(make_user):
    user = connected(make_user)
    state = github.make_state(user, "install")
    with pytest.raises(github.GitHubFlowError) as e:
        github.finish_install(user, 55, state, FakeGitHub(installation_owner=999))
    assert e.value.code == "not_your_installation"
    github.finish_install(user, 55, state, FakeGitHub())
    st = github.status(user)
    assert st.private_repos
    assert [(r.full_name, r.private, r.mention_ok) for r in st.repos] == [
        ("octo/secret-app", True, False)  # private repos start as not OK to mention
    ]


# ---- collecting


def _signed(payload: dict) -> tuple[bytes, str]:
    body = json.dumps(payload).encode()
    return body, "sha256=" + hmac.new(b"whsecret", body, hashlib.sha256).hexdigest()


def test_webhook_signature_is_checked():
    body, sig = _signed({"a": 1})
    assert github.verify_signature(body, sig)
    assert not github.verify_signature(body + b" ", sig)
    assert not github.verify_signature(body, None)


def test_a_push_keeps_only_the_users_own_commits(make_user):
    user = connected(make_user)
    github.finish_install(user, 77, github.make_state(user, "install"), FakeGitHub())
    payload = {
        "installation": {"id": 77},
        "repository": {"id": 7, "full_name": "octo/secret-app", "private": True},
        "commits": [
            {"id": "a1", "message": "Add billing page\n\nkey=supersecret123", "timestamp":
             "2026-11-20T10:00:00Z", "author": {"username": LOGIN}, "modified": ["app.py"]},
            {"id": "b2", "message": "Someone else's work", "timestamp": "2026-11-20T11:00:00Z",
             "author": {"username": "teammate"}},
        ],
    }  # fmt: skip
    assert github.handle_webhook("push", payload) == 1
    with user_session(user) as s:
        item = s.scalars(select(GitHubItem)).one()
    assert item.title == "Add billing page" and "supersecret" not in item.body
    assert github.handle_webhook("push", payload | {"installation": {"id": 123456}}) == 0


def test_daily_sync_reads_public_repos_only(make_user):
    user = connected(make_user)
    since = (FRIDAY_EVENING - timedelta(hours=2)).isoformat()
    api = FakeGitHub(
        events=[
            {"type": "PushEvent", "repo": {"name": "octo/app"}, "created_at": since},
            {"type": "PushEvent", "repo": {"name": "octo/private"}, "created_at": since},
        ],
        repos={
            "octo/app": {"id": 1, "full_name": "octo/app", "private": False},
            "octo/private": {"id": 2, "full_name": "octo/private", "private": True},
        },
        commits={"octo/app": [{"sha": "c1", "commit": {"message": "Add search",
                                                       "author": {"date": since}}}]},
        prs=[{"number": 5, "title": "Search page", "body": "", "user": {"login": LOGIN},
              "repository_url": "https://api.github.com/repos/octo/app", "state": "closed",
              "merged_at": since}],
    )  # fmt: skip
    assert github.sync_public(user, api, FRIDAY_EVENING) == 2
    st = github.status(user)
    assert [r.full_name for r in st.repos] == ["octo/app"]


# ---- the evening digest


def test_a_quiet_day_says_so_without_calling_the_ai(make_user):
    user = connected(make_user)
    add_item(user, "fix typo")
    ai = JudgeAI()
    digest = github.run_digest(user, FRIDAY_EVENING - timedelta(days=1), ai)  # a Thursday
    assert digest.status == "nothing" and "Nothing worth posting today" in digest.reason
    assert ai.purposes == []  # stage 1 stopped it: no quota spent


def test_a_good_day_becomes_suggested_drafts_in_its_own_thread(make_user):
    user = connected(make_user)
    add_item(user, "Add the new login flow", kind="pr", state="merged", body="x" * 100)
    ai = JudgeAI()
    digest = github.run_digest(user, FRIDAY_EVENING, ai)
    assert digest.status == "suggested" and digest.angle == "The new login"
    assert ai.purposes[0] == "github_judge" and "draft" in ai.purposes
    with user_session(user) as s:
        thread = s.get(Thread, digest.thread_id)
        assert thread.title == "Suggested from your GitHub"
    based_on = github.status(user).digests[0][1]
    assert based_on == ['Merged a pull request in app: "Add the new login flow"']
    assert github.run_digest(user, FRIDAY_EVENING + timedelta(minutes=30), ai) is None  # once


def test_nothing_before_the_users_evening(make_user):
    user = connected(make_user)
    add_item(user, "Add the new login flow", kind="pr", state="merged")
    assert github.run_digest(user, datetime(2026, 11, 20, 12, 0, tzinfo=UTC)) is None


def test_private_repos_stay_out_until_the_user_allows_them(make_user):
    user = connected(make_user)
    add_item(user, "Add the new login flow", kind="pr", state="merged", private=True)
    assert github.run_digest(user, FRIDAY_EVENING, JudgeAI()).status == "nothing"


def test_post_anyway_and_discards_are_counted(make_user):
    user = connected(make_user)
    add_item(user, "Small tweak to a helper", when=FRIDAY_EVENING - timedelta(days=1, hours=3))
    digest = github.run_digest(user, FRIDAY_EVENING - timedelta(days=1), JudgeAI())
    assert digest.status == "nothing"
    after = github.post_anyway(user, digest.id, JudgeAI())
    assert after.status == "suggested" and after.thread_id
    from app.services import library

    with user_session(user) as s:
        draft_id = s.scalar(text("SELECT id FROM drafts WHERE thread_id = :t LIMIT 1"),
                            {"t": after.thread_id})  # fmt: skip
    library.update(user, draft_id, {"status": "discarded"})
    with user_session(user) as s:
        assert s.get(GitHubDigest, digest.id).discarded == 1


def test_friday_recaps_a_week_of_small_wins(make_user):
    user = connected(make_user)
    for d in range(4):  # small days, each below the daily bar
        add_item(user, f"Add step {d}", when=FRIDAY_EVENING - timedelta(days=d + 1))
    with user_session(user) as s:
        s.get(GitHubConnection, user).frequency = "daily"
    digest = github.run_digest(user, FRIDAY_EVENING, JudgeAI())
    assert digest.kind == "weekly" and digest.status == "suggested"


def test_disconnect_removes_everything_and_others_never_see_it(make_user, owner_engine):
    user = connected(make_user)
    add_item(user, "Add the new login flow", kind="pr", state="merged")
    github.run_digest(user, FRIDAY_EVENING, JudgeAI())
    other = make_user()
    with user_session(other) as s:
        assert s.scalars(select(GitHubItem)).all() == []
        assert s.scalars(select(GitHubConnection)).all() == []
    assert github.disconnect(user)
    with owner_engine.connect() as c:
        for table in ("github_connections", "github_repos", "github_items", "github_digests"):
            assert (
                c.scalar(text(f"SELECT count(*) FROM {table} WHERE user_id=:u"), {"u": user}) == 0
            )
