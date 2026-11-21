"""Users' own keys (FR-48), the circuit breaker, call records and the topic cache.
Fakes only: no test calls a real AI API."""

import json
import uuid
from types import SimpleNamespace

import httpx
import pytest
from google.genai import errors

from app.ai.breaker import CircuitBreaker
from app.ai.client import (
    AIClient,
    AIUnavailable,
    EmbeddingUnavailable,
    KeyCheckUnavailable,
    KeyRejected,
    for_user,
)
from app.core.config import Settings

USER, OTHER = uuid.uuid4(), uuid.uuid4()


def api_error(code: int, message: str = "") -> errors.APIError:
    return errors.APIError(
        code, {"error": {"code": code, "message": message or f"fake {code}", "status": "X"}}
    )


class Models:
    """One fake Gemini per key: `fail` maps model -> queued error codes for this key."""

    def __init__(self, key, log, fail=None, usage=None):
        self.key, self.log, self.fail, self.usage = key, log, fail or {}, usage

    def generate_content(self, model, contents, config):
        self.log.append(("gen", self.key, model, config))
        queue = self.fail.get(model, [])
        if queue:
            raise queue.pop(0) if isinstance(queue[0], Exception) else api_error(queue.pop(0))
        return SimpleNamespace(
            text=f"draft by {self.key}", model_version=f"{model}-v", usage_metadata=self.usage
        )

    def embed_content(self, model, contents, config):
        self.log.append(("embed", self.key, model, None))
        queue = self.fail.get(model, [])
        if queue:
            raise api_error(queue.pop(0))
        return SimpleNamespace(embeddings=[SimpleNamespace(values=[1.0, 2.0]) for _ in contents])

    def get(self, model):
        self.log.append(("get", self.key, model, None))
        queue = self.fail.get("get", [])
        if queue:
            raise api_error(queue.pop(0))
        return SimpleNamespace(name=model)


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now

    def sleep(self, s):
        self.now += s


def build(fail_by_key=None, own=None, chain="google:first,google:second", usage=None, **cfg):
    """A client whose Gemini answers per key, a key store, a record list and a fake clock."""
    log, records, clock = [], [], Clock()
    fail_by_key = fail_by_key or {}
    clients = {}

    def factory(key):
        clients.setdefault(
            key, SimpleNamespace(models=Models(key, log, fail_by_key.get(key), usage))
        )
        return clients[key]

    settings = Settings(_env_file=None, gemini_api_key="app-key", generation_models=chain, **cfg)
    client = AIClient(
        settings,
        genai_factory=factory,
        sleep=clock.sleep,
        clock=clock,
        key_store=lambda uid: (own or {}).get(uid, {}),
        recorder=records.append,
    )
    return client, log, records, clock


def keys_used(log, kind="gen"):
    return [(k, m) for what, k, m, _ in log if what == kind]


# ---- own keys first (FR-48)


def test_a_users_own_key_is_tried_first_and_marked_own():
    client, log, records, _ = build(own={USER: {"google": "user-key"}})
    result = client.for_user(USER).generate("p")
    assert (result.text, result.key_source) == ("draft by user-key", "own")
    assert keys_used(log) == [("user-key", "first")]
    assert records[-1].key_source == "own" and records[-1].user_id == USER


def test_a_failed_own_key_falls_back_to_the_free_pool_with_a_notice():
    client, log, _, _ = build(
        fail_by_key={"user-key": {"first": [404], "second": [404]}},
        own={USER: {"google": "user-key"}},
    )
    result = client.for_user(USER).generate("p")
    assert result.key_source == "default"
    assert result.notice == "Your key failed, used the free model instead."
    # With no model chosen, their key tries every model our chain uses on that provider first.
    assert keys_used(log) == [("user-key", "first"), ("user-key", "second"), ("app-key", "first")]


def test_a_paused_own_key_still_gets_the_notice():
    client, _, _, _ = build(
        fail_by_key={"user-key": {"first": [401], "second": [401]}},
        own={USER: {"google": "user-key"}},
    )
    client.for_user(USER).generate("p")  # 401: their key is paused for an hour
    again = client.for_user(USER).generate("p")
    assert again.key_source == "default"
    assert again.notice == "Your key failed, used the free model instead."


def test_the_users_chosen_model_is_used_and_tried_before_any_of_ours():
    client, log, _, _ = build(own={USER: {"google": ("user-key", "their-model")}})
    result = client.for_user(USER).generate("p")
    assert (result.key_source, result.model, result.notice) == ("own", "their-model", None)
    assert keys_used(log) == [("user-key", "their-model")]


def test_a_provider_the_app_has_no_key_for_works_on_the_users_key():
    sent = []

    def openai(request):
        sent.append((str(request.url), request.headers["authorization"],
                     json.loads(request.content)))  # fmt: skip
        return httpx.Response(200, json={"model": "m", "choices": [{"message": {"content": "hi"}}]})

    client = AIClient(
        Settings(_env_file=None, gemini_api_key="app", generation_models="google:first"),
        genai_client=SimpleNamespace(models=Models("app", [])),
        http=httpx.Client(transport=httpx.MockTransport(openai)),
        key_store=lambda uid: {"openai": ("sk-user", None)},
        sleep=lambda _: None,
    )
    result = client.for_user(USER).generate("p")
    assert (result.provider, result.model, result.key_source) == ("openai", "gpt-4.1-mini", "own")
    url, auth, body = sent[0]
    assert url == "https://api.openai.com/v1/chat/completions" and auth == "Bearer sk-user"
    assert "temperature" not in body  # some OpenAI models reject it


def test_without_their_own_key_users_get_the_free_pool_exactly_as_before():
    client, log, _, _ = build()
    result = client.for_user(USER).generate("p")
    assert (result.key_source, result.notice) == ("default", None)
    assert keys_used(log) == [("app-key", "first")]


def test_a_refused_own_key_falls_back_and_is_reported_for_marking():
    client, log, records, _ = build(
        fail_by_key={"user-key": {"first": [401]}},
        own={USER: {"google": "user-key"}},
        chain="google:first",
    )
    assert client.for_user(USER).generate("p").key_source == "default"
    assert records[-1].rejected_keys == (("google", "401: fake 401"),)
    # The refused key is paused for everyone's next call, not asked again and again.
    client.for_user(USER).generate("p")
    assert keys_used(log).count(("user-key", "first")) == 1


def test_gemini_400_api_key_not_valid_counts_as_a_refused_key():
    client, _, records, _ = build(
        fail_by_key={"user-key": {"first": [api_error(400, "API key not valid. Please pass")]}},
        own={USER: {"google": "user-key"}},
        chain="google:first",
    )
    client.for_user(USER).generate("p")
    assert records[-1].rejected_keys[0][0] == "google"


def test_past_the_limit_only_the_users_own_key_is_used():
    client, log, _, _ = build(
        fail_by_key={"user-key": {"first": [404]}},
        own={USER: {"google": "user-key"}},
        chain="google:first",
    )
    with pytest.raises(AIUnavailable):
        client.for_user(USER, allow_default=False).generate("p")
    assert all(k == "user-key" for k, _ in keys_used(log))


def test_one_users_key_is_never_used_for_another_user():
    client, log, _, _ = build(own={USER: {"google": "user-key"}})
    client.for_user(OTHER).generate("p")
    client.generate("p")  # a guest: no user at all
    assert {k for k, _ in keys_used(log)} == {"app-key"}


def test_for_user_passes_test_fakes_through_unchanged():
    fake = object()
    assert for_user(fake, USER) is fake


def test_groq_uses_the_users_own_groq_key():
    sent = []

    def groq(request):
        sent.append(request.headers["authorization"])
        return httpx.Response(200, json={"model": "g", "choices": [{"message": {"content": "hi"}}]})

    client = AIClient(
        Settings(_env_file=None, groq_api_key="app-groq", generation_models="groq:g"),
        http=httpx.Client(transport=httpx.MockTransport(groq)),
        key_store=lambda uid: {"groq": "user-groq"},
        sleep=lambda _: None,
    )
    assert client.for_user(USER).generate("p").key_source == "own"
    assert sent == ["Bearer user-groq"]


# ---- the circuit breaker


def test_a_daily_quota_pauses_that_model_for_later_calls():
    quota = api_error(429, "Quota exceeded. Please retry in 20h1m0s.")
    client, log, _, _ = build(fail_by_key={"app-key": {"first": [quota]}})
    assert client.generate("p").model == "second"
    assert client.generate("p").model == "second"
    assert keys_used(log).count(("app-key", "first")) == 1  # not asked again


def test_three_failed_calls_in_a_row_pause_a_model_then_it_is_tested_again():
    timeouts = [httpx.ReadTimeout("slow")] * 20
    client, log, _, clock = build(fail_by_key={"app-key": {"first": timeouts}})
    for _ in range(3):  # each call: 2 tries on first, then second answers
        assert client.generate("p").model == "second"
    calls_before = keys_used(log).count(("app-key", "first"))
    assert calls_before == 6
    assert client.generate("p").model == "second"
    assert keys_used(log).count(("app-key", "first")) == calls_before  # skipped while open
    clock.now += 3600  # after the pause, one call tests it again
    client.generate("p")
    assert keys_used(log).count(("app-key", "first")) > calls_before


def test_success_closes_the_breaker():
    b = CircuitBreaker(clock=lambda: 0.0, threshold=2)
    b.failure("k")
    b.success("k")
    b.failure("k")
    assert b.paused_for("k") is None  # the count started again


def test_breaker_pauses_double_up_to_the_cap():
    now = [0.0]
    b = CircuitBreaker(clock=lambda: now[0], threshold=1, base=10, cap=25)
    b.failure("k")
    assert b.paused_for("k") == 10
    b.failure("k")
    assert b.paused_for("k") == 20
    b.failure("k")
    assert b.paused_for("k") == 25


def test_the_health_check_ignores_the_breaker():
    quota = api_error(429, "Quota exceeded. Please retry in 20h1m0s.")
    client, log, _, _ = build(fail_by_key={"app-key": {"first": [quota]}})
    client.generate("p")  # opens the breaker on first
    assert [c.model for c in client.check_models()] == ["first", "second"]
    assert keys_used(log).count(("app-key", "first")) == 2


# ---- records, tokens and settings


def test_every_call_is_recorded_with_tokens_and_never_any_text():
    usage = SimpleNamespace(
        prompt_token_count=700, candidates_token_count=90, thoughts_token_count=40
    )
    client, _, records, _ = build(usage=usage)
    client.for_user(USER).generate("secret prompt", purpose="draft")
    r = records[-1]
    assert (r.ok, r.purpose, r.kind, r.model, r.attempts, r.routes_tried) == (
        True,
        "draft",
        "generate",
        "first",
        1,
        1,
    )
    assert (r.prompt_tokens, r.output_tokens, r.thinking_tokens) == (700, 90, 40)
    assert "secret" not in repr(r)


def test_a_failed_call_is_recorded_too():
    client, _, records, _ = build(fail_by_key={"app-key": {"first": [404], "second": [404]}})
    with pytest.raises(AIUnavailable):
        client.generate("p")
    assert records[-1].ok is False and "404" in records[-1].error


def test_a_broken_recorder_never_breaks_a_draft():
    client, _, _, _ = build()

    def broken(_):
        raise RuntimeError("database down")

    client._recorder = broken
    assert client.generate("p").text == "draft by app-key"


def test_groq_token_counts_are_recorded():
    def groq(request):
        body = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "model": body["model"],
                "choices": [{"message": {"content": "hi"}}],
                "usage": {
                    "prompt_tokens": 500,
                    "completion_tokens": 80,
                    "completion_tokens_details": {"reasoning_tokens": 30},
                },
            },
        )

    client = AIClient(
        Settings(_env_file=None, groq_api_key="k", generation_models="groq:g"),
        http=httpx.Client(transport=httpx.MockTransport(groq)),
        sleep=lambda _: None,
    )
    r = client.generate("p")
    assert (r.prompt_tokens, r.output_tokens, r.thinking_tokens) == (500, 80, 30)


def test_small_jobs_use_the_light_chain_and_drafts_the_main_one():
    client, log, _, _ = build(chain="google:big", generation_models_light="google:small")
    client.generate("p", purpose="voice_card")
    client.generate("p", purpose="summary")
    client.generate("p", purpose="draft")
    assert [m for _, m in keys_used(log)] == ["small", "small", "big"]


def test_thinking_level_is_sent_only_when_set():
    client, log, _, _ = build(chain="google:first")
    client.generate("p")
    assert log[-1][3].thinking_config is None
    client, log, _, _ = build(chain="google:first", gemini_thinking_level="low")
    client.generate("p")
    assert log[-1][3].thinking_config.thinking_level.value == "LOW"


# ---- embeddings


def test_the_same_topic_is_embedded_once_per_user():
    client, log, records, _ = build()
    a = client.for_user(USER).embed_query("shipped the importer")
    b = client.for_user(USER).embed_query("shipped the importer")  # the next platform
    assert a == b
    assert len(keys_used(log, "embed")) == 1
    client.for_user(OTHER).embed_query("shipped the importer")  # never another user's cache
    assert len(keys_used(log, "embed")) == 2
    assert len(records) == 2


def test_embeddings_never_use_the_users_key():
    client, log, records, _ = build(own={USER: {"google": "user-key"}})
    client.for_user(USER).embed_documents(["a post"])
    assert keys_used(log, "embed") == [("app-key", "gemini-embedding-2")]
    assert records[-1].key_source == "default" and records[-1].items == 1


def test_embeddings_raise_for_the_queue_when_every_key_fails():
    quota = 429
    client, _, records, _ = build(fail_by_key={"app-key": {"gemini-embedding-2": [quota] * 9}})
    with pytest.raises(EmbeddingUnavailable):
        client.embed_documents(["a post"])
    assert records[-1].ok is False


# ---- checking a key before it is saved


def test_check_key_makes_one_tiny_call_with_the_chosen_model():
    client, log, _, _ = build()
    client.check_key("google", "user-key", "their-model")
    assert keys_used(log) == [("user-key", "their-model")]


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (400, KeyRejected),
        (403, KeyRejected),
        (404, KeyRejected),  # a model this key can't use
        (api_error(429, "Quota exceeded. Please retry in 20h1m0s."), KeyRejected),
        (429, KeyCheckUnavailable),  # a per-minute limit: try again
        (503, KeyCheckUnavailable),
    ],
)
def test_check_key_refusals_and_outages(error, expected):
    client, _, _, _ = build(fail_by_key={"user-key": {"gemini-flash-latest": [error]}})
    with pytest.raises(expected):
        client.check_key("google", "user-key", "gemini-flash-latest")


@pytest.mark.parametrize(
    ("status", "error"), [(200, None), (401, KeyRejected), (502, KeyCheckUnavailable)]
)
def test_check_key_on_an_openai_compatible_provider(status, error):
    def reply(request):
        if status == 200:
            return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})
        return httpx.Response(status, json={"error": {"message": "x"}})

    client = AIClient(
        Settings(_env_file=None), http=httpx.Client(transport=httpx.MockTransport(reply))
    )
    if error is None:
        client.check_key("mistral", "user-key-000")
    else:
        with pytest.raises(error):
            client.check_key("mistral", "user-key-000")


@pytest.mark.parametrize(
    "error",
    [
        api_error(429, "You exceeded your current quota (insufficient_quota)"),
        api_error(402, "Insufficient credits"),
    ],
)
def test_a_key_without_credit_is_refused_and_not_retried(error):
    client, log, records, _ = build(
        fail_by_key={"user-key": {"first": [error]}},
        own={USER: {"google": ("user-key", "first")}},
        chain="google:first",
    )
    assert client.for_user(USER).generate("p").key_source == "default"
    assert keys_used(log).count(("user-key", "first")) == 1  # no retry on an empty wallet
    assert records[-1].rejected_keys[0][0] == "google"
    client2, _, _, _ = build(fail_by_key={"user-key": {"first": [error]}})
    with pytest.raises(KeyRejected, match="no credit"):
        client2.check_key("google", "user-key", "first")


def test_anthropic_overload_is_retried_and_odd_errors_fall_back(monkeypatch):
    import anthropic

    calls = []

    class FakeMessages:
        def create(self, **kw):
            calls.append(kw["model"])
            if len(calls) == 1:
                raise anthropic.APIStatusError(
                    "overloaded",
                    response=httpx.Response(529, request=httpx.Request("POST", "https://x")),
                    body=None,
                )
            if len(calls) == 2:
                return SimpleNamespace(
                    stop_reason="end_turn",
                    content=[SimpleNamespace(type="text", text="hello from claude")],
                    usage=SimpleNamespace(input_tokens=10, output_tokens=3),
                    model="claude-x",
                )
            raise anthropic.APIError(
                "odd reply", request=httpx.Request("POST", "https://x"), body=None
            )

    fake = SimpleNamespace(messages=FakeMessages(), beta=SimpleNamespace(messages=FakeMessages()))
    monkeypatch.setattr(anthropic, "Anthropic", lambda **kw: fake)
    client, log, _, _ = build(own={USER: {"anthropic": ("sk-ant-user", "claude-x")}})
    result = client.for_user(USER).generate("p")
    assert (result.provider, result.text, result.key_source) == (
        "anthropic",
        "hello from claude",
        "own",
    )
    assert calls == ["claude-x", "claude-x"]  # 529 retried once, then answered
    fallback = client.for_user(USER).generate("p")  # an unreadable reply: the free pool writes
    assert fallback.key_source == "default" and fallback.notice
