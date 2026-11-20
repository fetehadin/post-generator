"""The local embedding service (FR-41): a fake model, so tests never download one."""

import pytest

from app.ai import local_embed
from app.ai.local_embed import LocalEmbedder, cosine


class FakeModel:
    def __init__(self, dims=4):
        self.dims, self.seen = dims, []

    def embed(self, texts, batch_size=32):
        self.seen.extend(texts)
        for t in texts:
            yield [float(len(t))] + [1.0] * (self.dims - 1)


def test_e5_models_get_query_and_passage_prefixes():
    fake = FakeModel()
    e = LocalEmbedder("intfloat/multilingual-e5-small", 4, backend=fake)
    e.embed_query("an idea")
    e.embed_passages(["a post", "another"])
    assert fake.seen == ["query: an idea", "passage: a post", "passage: another"]


def test_other_models_get_no_prefix():
    fake = FakeModel()
    e = LocalEmbedder("BAAI/bge-small-en-v1.5", 4, backend=fake)
    e.embed_query("an idea")
    e.embed_passages(["a post"])
    assert fake.seen == ["an idea", "a post"]


def test_wrong_vector_size_is_an_error_not_a_silent_mix():
    e = LocalEmbedder("BAAI/bge-small-en-v1.5", 384, backend=FakeModel(dims=4))
    with pytest.raises(ValueError, match="wrong size"):
        e.embed_query("x")


def test_empty_input_needs_no_model_call():
    fake = FakeModel()
    assert LocalEmbedder("m", 4, backend=fake).embed_passages([]) == []
    assert fake.seen == []


def test_the_model_loads_once_and_is_shared(monkeypatch):
    built = []

    class Counting(FakeModel):
        def __init__(self, name, cache_dir=None, threads=None):
            super().__init__(dims=4)
            built.append(name)

    import fastembed

    monkeypatch.setattr(fastembed, "TextEmbedding", Counting)
    e = LocalEmbedder("BAAI/bge-small-en-v1.5", 4)
    e.embed_query("a")
    e.embed_passages(["b", "c"])
    e.warm()
    assert built == ["BAAI/bge-small-en-v1.5"]


def test_the_app_has_one_embedder_built_from_settings(monkeypatch):
    monkeypatch.setattr(local_embed, "_default", None)
    first, second = local_embed.local_embedder(), local_embed.local_embedder()
    assert first is second
    assert (first.model_name, first.dims) == ("intfloat/multilingual-e5-small", 384)


def test_cosine():
    assert cosine([1, 0], [1, 0]) == pytest.approx(1.0)
    assert cosine([1, 0], [0, 1]) == pytest.approx(0.0)
    assert cosine([0, 0], [1, 1]) == 0.0
