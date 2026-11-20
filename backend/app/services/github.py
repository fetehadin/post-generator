"""GitHub → daily dev drafts (FR-14). Optional: without GitHub, nothing changes.

Connecting
- Level 1, public repos: GitHub OAuth with no scopes. It proves the account is the user's
  (never a typed username) and gives a per-user token and rate limit.
- Level 2, private repos: the user installs our GitHub App (read-only: contents, pull requests,
  metadata) and picks repos. Its webhooks bring push, pull_request and release events.
- Each repo has "OK to mention publicly": on for public repos, off for private ones. A repo
  that isn't OK is never named, shown to the AI or used for a draft.
- Disconnect removes the token, the installation link and every stored item and digest.

Collecting
- Public: once a day, before the evening digest, find repos the user pushed to (Events API),
  then read their commits (`/repos/{r}/commits?author=&since=`) and PRs (search). Private: from
  webhooks. Only the user's own commits and PRs are kept, never code; secrets are scrubbed.

Deciding (two stages, to save the free AI quota)
1. A rule-based score, no AI: noise is dropped (merges, reverts, "wip", typos, formatting,
   lockfile-only changes) and signals add points (merged PR, described PR, release, new repo,
   feature verbs, a theme of several commits, first activity, a streak). Below the threshold:
   "Nothing worth posting today", with no AI call.
2. Above it, the AI answers {worth_posting, reason, angle}. Worth it: drafts are written from
   those facts and that angle, in a thread "Suggested from your GitHub", at the user's evening
   hour in their time zone. Never posted by itself; the user edits and approves.
- Weekly recap on Fridays when small days add up; frequency daily / weekly / highlights.
- Discarded suggestions are counted on the digest, to tune the scoring later.
"""

import hashlib
import hmac
import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from string import Template
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import jwt
from sqlalchemy import delete, select, text, update
from sqlalchemy.dialects.postgresql import insert

from app.ai.client import AIUnavailable, default_client, for_user
from app.core import secrets
from app.core.config import get_settings
from app.core.db import get_engine, user_session
from app.models import (
    GitHubConnection,
    GitHubDigest,
    GitHubItem,
    GitHubRepo,
    PlatformSettings,
    Thread,
    User,
)
from app.services.github_api import DEPENDENCY_FILES, GitHubAPI, GitHubError
from app.services.github_scrub import scrub

logger = logging.getLogger(__name__)

JUDGE = Template((Path(__file__).parents[1] / "ai" / "prompts" / "github_judge.md").read_text())
THREAD_TITLE = "Suggested from your GitHub"
STATE_SECONDS = 600
BODY_CHARS = 1500
FIRST_SYNC_DAYS = 2
NOISE = re.compile(
    r"^\s*(merge (pull request|branch|remote)|revert\b|wip\b|fix(ed|es)? typos?\b|typo\b|"
    r"format(ting)?\b|lint(ing)?\b|style\b|bump\b|chore\(deps\)|update dependenc)",
    re.IGNORECASE,
)
FEATURE = re.compile(
    r"\b(add(s|ed)?|implement\w*|launch\w*|ship\w*|build|built|introduc\w*|releas\w*|"
    r"creat(e|es|ed)|support(s|ed)?)\b",
    re.IGNORECASE,
)


class GitHubFlowError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


# ---- connecting -------------------------------------------------------------------------


def _state_key() -> str:
    """Derived from the OAuth app's secret, so there's no extra setting; always 64 characters."""
    seed = get_settings().github_client_secret + "|voxlace-github-state"
    return hashlib.sha256(seed.encode()).hexdigest()


def make_state(user_id: uuid.UUID, purpose: str) -> str:
    """A short-lived signed note: "this GitHub round trip belongs to this Voxlace user"."""
    exp = datetime.now(UTC) + timedelta(seconds=STATE_SECONDS)
    return jwt.encode({"sub": str(user_id), "p": purpose, "exp": exp}, _state_key(), "HS256")


def check_state(state: str, user_id: uuid.UUID, purpose: str) -> None:
    try:
        data = jwt.decode(state, _state_key(), algorithms=["HS256"])
    except jwt.PyJWTError as e:
        raise GitHubFlowError("bad_state", "That GitHub link expired. Start again.") from e
    if data.get("sub") != str(user_id) or data.get("p") != purpose:
        raise GitHubFlowError("bad_state", "That GitHub link isn't yours. Start again.")


def _require(enabled: bool) -> None:
    if not enabled:
        raise GitHubFlowError(
            "github_disabled", "Connecting GitHub isn't switched on for this app yet.", 503
        )


def connect_url(user_id: uuid.UUID) -> str:
    cfg = get_settings()
    _require(cfg.github_enabled)
    query = urlencode(
        {
            "client_id": cfg.github_client_id,
            "redirect_uri": f"{cfg.frontend_url}/github/callback",
            "state": make_state(user_id, "connect"),
            "scope": "",  # no scopes: public data only, read-only
            "allow_signup": "false",
        }
    )
    return f"https://github.com/login/oauth/authorize?{query}"


def finish_connect(user_id: uuid.UUID, code: str, state: str, api: GitHubAPI) -> None:
    _require(get_settings().github_enabled)
    check_state(state, user_id, "connect")
    try:
        token = api.exchange_code(code)
        who = api.user(token)
    except GitHubError as e:
        raise GitHubFlowError("github_refused", f"GitHub said no ({e.message}). Try again.") from e
    sealed = secrets.seal(token)
    with user_session(user_id) as s:
        s.execute(
            insert(GitHubConnection)
            .values(user_id=user_id, github_user_id=who.id, login=who.login, sealed_token=sealed)
            .on_conflict_do_update(
                index_elements=["user_id"],
                set_={"github_user_id": who.id, "login": who.login, "sealed_token": sealed},
            )
        )


def install_url(user_id: uuid.UUID) -> str:
    cfg = get_settings()
    _require(cfg.github_app_enabled)
    _connection(user_id)  # level 1 first: it proves which GitHub account is theirs
    state = make_state(user_id, "install")
    return f"https://github.com/apps/{cfg.github_app_slug}/installations/new?state={state}"


def finish_install(user_id: uuid.UUID, installation_id: int, state: str, api: GitHubAPI) -> None:
    """Link an installation only if it is on the GitHub account the user proved with OAuth."""
    _require(get_settings().github_app_enabled)
    check_state(state, user_id, "install")
    conn = _connection(user_id)
    try:
        account = api.installation(installation_id)["account"]
    except (GitHubError, KeyError) as e:
        raise GitHubFlowError("github_refused", "GitHub couldn't find that installation.") from e
    if account.get("type") != "User" or int(account.get("id", 0)) != conn.github_user_id:
        raise GitHubFlowError(
            "not_your_installation",
            "That installation is on another GitHub account. Install it on your own account.",
            403,
        )
    with user_session(user_id) as s:
        s.get(GitHubConnection, user_id).installation_id = installation_id
    token = api.installation_token(installation_id)
    with user_session(user_id) as s:
        for repo in api.installation_repos(token):
            _repo(s, user_id, repo, api.languages(repo["full_name"], token))


def disconnect(user_id: uuid.UUID) -> bool:
    """Everything GitHub goes: token, installation link, repos, items and digests. Drafts the
    user already has stay (they're theirs)."""
    with user_session(user_id) as s:
        s.execute(delete(GitHubDigest).where(GitHubDigest.user_id == user_id))
        s.execute(delete(GitHubRepo).where(GitHubRepo.user_id == user_id))  # items cascade
        gone = s.execute(delete(GitHubConnection).where(GitHubConnection.user_id == user_id))
        return gone.rowcount > 0


def _connection(user_id: uuid.UUID) -> GitHubConnection:
    with user_session(user_id) as s:
        conn = s.get(GitHubConnection, user_id)
        if conn is None:
            raise GitHubFlowError("not_connected", "Connect GitHub first.", 409)
        s.expunge(conn)
        return conn


def set_frequency(user_id: uuid.UUID, frequency: str) -> None:
    _connection(user_id)
    with user_session(user_id) as s:
        s.get(GitHubConnection, user_id).frequency = frequency


def set_mention(user_id: uuid.UUID, repo_id: uuid.UUID, ok: bool) -> bool:
    with user_session(user_id) as s:
        repo = s.get(GitHubRepo, repo_id)  # RLS: only their own
        if repo is None:
            return False
        repo.mention_ok = ok
        return True


# ---- storing ----------------------------------------------------------------------------


def _repo(s, user_id: uuid.UUID, data: dict, languages: list[str] | None = None) -> GitHubRepo:
    """Insert or refresh a repo. A new private repo starts as not OK to mention; an existing
    repo keeps the user's choice."""
    private = bool(data.get("private"))
    created = data.get("created_at")
    values = {
        "user_id": user_id,
        "repo_id": int(data["id"]),
        "full_name": data["full_name"][:200],
        "private": private,
        "mention_ok": not private,
        "repo_created_at": _when(created) if created else None,
    }
    update_ = {"full_name": values["full_name"], "private": private}
    if languages is not None:
        values["languages"] = update_["languages"] = languages
    s.execute(
        insert(GitHubRepo)
        .values(**values)
        .on_conflict_do_update(index_elements=["user_id", "repo_id"], set_=update_)
    )
    return s.scalars(
        select(GitHubRepo).where(
            GitHubRepo.user_id == user_id, GitHubRepo.repo_id == int(data["id"])
        )
    ).one()


def _item(
    s,
    user_id: uuid.UUID,
    repo: GitHubRepo,
    kind: str,
    external_id: str,
    title: str,
    body: str,
    happened_at: datetime,
    **extra,
) -> None:
    title, body = scrub(title).strip()[:300], scrub(body).strip()[:BODY_CHARS]
    values = {
        "user_id": user_id,
        "repo_id": repo.id,
        "kind": kind,
        "external_id": str(external_id)[:80],
        "title": title or "(no title)",
        "body": body,
        "happened_at": happened_at,
        **extra,
    }
    s.execute(
        insert(GitHubItem)
        .values(**values)
        .on_conflict_do_update(
            index_elements=["user_id", "repo_id", "kind", "external_id"],
            set_={
                k: v
                for k, v in values.items()
                if k
                in (
                    "title",
                    "body",
                    "state",
                    "happened_at",
                    "additions",
                    "deletions",
                    "files_changed",
                )
            },
        )
    )


def _split(message: str) -> tuple[str, str]:
    first, _, rest = (message or "").strip().partition("\n")
    return first.strip(), rest.strip()


def _when(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


# ---- level 1: the daily public sync ---------------------------------------------------------


def sync_public(user_id: uuid.UUID, api: GitHubAPI, now: datetime | None = None) -> int:
    """New public commits, PRs and releases since the last sync. Returns how many were read."""
    now = now or datetime.now(UTC)
    conn = _connection(user_id)
    token = secrets.unseal(conn.sealed_token)
    if not token:
        return 0
    since = max(
        conn.last_synced_at or now - timedelta(days=FIRST_SYNC_DAYS), now - timedelta(days=7)
    )
    login, count = conn.login, 0
    repos: dict[str, dict] = {}
    releases: list[tuple[str, dict]] = []
    for event in api.events(login, token):
        if _when(event.get("created_at")) < since:
            continue
        name = (event.get("repo") or {}).get("name")
        if event.get("type") in ("PushEvent", "CreateEvent", "ReleaseEvent") and name:
            repos.setdefault(name, {})
        if event.get("type") == "ReleaseEvent":
            releases.append((name, (event.get("payload") or {}).get("release") or {}))
    with user_session(user_id) as s:
        for name in repos:
            data = api.repo(name, token)
            if data.get("private"):
                continue  # level 1 is public only; private repos come through the App
            known = s.scalar(
                select(GitHubRepo.id).where(
                    GitHubRepo.user_id == user_id, GitHubRepo.repo_id == int(data["id"])
                )
            )
            repo = _repo(s, user_id, data, None if known else api.languages(name, token))
            repos[name] = {"repo": repo}
            for c in api.commits(name, login, since, token)[:20]:
                title, body = _split(c.get("commit", {}).get("message", ""))
                stats = api.commit_stats(name, c["sha"], token)
                happened = _when(c.get("commit", {}).get("author", {}).get("date"))
                _item(s, user_id, repo, "commit", c["sha"], title, body, happened, **stats)
                count += 1
        for name, rel in releases:
            if name in repos and "repo" in repos[name] and rel.get("tag_name"):
                _item(
                    s,
                    user_id,
                    repos[name]["repo"],
                    "release",
                    rel["tag_name"],
                    rel.get("name") or rel["tag_name"],
                    rel.get("body") or "",
                    _when(rel.get("published_at")),
                )
                count += 1
        for pr in api.pull_requests(login, since, token):
            full = "/".join(pr.get("repository_url", "").split("/")[-2:])
            if not full or (pr.get("user") or {}).get("login") != login:
                continue
            data = api.repo(full, token)
            if data.get("private"):
                continue
            repo = _repo(s, user_id, data)
            detail = api.pull(full, int(pr["number"]), token)
            _save_pr(s, user_id, repo, detail)
            count += 1
        s.get(GitHubConnection, user_id).last_synced_at = now
    return count


def _save_pr(s, user_id: uuid.UUID, repo: GitHubRepo, pr: dict) -> None:
    state = (
        "merged"
        if pr.get("merged") or pr.get("merged_at")
        else ("closed" if pr.get("state") == "closed" else "opened")
    )
    _item(
        s,
        user_id,
        repo,
        "pr",
        str(pr["number"]),
        pr.get("title") or "",
        pr.get("body") or "",
        _when(pr.get("merged_at") or pr.get("updated_at") or pr.get("created_at")),
        state=state,
        additions=pr.get("additions"),
        deletions=pr.get("deletions"),
        files_changed=pr.get("changed_files"),
    )


# ---- level 2: webhooks ------------------------------------------------------------------------


def verify_signature(body: bytes, signature: str | None) -> bool:
    """X-Hub-Signature-256: HMAC-SHA256 of the raw body with our webhook secret."""
    secret = get_settings().github_webhook_secret
    if not secret or not signature:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _user_for_installation(installation_id: int) -> uuid.UUID | None:
    with get_engine().connect() as conn:
        return conn.scalar(text("SELECT user_for_github_installation(:i)"), {"i": installation_id})


def handle_webhook(event: str, payload: dict) -> int:
    """Store what a webhook says, for the user who owns that installation. Only that user's own
    commits and PRs; never code. Returns how many items were stored."""
    installation = (payload.get("installation") or {}).get("id")
    if not installation:
        return 0
    user_id = _user_for_installation(int(installation))
    if user_id is None:
        return 0
    if event == "installation" and payload.get("action") == "deleted":
        with user_session(user_id) as s:
            s.get(GitHubConnection, user_id).installation_id = None
        return 0
    repo_data = payload.get("repository")
    if not repo_data:
        return 0
    with user_session(user_id) as s:
        login = s.get(GitHubConnection, user_id).login
        repo = _repo(s, user_id, repo_data)
        stored = 0
        if event == "push":
            for c in payload.get("commits") or []:
                author = (c.get("author") or {}).get("username")
                if author != login:
                    continue  # someone else's commit in a shared repo
                names = [
                    p.rsplit("/", 1)[-1]
                    for k in ("added", "removed", "modified")
                    for p in c.get(k) or []
                ]
                title, body = _split(c.get("message", ""))
                _item(
                    s,
                    user_id,
                    repo,
                    "commit",
                    c["id"],
                    title,
                    body,
                    _when(c.get("timestamp")),
                    files_changed=len(names),
                    deps_only=bool(names) and all(n in DEPENDENCY_FILES for n in names),
                )
                stored += 1
        elif event == "pull_request":
            pr = payload.get("pull_request") or {}
            if (pr.get("user") or {}).get("login") == login:
                _save_pr(s, user_id, repo, pr)
                stored += 1
        elif event == "release" and payload.get("action") == "published":
            rel = payload.get("release") or {}
            if (rel.get("author") or {}).get("login") == login and rel.get("tag_name"):
                _item(
                    s,
                    user_id,
                    repo,
                    "release",
                    rel["tag_name"],
                    rel.get("name") or rel["tag_name"],
                    rel.get("body") or "",
                    _when(rel.get("published_at")),
                )
                stored += 1
    return stored


# ---- stage 1: the rule-based score --------------------------------------------------------------


@dataclass
class Score:
    points: int = 0
    reasons: list[str] = field(default_factory=list)
    kept: list[GitHubItem] = field(default_factory=list)

    def add(self, points: int, why: str) -> None:
        if points:
            self.points += points
            self.reasons.append(why)


def is_noise(item: GitHubItem) -> bool:
    return item.kind == "commit" and (bool(NOISE.match(item.title)) or item.deps_only)


def score(
    items: list[GitHubItem],
    repos: dict[uuid.UUID, GitHubRepo],
    weights: dict[str, int],
    window_start: datetime,
    first_ever: bool = False,
    streak_days: int = 0,
) -> Score:
    """Points from the signals in FR-14, with the weights from settings. No AI involved."""
    w = weights.get
    result = Score(kept=[i for i in items if not is_noise(i)])
    kept = result.kept
    commits = [i for i in kept if i.kind == "commit"]
    prs = [i for i in kept if i.kind == "pr"]
    merged = [p for p in prs if p.state == "merged"]
    result.add(len(merged) * w("merged_pr", 0), f"{len(merged)} merged PR(s)")
    opened = [p for p in prs if p.state == "opened"]
    result.add(len(opened) * w("opened_pr", 0), f"{len(opened)} open PR(s)")
    described = [p for p in prs if len(p.body) >= 80]
    result.add(len(described) * w("described_pr", 0), "PR(s) with a real description")
    releases = [i for i in kept if i.kind == "release"]
    result.add(len(releases) * w("release", 0), f"{len(releases)} release(s)")
    active = {i.repo_id for i in kept}
    new = [r for r in active if (c := repos[r].repo_created_at) and c >= window_start]
    result.add(len(new) * w("new_repo", 0), "a new project")
    features = [i for i in kept if FEATURE.search(i.title)]
    result.add(min(len(features), 3) * w("feature", 0), "feature work")
    per_repo: dict[uuid.UUID, int] = {}
    for c in commits:
        per_repo[c.repo_id] = per_repo.get(c.repo_id, 0) + 1
    themes = [r for r, n in per_repo.items() if n >= 3]
    result.add(len(themes) * w("theme", 0), "several commits on one project")
    result.add(min(len(commits), 3) * w("commit", 0), f"{len(commits)} meaningful commit(s)")
    if first_ever and kept:
        result.add(w("milestone", 0), "first activity Voxlace has seen")
    if streak_days >= 5:
        result.add(w("streak", 0), f"a {streak_days}-day streak")
    return result


# ---- the evening digest -----------------------------------------------------------------------


def _zone(s, user_id: uuid.UUID) -> ZoneInfo:
    try:
        return ZoneInfo(s.get(User, user_id).timezone or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _mentionable(s, user_id: uuid.UUID, start: datetime, end: datetime):
    repos = {
        r.id: r
        for r in s.scalars(
            select(GitHubRepo).where(GitHubRepo.user_id == user_id, GitHubRepo.mention_ok)
        )
    }
    items = list(
        s.scalars(
            select(GitHubItem)
            .where(
                GitHubItem.user_id == user_id,
                GitHubItem.happened_at >= start,
                GitHubItem.happened_at < end,
                GitHubItem.repo_id.in_(list(repos) or [uuid.UUID(int=0)]),
            )
            .order_by(GitHubItem.happened_at)
        )
    )
    return items, repos


def _streak(s, user_id: uuid.UUID, zone: ZoneInfo, day: date) -> int:
    since = datetime.combine(day - timedelta(days=14), time(), zone).astimezone(UTC)
    rows = s.scalars(
        select(GitHubItem).where(GitHubItem.user_id == user_id, GitHubItem.happened_at >= since)
    ).all()
    days = {i.happened_at.astimezone(zone).date() for i in rows if not is_noise(i)}
    n = 0
    while day - timedelta(days=n) in days:
        n += 1
    return n


@dataclass(frozen=True)
class Judgement:
    worth: bool
    reason: str
    angle: str


def describe_items(items: list[GitHubItem], repos: dict[uuid.UUID, GitHubRepo]) -> list[str]:
    """Plain lines of facts: what the AI sees, and what the thread shows as "based on"."""
    lines = []
    for i in items:
        repo = repos[i.repo_id].full_name.split("/")[-1]
        if i.kind == "pr":
            size = f" (+{i.additions}/-{i.deletions})" if i.additions is not None else ""
            verb = {"merged": "Merged", "closed": "Closed", "opened": "Opened"}.get(i.state, "PR")
            lines.append(f'{verb} a pull request in {repo}: "{i.title}"{size}')
        elif i.kind == "release":
            lines.append(f"Released {i.title} of {repo}")
        else:
            lines.append(f'Commit in {repo}: "{i.title}"')
    return lines


def judge(user_id: uuid.UUID, lines: list[str], window: str, ai=None) -> Judgement:
    """Stage 2: one small AI call, on the user's own key first (FR-48)."""
    ai = for_user(ai or default_client(), user_id)
    prompt = JUDGE.substitute(window=window, items="\n".join(f"- {line}" for line in lines))
    answer = ai.generate(prompt, purpose="github_judge", temperature=0.2).text
    match = re.search(r"\{.*\}", answer, re.DOTALL)
    try:
        data = json.loads(match.group(0)) if match else {}
    except json.JSONDecodeError:
        data = {}
    return Judgement(
        bool(data.get("worth_posting")),
        str(data.get("reason") or "The AI didn't say why.")[:300],
        str(data.get("angle") or "")[:300],
    )


def _platforms(s, user_id: uuid.UUID) -> list[str]:
    chosen = s.scalars(
        select(PlatformSettings.platform).where(PlatformSettings.user_id == user_id)
    ).all()
    return sorted(set(chosen)) or ["linkedin", "x"]


def write_suggestion(
    user_id: uuid.UUID, lines: list[str], angle: str, kind: str, day: date, ai=None
) -> tuple[uuid.UUID | None, int]:
    """The facts become the thread's check-in (so the user sees what it's based on), then one
    draft per platform. Returns the thread and how many drafts were written."""
    from app.services import threads

    head = "This week on GitHub" if kind == "weekly" else "Today on GitHub"
    facts = f"{head}:\n" + "\n".join(f"- {line}" for line in lines)
    if angle:
        facts += f"\n\nAngle: {angle}"
    started = threads.start(user_id, facts, day=day)
    thread_id = started.thread.id
    with user_session(user_id) as s:
        s.get(Thread, thread_id).title = THREAD_TITLE
        platforms = _platforms(s, user_id)
    detail, failures = threads.generate(user_id, thread_id, platforms, ai=ai)
    return thread_id, len(platforms) - len(failures)


def run_digest(user_id: uuid.UUID, now: datetime | None = None, ai=None) -> GitHubDigest | None:
    """The evening decision for one user (FR-14). Returns the digest made, or None when it isn't
    time yet, one already exists, or the AI was busy (the next hourly run tries again)."""
    now = now or datetime.now(UTC)
    cfg = get_settings()
    conn = _connection(user_id)
    with user_session(user_id) as s:
        zone = _zone(s, user_id)
    local = now.astimezone(zone)
    if local.hour < cfg.github_suggest_hour:
        return None
    day = local.date()
    friday = local.weekday() == 4
    kinds = {"daily": ["daily"], "highlights": ["daily"], "weekly": ["weekly"] if friday else []}
    made = None
    for kind in kinds[conn.frequency]:
        made = _digest(user_id, conn, kind, day, zone, now, ai) or made
    if conn.frequency == "daily" and friday:
        # Friday: a recap of the week's small wins, unless today already got a suggestion.
        with user_session(user_id) as s:
            today = s.scalar(
                select(GitHubDigest.status).where(
                    GitHubDigest.user_id == user_id,
                    GitHubDigest.day == day,
                    GitHubDigest.kind == "daily",
                )
            )
        if today is not None and today != "suggested":
            made = _digest(user_id, conn, "weekly", day, zone, now, ai) or made
    return made


def _digest(user_id, conn, kind, day, zone, now, ai) -> GitHubDigest | None:
    cfg = get_settings()
    with user_session(user_id) as s:
        if s.scalar(
            select(GitHubDigest.id).where(
                GitHubDigest.user_id == user_id, GitHubDigest.day == day, GitHubDigest.kind == kind
            )
        ):
            return None
        days = 7 if kind == "weekly" else 1
        start = datetime.combine(day - timedelta(days=days - 1), time(), zone).astimezone(UTC)
        items, repos = _mentionable(s, user_id, start, now)
        if kind == "weekly":  # a recap of what daily suggestions didn't already use
            used = {
                i
                for d in s.scalars(
                    select(GitHubDigest).where(
                        GitHubDigest.user_id == user_id,
                        GitHubDigest.status == "suggested",
                        GitHubDigest.day >= day - timedelta(days=6),
                    )
                )
                for i in d.item_ids
            }
            items = [i for i in items if i.id not in used]
        first_ever = not s.scalar(
            select(GitHubItem.id)
            .where(GitHubItem.user_id == user_id, GitHubItem.happened_at < start)
            .limit(1)
        )
        streak = _streak(s, user_id, zone, day)
        for i in items:
            s.expunge(i)
        for r in repos.values():
            s.expunge(r)
    threshold = {
        "weekly": cfg.github_threshold_weekly,
        "daily": cfg.github_threshold_highlights
        if conn.frequency == "highlights"
        else cfg.github_threshold_daily,
    }[kind]
    result = score(items, repos, cfg.github_weights, start, first_ever, streak)
    kept_ids = [i.id for i in result.kept]
    lines = describe_items(result.kept, repos)
    status, reason, angle, thread_id = "nothing", "", None, None
    if result.points < threshold:
        what = ", ".join(result.reasons) or "no activity in repos you allow"
        reason = f"Nothing worth posting {'this week' if kind == 'weekly' else 'today'} ({what})."
    else:
        try:
            verdict = judge(user_id, lines, "this week" if kind == "weekly" else "today", ai)
        except AIUnavailable:
            return None  # try again next hour
        reason, angle = verdict.reason, verdict.angle
        if verdict.worth:
            thread_id, written = write_suggestion(user_id, lines, angle, kind, day, ai)
            status = "suggested" if written else "skipped"
    with user_session(user_id) as s:
        digest = GitHubDigest(
            user_id=user_id,
            day=day,
            kind=kind,
            score=result.points,
            status=status,
            reason=reason,
            angle=angle,
            item_ids=kept_ids,
            thread_id=thread_id,
        )
        s.add(digest)
        s.flush()
        s.refresh(digest)
        s.expunge(digest)
    logger.info("github %s digest: score %d, %s", kind, result.points, status)
    return digest


def post_anyway(user_id: uuid.UUID, digest_id: uuid.UUID, ai=None) -> GitHubDigest:
    """'Want to post anyway?' on a day judged not worth it."""
    with user_session(user_id) as s:
        digest = s.get(GitHubDigest, digest_id)
        if digest is None:
            raise GitHubFlowError("not_found", "Not found.", 404)
        if digest.thread_id is not None:
            raise GitHubFlowError("already_drafted", "These already have drafts.", 409)
        items = list(s.scalars(select(GitHubItem).where(GitHubItem.id.in_(digest.item_ids))))
        repos = {
            r.id: r
            for r in s.scalars(
                select(GitHubRepo).where(GitHubRepo.user_id == user_id, GitHubRepo.mention_ok)
            )
        }
        items = [i for i in items if i.repo_id in repos]
        kind, day = digest.kind, digest.day
    if not items:
        raise GitHubFlowError("nothing_to_post", "There's no GitHub activity to write about.", 409)
    thread_id, written = write_suggestion(user_id, describe_items(items, repos), "", kind, day, ai)
    with user_session(user_id) as s:
        digest = s.get(GitHubDigest, digest_id)
        digest.thread_id, digest.status = thread_id, "suggested" if written else "skipped"
        s.flush()
        s.refresh(digest)
        s.expunge(digest)
        return digest


def count_discard(s, thread_id: uuid.UUID | None) -> None:
    """A suggested draft was discarded: counted on its digest, to tune the scoring later."""
    if thread_id is not None:
        s.execute(
            update(GitHubDigest)
            .where(GitHubDigest.thread_id == thread_id)
            .values(discarded=GitHubDigest.discarded + 1)
        )


# ---- reading --------------------------------------------------------------------------------


@dataclass(frozen=True)
class Status:
    connected: bool
    login: str | None
    private_repos: bool
    frequency: str
    repos: list[GitHubRepo]
    digests: list[tuple[GitHubDigest, list[str]]]


def status(user_id: uuid.UUID) -> Status:
    with user_session(user_id) as s:
        conn = s.get(GitHubConnection, user_id)
        repos = list(
            s.scalars(
                select(GitHubRepo)
                .where(GitHubRepo.user_id == user_id)
                .order_by(GitHubRepo.full_name)
            )
        )
        by_id = {r.id: r for r in repos}
        digests = []
        for d in s.scalars(
            select(GitHubDigest)
            .where(GitHubDigest.user_id == user_id)
            .order_by(GitHubDigest.day.desc(), GitHubDigest.created_at.desc())
            .limit(10)
        ):
            items = list(s.scalars(select(GitHubItem).where(GitHubItem.id.in_(d.item_ids))))
            shown = [i for i in items if i.repo_id in by_id and by_id[i.repo_id].mention_ok]
            digests.append((d, describe_items(shown, by_id)))
        for x in [*repos, *(d for d, _ in digests)]:
            s.expunge(x)
        if conn is not None:
            s.expunge(conn)
    return Status(
        conn is not None,
        conn.login if conn else None,
        bool(conn and conn.installation_id),
        conn.frequency if conn else "daily",
        repos,
        digests,
    )


# ---- the hourly job -------------------------------------------------------------------------


def connected_users() -> list[uuid.UUID]:
    with get_engine().connect() as conn:
        return list(conn.scalars(text("SELECT github_connected_users()")))


def _is_evening(user_id: uuid.UUID, now: datetime) -> bool:
    with user_session(user_id) as s:
        return now.astimezone(_zone(s, user_id)).hour >= get_settings().github_suggest_hour


def run_once(api: GitHubAPI | None = None, now: datetime | None = None) -> int:
    """Each connected user at or past their evening hour: sync public activity (once a day,
    right before deciding, so the day's late commits count), then decide. One user's failure
    never stops the others."""
    now = now or datetime.now(UTC)
    api = api or GitHubAPI()
    done = 0
    for user_id in connected_users():
        try:
            if not _is_evening(user_id, now):
                continue
            conn = _connection(user_id)
            if conn.last_synced_at is None or now - conn.last_synced_at > timedelta(hours=12):
                sync_public(user_id, api, now)
            if run_digest(user_id, now) is not None:
                done += 1
        except Exception:
            logger.exception("github digest failed for a user")
    return done
