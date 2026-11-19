"""Local text embeddings (FR-41, FR-49): fastembed runs a small ONNX model on the CPU, free.

Two vector spaces, never mixed (CLAUDE.md rule 3):
- users' own posts: Gemini `gemini-embedding-2`, 768 dims (app/ai/client.py);
- the shared inspiration pool and the originality check: this local model, 384 dims.

Every stored vector says which model made it, and a query is only ever compared with vectors
from the same model. The model loads once (at startup, see main.py) and is shared by every
request; ONNX Runtime sessions are safe to call from several threads.

e5 models expect "query: " and "passage: " in front of the text; other models get none.
"""

import logging
import math
import threading
from collections.abc import Sequence

from app.ai import local_models
from app.core.config import get_settings

logger = logging.getLogger(__name__)
BATCH = 32


class LocalEmbedder:
    def __init__(
        self,
        model_name: str,
        dims: int,
        cache_dir: str | None = None,
        threads: int | None = None,
        backend: object | None = None,
    ) -> None:
        self.model_name, self.dims = model_name, dims
        self._cache_dir, self._threads = cache_dir or None, threads
        self._model = backend  # tests pass a fake with .embed(texts, batch_size=…)
        self._lock = threading.Lock()

    @property
    def model(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from fastembed import TextEmbedding

                    local_models.register(self.model_name)
                    logger.info("loading local embedding model %s", self.model_name)
                    self._model = TextEmbedding(
                        self.model_name, cache_dir=self._cache_dir, threads=self._threads
                    )
        return self._model

    @property
    def _e5(self) -> bool:
        return "e5" in self.model_name.lower()

    def embed_passages(self, texts: Sequence[str]) -> list[list[float]]:
        """Stored texts: inspiration posts, their structure notes, a finished draft."""
        prefix = "passage: " if self._e5 else ""
        return self._embed([prefix + t for t in texts])

    def embed_query(self, text: str) -> list[float]:
        """What we search with: the user's idea."""
        prefix = "query: " if self._e5 else ""
        return self._embed([prefix + text])[0]

    def _embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = [[float(x) for x in v] for v in self.model.embed(texts, batch_size=BATCH)]
        if len(vectors) != len(texts) or any(len(v) != self.dims for v in vectors):
            raise ValueError(
                f"{self.model_name} gave vectors of the wrong size; expected {self.dims}"
            )
        return vectors

    def warm(self) -> None:
        """Load the model and run it once, so the first user isn't the one who waits."""
        self.embed_query("warm up")


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


_default: LocalEmbedder | None = None
_default_lock = threading.Lock()


def local_embedder() -> LocalEmbedder:
    """The app's one local model, built from settings."""
    global _default
    with _default_lock:
        if _default is None:
            cfg = get_settings()
            _default = LocalEmbedder(
                cfg.local_embedding_model,
                cfg.local_embedding_dimensions,
                cfg.local_embedding_cache_dir,
                cfg.local_embedding_threads,
            )
    return _default
