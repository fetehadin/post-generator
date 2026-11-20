"""The few GitHub REST calls Voxlace makes (FR-14). Read-only, over httpx; tests pass a fake.

- OAuth (no scopes): exchange the code, read who the user is, their public events, commits
  and PRs. The user's own token gives them their own rate limit (5,000 calls an hour).
- GitHub App (private repos): an app JWT (RS256, from the app's private key) to read an
  installation and get a short-lived installation token for its repos.
Code diffs are never requested for content: a commit's file list is used only to count files
and to tell whether only lockfiles changed.
"""

import time
from dataclasses import dataclass
from datetime import datetime

import httpx
import jwt

from app.core.config import Settings, get_settings

API = "https://api.github.com"
HEADERS = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
LOCKFILES = (
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Pipfile.lock",
    "uv.lock", "Cargo.lock", "go.sum", "composer.lock", "Gemfile.lock",
)  # fmt: skip
DEPENDENCY_FILES = (*LOCKFILES, "requirements.txt", "package.json", "pyproject.toml", "go.mod")


class GitHubError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"{status}: {message}")
        self.status, self.message = status, message


@dataclass(frozen=True)
class GitHubUser:
    id: int
    login: str


class GitHubAPI:
    def __init__(self, settings: Settings | None = None, http: httpx.Client | None = None):
        self.settings = settings or get_settings()
        self.http = http or httpx.Client(timeout=20)

    def _get(self, path: str, token: str, params: dict | None = None):
        auth = {"Authorization": f"Bearer {token}"} if token else {}
        resp = self.http.get(API + path, headers=HEADERS | auth, params=params)
        if resp.status_code >= 400:
            raise GitHubError(resp.status_code, _message(resp))
        return resp.json()

    # ---- OAuth (level 1) ----
    def exchange_code(self, code: str) -> str:
        resp = self.http.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": self.settings.github_client_id,
                "client_secret": self.settings.github_client_secret,
                "code": code,
            },
        )
        data = resp.json() if resp.status_code == 200 else {}
        if not data.get("access_token"):
            raise GitHubError(resp.status_code, data.get("error_description") or "no token")
        return data["access_token"]

    def user(self, token: str) -> GitHubUser:
        data = self._get("/user", token)
        return GitHubUser(int(data["id"]), data["login"])

    def events(self, login: str, token: str) -> list[dict]:
        return self._get(f"/users/{login}/events", token, {"per_page": 100})

    def repo(self, full_name: str, token: str) -> dict:
        return self._get(f"/repos/{full_name}", token)

    def languages(self, full_name: str, token: str) -> list[str]:
        data = self._get(f"/repos/{full_name}/languages", token)
        return sorted(data, key=data.get, reverse=True)[:3]

    def commits(self, full_name: str, login: str, since: datetime, token: str) -> list[dict]:
        return self._get(
            f"/repos/{full_name}/commits",
            token,
            {"author": login, "since": since.isoformat(), "per_page": 30},
        )

    def commit_stats(self, full_name: str, sha: str, token: str) -> dict:
        """Counts only: files changed, additions, deletions, and whether only lockfiles or
        dependency files changed. The patch text is dropped right here."""
        data = self._get(f"/repos/{full_name}/commits/{sha}", token)
        names = [f.get("filename", "").rsplit("/", 1)[-1] for f in data.get("files") or []]
        stats = data.get("stats") or {}
        return {
            "files_changed": len(names),
            "additions": stats.get("additions"),
            "deletions": stats.get("deletions"),
            "deps_only": bool(names) and all(n in DEPENDENCY_FILES for n in names),
        }

    def pull_requests(self, login: str, since: datetime, token: str) -> list[dict]:
        q = f"type:pr author:{login} updated:>={since.date().isoformat()}"
        return self._get("/search/issues", token, {"q": q, "per_page": 30}).get("items", [])

    def pull(self, full_name: str, number: int, token: str) -> dict:
        return self._get(f"/repos/{full_name}/pulls/{number}", token)

    # ---- GitHub App (level 2) ----
    def app_jwt(self) -> str:
        key = self.settings.github_app_private_key.replace("\\n", "\n")
        now = int(time.time())
        payload = {"iat": now - 60, "exp": now + 540, "iss": self.settings.github_app_id}
        return jwt.encode(payload, key, algorithm="RS256")

    def installation(self, installation_id: int) -> dict:
        return self._get(f"/app/installations/{installation_id}", self.app_jwt())

    def installation_token(self, installation_id: int) -> str:
        resp = self.http.post(
            f"{API}/app/installations/{installation_id}/access_tokens",
            headers=HEADERS | {"Authorization": f"Bearer {self.app_jwt()}"},
        )
        if resp.status_code >= 400:
            raise GitHubError(resp.status_code, _message(resp))
        return resp.json()["token"]

    def installation_repos(self, token: str) -> list[dict]:
        return self._get("/installation/repositories", token, {"per_page": 100}).get(
            "repositories", []
        )


def _message(resp: httpx.Response) -> str:
    try:
        return str(resp.json().get("message") or resp.text[:200])
    except ValueError:
        return resp.text[:200]
