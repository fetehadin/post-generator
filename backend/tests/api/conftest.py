"""Shared API test fixtures: a client acting as one fresh user, and a fake AI."""

import pytest
from fastapi.testclient import TestClient

from app.ai.client import AIUnavailable, GenerationResult
from app.api.deps import get_ai
from app.core.auth import Identity, current_user, identity
from app.main import create_app

DIMS = 768


class FakeAI:
    def __init__(self, fail_generate: bool = False):
        self.fail_generate = fail_generate

    def embed_documents(self, texts):
        # Distinct directions per text, so search doesn't treat them as near-copies.
        out = []
        for t in texts:
            v = [0.0] * DIMS
            v[0], v[1 + sum(map(ord, t)) % (DIMS - 1)] = 1.0, 1.0
            out.append(v)
        return out

    def embed_query(self, text):
        return [1.0] + [0.0] * (DIMS - 1)

    def generate(self, prompt, purpose="draft", temperature=0.9):
        if self.fail_generate:
            raise AIUnavailable("all models failed")
        return GenerationResult(
            "Shipped it 🚀\n@sam", "gemini-flash-latest", "google", "gemini-3.8-flash"
        )


@pytest.fixture
def api(make_user):
    """A client acting as one fresh user; `api.as_user(other)` switches user."""
    app = create_app()
    state = {"user": make_user(), "ai": FakeAI()}
    app.dependency_overrides[current_user] = lambda: state["user"]
    # Routes that need the login identity (/me) see the same user, with make_user's email.
    app.dependency_overrides[identity] = lambda: Identity(
        state["user"], f"{state['user']}@test.local", email_confirmed=True
    )
    app.dependency_overrides[get_ai] = lambda: state["ai"]
    client = TestClient(app, raise_server_exceptions=False)
    client.state = state
    return client
