"""The only module that talks to an AI provider (CLAUDE.md rule 2).

Embeddings use one fixed model and never fall back (C-7, FR-32): on repeated failure
they raise EmbeddingUnavailable so the import queue can retry later. Generation walks
the configured chain and records which model actually answered (FR-31, NFR-15).
"""

import logging
import re
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass

import httpx
from google import genai
from google.genai import errors, types

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

DOC_PREFIX = "title: none | text: "
QUERY_PREFIX = "task: search result | query: "
EMBED_BATCH = 100
RETRYABLE = {429, 500, 502, 503, 504}
MAX_WAIT = 90.0
# Gemini says how long to wait: "Please retry in 15.4s", "retry in 22h50m23.6s" (a daily
# quota) or a RetryInfo retryDelay "15s".
RETRY_HINT = re.compile(
    r"retry in ((?:\d+h)?(?:\d+m)?[\d.]+s)|retryDelay\W+([\d.]+s)", re.IGNORECASE
)
DURATION = re.compile(r"(?:(\d+)h)?(?:(\d+)m)?([\d.]+)s")


class AIUnavailable(Exception):
    """Every model in the generation chain failed."""


class EmbeddingUnavailable(Exception):
    """The embedding model kept failing; retry the import later, never switch models."""


@dataclass(frozen=True)
class GenerationResult:
    text: str
    model: str
    provider: str
    model_version: str | None


class AIClient:
    def __init__(
        self,
        settings: Settings | None = None,
        genai_client: object | None = None,
        sleep: Callable[[float], None] = time.sleep,
        max_attempts: int = 5,
    ) -> None:
        self.settings = settings or get_settings()
        self._client = genai_client
        self._sleep = sleep
        self.max_attempts = max_attempts

    @property
    def client(self):
        if self._client is None:
            if not self.settings.gemini_api_key:
                raise AIUnavailable("GEMINI_API_KEY is not set")
            # A timeout on every call: on a flaky connection a dropped request can otherwise
            # hang forever. A timeout is a network error, so it is retried like one.
            self._client = genai.Client(
                api_key=self.settings.gemini_api_key,
                http_options=types.HttpOptions(timeout=self.settings.ai_timeout_seconds * 1000),
            )
        return self._client

    # ---- embeddings ----
    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        """One vector per text, in order. Each text is its own content object:
        a plain list of strings would be embedded as ONE merged vector."""
        vectors: list[list[float]] = []
        for start in range(0, len(texts), EMBED_BATCH):
            batch = texts[start : start + EMBED_BATCH]
            vectors.extend(self._embed([DOC_PREFIX + t for t in batch]))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self._embed([QUERY_PREFIX + text])[0]

    def _embed(self, texts: list[str]) -> list[list[float]]:
        contents = [types.Content(parts=[types.Part(text=t)]) for t in texts]
        config = types.EmbedContentConfig(output_dimensionality=self.settings.embedding_dimensions)
        for attempt in range(1, self.max_attempts + 1):
            try:
                resp = self.client.models.embed_content(
                    model=self.settings.embedding_model, contents=contents, config=config
                )
                vectors = [list(e.values) for e in resp.embeddings]
                if len(vectors) != len(texts):
                    raise EmbeddingUnavailable(f"expected {len(texts)} vectors, got {len(vectors)}")
                return vectors
            except (errors.APIError, httpx.TransportError) as e:
                if not retryable(e) or attempt == self.max_attempts:
                    raise EmbeddingUnavailable(describe(e)) from e
                self._backoff(attempt, e)
        raise EmbeddingUnavailable("unreachable")

    # ---- generation ----
    def generate(
        self, prompt: str, purpose: str = "draft", temperature: float = 0.9
    ) -> GenerationResult:
        """Try each model in the chain; move on when one is down, rate-limited or removed."""
        failures = []
        for provider, model in self.settings.generation_chain:
            if provider != "google":
                # Second provider lands with FR-31's fallback work in Phase 6.
                logger.warning("skipping %s:%s, provider not supported yet", provider, model)
                failures.append(f"{provider}:{model} unsupported")
                continue
            try:
                return self._generate_google(model, prompt, temperature)
            except (errors.APIError, httpx.TransportError) as e:
                logger.warning("%s generation failed on %s: %s", purpose, model, describe(e))
                failures.append(f"{model} {describe(e)}")
        raise AIUnavailable("all models failed: " + "; ".join(failures))

    def _generate_google(self, model: str, prompt: str, temperature: float) -> GenerationResult:
        config = types.GenerateContentConfig(temperature=temperature)
        for attempt in range(1, self.max_attempts + 1):
            try:
                resp = self.client.models.generate_content(
                    model=model, contents=prompt, config=config
                )
                return GenerationResult(
                    text=(resp.text or "").strip(),
                    model=model,
                    provider="google",
                    model_version=getattr(resp, "model_version", None),
                )
            except (errors.APIError, httpx.TransportError) as e:
                # 429, 5xx and network drops get a few retries on the same model;
                # anything else moves on.
                if not retryable(e) or attempt == self.max_attempts:
                    raise
                self._backoff(attempt, e)
        raise AIUnavailable("unreachable")

    def _backoff(self, attempt: int, err: Exception) -> None:
        """Exponential backoff, but never shorter than what the server asked for."""
        wait = min(60.0, 2.0**attempt)
        hinted = retry_after(err)
        if hinted is not None:
            wait = min(MAX_WAIT, max(wait, hinted + 1.0))
        logger.info("AI call got %s, retrying in %.0fs", describe(err), wait)
        self._sleep(wait)


def retryable(err: Exception) -> bool:
    """Rate limits, server errors and network drops (DNS, refused, timeout) are worth a retry."""
    if isinstance(err, httpx.TransportError):
        return True
    if not isinstance(err, errors.APIError) or err.code not in RETRYABLE:
        return False
    # A wait longer than we'd ever sleep means a daily quota: move on now, don't spin.
    hinted = retry_after(err)
    return hinted is None or hinted <= MAX_WAIT


def describe(err: Exception) -> str:
    if isinstance(err, errors.APIError):
        return f"{err.code}: {err.message}"
    return f"network error ({type(err).__name__})"


def retry_after(err: Exception) -> float | None:
    text = f"{getattr(err, 'message', '')} {getattr(err, 'details', '')}"
    m = RETRY_HINT.search(text)
    if not m:
        return None
    h, mins, secs = DURATION.fullmatch(m.group(1) or m.group(2)).groups()
    return int(h or 0) * 3600 + int(mins or 0) * 60 + float(secs)


_default: AIClient | None = None


def default_client() -> AIClient:
    global _default
    if _default is None:
        _default = AIClient()
    return _default


def embed_documents(texts: Sequence[str]) -> list[list[float]]:
    return default_client().embed_documents(texts)


def embed_query(text: str) -> list[float]:
    return default_client().embed_query(text)


def generate(prompt: str, purpose: str = "draft") -> GenerationResult:
    return default_client().generate(prompt, purpose)
