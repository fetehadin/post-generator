"""The AI client is tested against a fake Gemini: no test ever calls a real API."""

from types import SimpleNamespace

import pytest
from google.genai import errors

from app.ai.client import (
    DOC_PREFIX,
    QUERY_PREFIX,
    AIClient,
    AIUnavailable,
    EmbeddingUnavailable,
)
from app.core.config import Settings


def api_error(code: int) -> errors.APIError:
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


def test_generate_skips_unsupported_provider_and_fails_clearly_when_all_fail():
    models = FakeModels(gen_failures={"only": [500] * 10})
    client, _ = make(models, chain="groq:llama,google:only")
    with pytest.raises(AIUnavailable, match="groq:llama unsupported"):
        client.generate("prompt")


def test_chain_parsing_defaults_provider_to_google():
    s = Settings(_env_file=None, generation_models=" google:a , b,groq:c ")
    assert s.generation_chain == [("google", "a"), ("google", "b"), ("groq", "c")]
