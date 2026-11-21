"""FR-48: which provider a pasted key belongs to, the free key check, and the plain reasons a
key is refused. Every HTTP call is mocked."""

import httpx
import pytest

from app.ai.client import (
    AIClient,
    KeyCheckUnavailable,
    KeyRejected,
    ProviderError,
    key_failure_reason,
)
from app.ai.providers import PROVIDERS, detect
from app.core.config import Settings


@pytest.mark.parametrize(
    ("key", "provider"),
    [
        ("AIzaSyD-0000000000000000000000000000", "google"),
        ("gsk_" + "a" * 48, "groq"),
        ("sk-or-v1-" + "b" * 60, "openrouter"),
        ("sk-ant-api03-" + "c" * 80, "anthropic"),
        ("sk-proj-" + "d" * 40, "openai"),
        ("  gsk_" + "a" * 48 + "  ", "groq"),  # pasted with spaces
        ("x" * 32, None),  # Mistral keys have no prefix: the user picks
        ("", None),
    ],
)
def test_detect_provider_from_the_key_prefix(key, provider):
    assert detect(key) == provider


def test_every_provider_with_a_prefix_has_a_hint_and_every_free_one_has_steps():
    for p in PROVIDERS.values():
        assert bool(p.prefix) == bool(p.hint), p.id
        if p.free:
            assert p.steps and p.note and p.check_url, p.id


def listing_client(status: int, body: dict | None = None, headers: dict | None = None):
    seen: list[httpx.Request] = []

    def reply(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status, json=body or {"models": []}, headers=headers)

    client = AIClient(
        Settings(_env_file=None), http=httpx.Client(transport=httpx.MockTransport(reply))
    )
    return client, seen


@pytest.mark.parametrize(
    ("provider", "url", "header", "value"),
    [
        ("google", "https://generativelanguage.googleapis.com/v1beta/models", "x-goog-api-key",
         "AIza-key"),
        ("groq", "https://api.groq.com/openai/v1/models", "authorization", "Bearer AIza-key"),
        ("openrouter", "https://openrouter.ai/api/v1/key", "authorization", "Bearer AIza-key"),
    ],
)  # fmt: skip
def test_a_key_is_checked_with_a_free_listing_call_never_in_the_url(provider, url, header, value):
    client, seen = listing_client(200)
    client.check_key(provider, "AIza-key")
    (request,) = seen
    assert request.method == "GET" and str(request.url) == url
    assert request.headers[header] == value
    assert "AIza-key" not in str(request.url)


@pytest.mark.parametrize(
    ("status", "message", "headers", "reason"),
    [
        (400, "API key not valid. Please pass a valid API key.", None, "invalid_key"),
        (401, "Invalid API Key", None, "invalid_key"),
        (403, "Permission denied", None, "invalid_key"),
        (400, "User location is not supported for the API use.", None, "region_or_age_blocked"),
        (400, "Gemini API free tier is not available in your country.", None,
         "region_or_age_blocked"),
        (429, "Rate limit reached for tokens per day", {"retry-after": "7200"}, "quota_exceeded"),
        (402, "Insufficient credits", None, "quota_exceeded"),
    ],
)  # fmt: skip
def test_refusals_map_to_a_plain_reason(status, message, headers, reason):
    client, _ = listing_client(status, {"error": {"message": message}}, headers)
    with pytest.raises(KeyRejected) as e:
        client.check_key("google", "AIza-key")
    assert e.value.reason == reason


@pytest.mark.parametrize(
    "err",
    [
        ProviderError(503, "overloaded"),
        ProviderError(429, "slow down", wait=5),  # a per-minute limit: just try again
        httpx.ConnectError("no route"),
    ],
)
def test_outages_decide_nothing(err):
    assert key_failure_reason(err) is None


def test_network_trouble_during_the_check_is_unavailable_not_a_refusal():
    def down(request):
        raise httpx.ConnectError("no route")

    client = AIClient(
        Settings(_env_file=None), http=httpx.Client(transport=httpx.MockTransport(down))
    )
    with pytest.raises(KeyCheckUnavailable):
        client.check_key("groq", "gsk_key")
