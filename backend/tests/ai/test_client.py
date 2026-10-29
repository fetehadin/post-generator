"""The AI client is tested against a fake Gemini: no test ever calls a real API."""

import json
from types import SimpleNamespace

import httpx
import pytest
from google.genai import errors

from app.ai.client import (
    DOC_PREFIX,
    QUERY_PREFIX,
    AIClient,
    AIUnavailable,
    EmbeddingUnavailable,
    retry_after,
)
from app.core.config import Settings


def api_error(code: int) -> Exception:
    """A fake Gemini error; code 0 means the network dropped (DNS failure, no connection)."""
    if code == 0:
        return httpx.ConnectError("[Errno -3] Temporary failure in name resolution")
    return errors.APIError(
        code, {"error": {"code": code, "message": f"fake {code}", "status": "X"}}
    )


class FakeModels:
    def __init__(self, embed_failures=(), gen_failures=None):
        self.embed_calls = []
        self.gen_calls = []
        self.embed_failures = list(embed_failures)
        self.gen_failures = gen_failures or {}

    def embed_content(self, model, contents, config):
        self.embed_calls.append(SimpleNamespace(model=model, contents=contents, config=config))
        if self.embed_failures:
            raise api_error(self.embed_failures.pop(0))
        return SimpleNamespace(
            embeddings=[SimpleNamespace(values=[float(i)] * 3) for i in range(len(contents))]
        )

    def generate_content(self, model, contents, config):
        self.gen_calls.append(model)
        queue = self.gen_failures.get(model, [])
        if queue:
            raise api_error(queue.pop(0))
        return SimpleNamespace(text=f"  draft from {model}  ", model_version=f"{model}-001")


def make(models: FakeModels, chain="google:first,google:second") -> tuple[AIClient, list]:
    waits: list[float] = []
    settings = Settings(_env_file=None, gemini_api_key="test", generation_models=chain)
    return AIClient(
        settings, genai_client=SimpleNamespace(models=models), sleep=waits.append
    ), waits


def test_embed_documents_one_content_per_post_with_prefix_and_dims():
    models = FakeModels()
    client, _ = make(models)
    vectors = client.embed_documents(["first post", "second post"])
    assert len(vectors) == 2
    call = models.embed_calls[0]
    assert call.model == "gemini-embedding-2"
    assert call.config.output_dimensionality == 768
    assert len(call.contents) == 2  # a merged single content would return one vector
    assert [c.parts[0].text for c in call.contents] == [
        DOC_PREFIX + "first post",
        DOC_PREFIX + "second post",
    ]


def test_embed_documents_batches_by_100():
    models = FakeModels()
    client, _ = make(models)
    assert len(client.embed_documents([f"post {i}" for i in range(250)])) == 250
    assert [len(c.contents) for c in models.embed_calls] == [100, 100, 50]


def test_embed_query_uses_query_prefix():
    models = FakeModels()
    client, _ = make(models)
    client.embed_query("telegram importer")
    assert models.embed_calls[0].contents[0].parts[0].text == QUERY_PREFIX + "telegram importer"


def test_embedding_retries_rate_limits_then_succeeds():
    models = FakeModels(embed_failures=[429, 503])
    client, waits = make(models)
    assert len(client.embed_documents(["post"])) == 1
    assert waits == [2.0, 4.0]


def test_embedding_never_falls_back_and_raises_after_retries():
    models = FakeModels(embed_failures=[429] * 10)
    client, _ = make(models)
    with pytest.raises(EmbeddingUnavailable):
        client.embed_documents(["post"])
    assert {c.model for c in models.embed_calls} == {"gemini-embedding-2"}


def test_embedding_retries_network_drops_then_succeeds():
    models = FakeModels(embed_failures=[0, 0])
    client, waits = make(models)
    assert len(client.embed_documents(["post"])) == 1
    assert waits == [2.0, 4.0]


def test_embedding_raises_clearly_when_the_network_stays_down():
    client, _ = make(FakeModels(embed_failures=[0] * 10))
    with pytest.raises(EmbeddingUnavailable, match="network error"):
        client.embed_documents(["post"])


def test_embedding_does_not_retry_bad_requests():
    models = FakeModels(embed_failures=[400])
    client, waits = make(models)
    with pytest.raises(EmbeddingUnavailable):
        client.embed_query("x")
    assert waits == []


def test_generate_records_model_and_version():
    client, _ = make(FakeModels())
    result = client.generate("prompt")
    assert (result.text, result.model, result.provider, result.model_version) == (
        "draft from first",
        "first",
        "google",
        "first-001",
    )


def test_generate_falls_back_to_next_model_when_one_is_gone():
    models = FakeModels(gen_failures={"first": [404]})
    client, _ = make(models)
    result = client.generate("prompt")
    assert result.model == "second"
    assert models.gen_calls == ["first", "second"]


def test_generate_retries_429_on_same_model_before_moving_on():
    models = FakeModels(gen_failures={"first": [429]})
    client, waits = make(models)
    assert client.generate("prompt").model == "first"
    assert waits == [2.0]


def test_generate_survives_a_network_drop():
    models = FakeModels(gen_failures={"first": [0]})
    client, waits = make(models)
    assert client.generate("prompt").model == "first"
    assert waits == [2.0]


def test_generate_raises_ai_unavailable_when_the_network_stays_down():
    models = FakeModels(gen_failures={"first": [0] * 10, "second": [0] * 10})
    client, _ = make(models)
    with pytest.raises(AIUnavailable, match="network error"):
        client.generate("prompt")


def test_generate_skips_unsupported_provider_and_fails_clearly_when_all_fail():
    models = FakeModels(gen_failures={"only": [500] * 10})
    client, _ = make(models, chain="mistral:small,google:only")
    with pytest.raises(AIUnavailable, match="mistral:small unsupported"):
        client.generate("prompt")


class FakeGroq:
    """A fake Groq endpoint: answers with the queued statuses first, then a draft."""

    def __init__(self, statuses=(), retry_after=None):
        self.statuses = list(statuses)
        self.retry_after = retry_after
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.statuses:
            code = self.statuses.pop(0)
            headers = {"retry-after": self.retry_after} if self.retry_after else {}
            return httpx.Response(
                code, json={"error": {"message": f"fake {code}"}}, headers=headers
            )
        body = json.loads(request.content)
        return httpx.Response(
            200,
            json={"model": body["model"], "choices": [{"message": {"content": " groq draft "}}]},
        )


def make_groq(groq: FakeGroq, models=None, chain="google:first,groq:openai/gpt-oss-120b", key="k"):
    waits: list[float] = []
    settings = Settings(
        _env_file=None, gemini_api_key="test", groq_api_key=key, generation_models=chain
    )
    client = AIClient(
        settings,
        genai_client=SimpleNamespace(models=models or FakeModels()),
        sleep=waits.append,
        http=httpx.Client(transport=httpx.MockTransport(groq)),
    )
    return client, waits


def test_groq_is_the_fallback_when_gemini_fails_and_is_recorded():
    groq = FakeGroq()
    client, _ = make_groq(groq, models=FakeModels(gen_failures={"first": [404]}))
    result = client.generate("the prompt", temperature=0.7)
    assert (result.text, result.provider, result.model) == (
        "groq draft",
        "groq",
        "openai/gpt-oss-120b",
    )
    sent = json.loads(groq.requests[0].content)
    assert groq.requests[0].headers["authorization"] == "Bearer k"
    assert sent["messages"] == [{"role": "user", "content": "the prompt"}]
    assert sent["temperature"] == 0.7
    # A reasoning model returns only its answer, never its reasoning.
    assert sent["include_reasoning"] is False


def test_groq_retries_a_rate_limit_waiting_as_asked():
    groq = FakeGroq(statuses=[429], retry_after="7")
    client, waits = make_groq(groq, chain="groq:qwen/qwen3.8-27b")
    assert client.generate("p").provider == "groq"
    assert waits == [8.0]  # the server's 7 s, plus a second of margin
    assert "include_reasoning" not in json.loads(groq.requests[-1].content)


def test_groq_daily_limit_fails_fast_and_says_why():
    groq = FakeGroq(statuses=[429], retry_after="20000")
    client, waits = make_groq(groq, chain="groq:openai/gpt-oss-120b")
    with pytest.raises(AIUnavailable, match="429: fake 429"):
        client.generate("p")
    assert waits == [] and len(groq.requests) == 1


def test_groq_without_a_key_is_skipped_not_called():
    groq = FakeGroq()
    client, _ = make_groq(groq, chain="groq:openai/gpt-oss-120b,google:first", key="")
    assert client.generate("p").provider == "google"
    assert groq.requests == []


@pytest.mark.parametrize(
    "reply",
    [
        httpx.Response(200, text="<html>not json</html>"),
        httpx.Response(200, json={"choices": []}),
        httpx.Response(200, json={"choices": [{"message": {"content": "   "}}]}),
        httpx.Response(200, json={"choices": [{"message": {"content": None}}]}),
    ],
    ids=["not-json", "no-choices", "blank", "null"],
)
def test_groq_unreadable_or_empty_reply_moves_on_instead_of_saving_nothing(reply):
    client = AIClient(
        Settings(
            _env_file=None,
            gemini_api_key="test",
            groq_api_key="k",
            generation_models="groq:openai/gpt-oss-120b,google:first",
        ),
        genai_client=SimpleNamespace(models=FakeModels()),
        sleep=lambda _: None,
        http=httpx.Client(transport=httpx.MockTransport(lambda _: reply)),
    )
    result = client.generate("p")
    assert (result.provider, result.text) == ("google", "draft from first")


def test_gemini_blank_reply_moves_on_and_all_blank_fails_clearly():
    class Blank(FakeModels):
        def generate_content(self, model, contents, config):
            self.gen_calls.append(model)
            if model == "first":
                return SimpleNamespace(text="  ", model_version=None)
            return super().generate_content(model, contents, config)

    client, _ = make(Blank())
    assert client.generate("p").model == "second"
    client, _ = make(Blank(), chain="google:first")
    with pytest.raises(AIUnavailable, match="empty reply"):
        client.generate("p")


def test_chain_parsing_defaults_provider_to_google():
    s = Settings(_env_file=None, generation_models=" google:a , b,groq:c ")
    assert s.generation_chain == [("google", "a"), ("google", "b"), ("groq", "c")]


def quota_error(hint: str) -> errors.APIError:
    return errors.APIError(
        429,
        {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": f"Quota. {hint}"}},
    )


@pytest.mark.parametrize(
    ("hint", "seconds"),
    [
        ("Please retry in 15.4s.", 15.4),
        ("Please retry in 22h50m23.5s.", 22 * 3600 + 50 * 60 + 23.5),
        ("Please retry in 3m2s.", 182.0),
        ("'retryDelay': '41s'", 41.0),
        ("no hint here", None),
    ],
)
def test_retry_after_reads_every_hint_format(hint, seconds):
    assert retry_after(quota_error(hint)) == seconds


def test_daily_quota_moves_to_the_next_model_without_waiting():
    class DailyQuota(FakeModels):
        def generate_content(self, model, contents, config):
            if model == "first":
                self.gen_calls.append(model)
                raise quota_error("Please retry in 22h50m23.6s.")
            return super().generate_content(model, contents, config)

    models = DailyQuota()
    client, waits = make(models)
    assert client.generate("prompt").model == "second"
    assert models.gen_calls == ["first", "second"]
    assert waits == []


def test_daily_quota_on_embeddings_fails_fast_for_the_queue_to_retry_later():
    class DailyQuota(FakeModels):
        def embed_content(self, model, contents, config):
            self.embed_calls.append(model)
            raise quota_error("Please retry in 20h1m0s.")

    models = DailyQuota()
    client, waits = make(models)
    with pytest.raises(EmbeddingUnavailable):
        client.embed_documents(["post"])
    assert waits == []
    assert len(models.embed_calls) == 1


def test_backoff_waits_as_long_as_the_server_asks():
    class HintedModels(FakeModels):
        def embed_content(self, model, contents, config):
            if not self.embed_calls:
                self.embed_calls.append(1)
                raise errors.APIError(
                    429,
                    {
                        "error": {
                            "code": 429,
                            "status": "RESOURCE_EXHAUSTED",
                            "message": "Quota exceeded. Please retry in 15.4s.",
                        }
                    },
                )
            return super().embed_content(model, contents, config)

    client, waits = make(HintedModels())
    client.embed_query("x")
    assert waits == [16.4]  # the server's 15.4s + 1s margin, not the 2s default


def test_the_real_client_has_a_timeout(monkeypatch):
    """Without one, a dropped connection hangs a draft forever (seen on a flaky network)."""
    from app.ai import client as client_module

    seen = {}
    monkeypatch.setattr(
        client_module.genai, "Client", lambda **kw: seen.update(kw) or SimpleNamespace()
    )
    settings = Settings(_env_file=None, gemini_api_key="test", ai_timeout_seconds=45)
    AIClient(settings).client  # noqa: B018 (building the client is the point)
    assert seen["http_options"].timeout == 45_000


def test_a_timeout_is_retried_like_a_network_drop():
    import httpx

    class SlowOnce(FakeModels):
        def generate_content(self, model, contents, config):
            self.gen_calls.append(model)
            if len(self.gen_calls) == 1:
                raise httpx.ReadTimeout("no answer in 60 s")
            return SimpleNamespace(text="ok", model_version="v")

    client, waits = make(SlowOnce())
    assert client.generate("prompt").text == "ok"
    assert waits == [2.0]
