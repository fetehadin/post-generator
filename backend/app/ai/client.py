"""The only module that talks to an AI provider (CLAUDE.md rule 2).

Embeddings use one fixed model and never fall back to another model (C-7, FR-32): on repeated
failure they raise EmbeddingUnavailable so the import queue can retry later. Generation walks
the configured chain and records which model actually answered (FR-31, NFR-15).

Providers: Gemini through its SDK, and Groq as the fallback. Groq speaks the OpenAI chat
format, so a plain HTTP call over httpx is enough; no second SDK.

Keys (FR-48): a user may add their own Gemini or Groq key. Their calls try the user's keys
first (same models, same prompts), then the app's own keys. A "route" is one model with one
key; a circuit breaker per route skips what is known to be down (see breaker.py). Every
logical call is reported to a recorder (tokens, time, key source; never the text), which
the app saves to `ai_calls`.
"""

import hashlib
import logging
import re
import threading
import time
import uuid
from collections import OrderedDict
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

import httpx
from google import genai
from google.genai import errors, types

from app.ai.breaker import CircuitBreaker
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
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"
PROVIDERS = ("google", "groq")

MODEL_SHARE = 0.6  # of the time left, for one model while backups remain
BACKUP_ATTEMPTS = 2  # tries on one route while a backup remains; the last route gets them all
GEMINI_MIN_SECONDS = 10  # Gemini's smallest allowed call deadline
HEALTH_PROMPT = "Reply with the single word OK."
HEALTH_SECONDS = 30  # per model in the daily check
AUTH_HOLD = 3600.0  # a rejected key or a removed model: don't ask again for an hour
QUERY_CACHE_SIZE = 512  # topic vectors; the same text always gives the same vector


class ProviderError(Exception):
    """An HTTP error from Groq, carrying what Gemini's APIError carries: a status code, a
    message, and how long the server asked us to wait (its Retry-After header)."""

    def __init__(self, code: int, message: str, wait: float | None = None) -> None:
        super().__init__(f"{code}: {message}")
        self.code, self.message, self.wait = code, message, wait


class AIUnavailable(Exception):
    """Every model in the generation chain failed."""


class EmbeddingUnavailable(Exception):
    """The embedding model kept failing; retry the import later, never switch models."""


class KeyRejected(Exception):
    """The provider refused a user's key (wrong, revoked, or without access)."""


class KeyCheckUnavailable(Exception):
    """The provider couldn't be reached to check a key; nothing is decided."""


@dataclass(frozen=True)
class GenerationResult:
    text: str
    model: str
    provider: str
    model_version: str | None
    key_source: str = "default"  # "own": the user's key wrote it (FR-48), so it isn't counted
    prompt_tokens: int | None = None
    output_tokens: int | None = None
    thinking_tokens: int | None = None


@dataclass(frozen=True)
class ModelCheck:
    provider: str
    model: str
    error: str | None  # None: the model answered


@dataclass(frozen=True)
class CallRecord:
    """One logical AI call, for `ai_calls`. Never any prompt, post or key text."""

    user_id: uuid.UUID | None
    purpose: str
    kind: str  # "generate" | "embed"
    ok: bool
    provider: str | None
    model: str | None
    model_version: str | None
    key_source: str | None
    error: str | None
    attempts: int
    routes_tried: int
    latency_ms: int
    prompt_tokens: int | None = None
    output_tokens: int | None = None
    thinking_tokens: int | None = None
    items: int = 1
    rejected_keys: tuple[tuple[str, str], ...] = ()  # (provider, why) for the user's own keys


@dataclass(frozen=True)
class Route:
    """One model with one key."""

    provider: str
    model: str
    key: str
    source: str  # "own" | "default"

    @property
    def breaker_key(self) -> str:
        who = key_fingerprint(self.key) if self.source == "own" else "default"
        return f"{self.provider}:{self.model}:{who}"


@dataclass
class Tally:
    attempts: int = 0
    tried: int = 0
    rejected: dict[str, str] = field(default_factory=dict)


KeyStore = Callable[[uuid.UUID], dict[str, str]]
Recorder = Callable[[CallRecord], None]


class AIClient:
    def __init__(
        self,
        settings: Settings | None = None,
        genai_client: object | None = None,
        sleep: Callable[[float], None] = time.sleep,
        max_attempts: int = 5,
        http: httpx.Client | None = None,
        clock: Callable[[], float] = time.monotonic,
        key_store: KeyStore | None = None,
        recorder: Recorder | None = None,
        genai_factory: Callable[[str], object] | None = None,
        breaker: CircuitBreaker | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._client = genai_client
        self._sleep = sleep
        self.max_attempts = max_attempts
        self._http = http
        self._clock = clock
        self._key_store = key_store
        self._recorder = recorder
        self._genai_factory = genai_factory
        self.breaker = breaker or CircuitBreaker(clock=clock)
        self._own_clients: OrderedDict[str, object] = OrderedDict()
        self._query_cache: OrderedDict[str, tuple[float, ...]] = OrderedDict()
        self._lock = threading.Lock()

    def for_user(self, user_id: uuid.UUID, allow_default: bool = True) -> "UserAI":
        return UserAI(self, user_id, allow_default)

    @property
    def client(self):
        """The Gemini client on the app's own key."""
        if self._client is None:
            if not self.settings.gemini_api_key:
                raise AIUnavailable("GEMINI_API_KEY is not set")
            self._client = self._new_genai(self.settings.gemini_api_key)
        return self._client

    def _new_genai(self, key: str):
        if self._genai_factory is not None:
            return self._genai_factory(key)
        # A timeout on every call: on a flaky connection a dropped request can otherwise
        # hang forever. A timeout is a network error, so it is retried like one.
        return genai.Client(
            api_key=key,
            http_options=types.HttpOptions(timeout=self.settings.ai_timeout_seconds * 1000),
        )

    def _gemini(self, route: Route | None):
        if route is None or route.source == "default":
            return self.client
        with self._lock:  # a small LRU: one SDK client per user key in use
            c = self._own_clients.pop(route.key, None) or self._new_genai(route.key)
            self._own_clients[route.key] = c
            while len(self._own_clients) > 64:
                self._own_clients.popitem(last=False)
        return c

    # ---- routes ----
    def _own_keys(self, user_id: uuid.UUID | None) -> dict[str, str]:
        if user_id is None or self._key_store is None:
            return {}
        try:
            return self._key_store(user_id)
        except Exception:  # never let a key lookup stop a draft; use the app's keys
            logger.exception("couldn't load a user's own AI keys")
            return {}

    def _default_key(self, provider: str) -> str:
        return {"google": self.settings.gemini_api_key, "groq": self.settings.groq_api_key}.get(
            provider, ""
        )

    def _routes(
        self, chain: list[tuple[str, str]], own: dict[str, str], allow_default: bool
    ) -> list[Route]:
        """The user's keys first, through the whole chain, then the app's own keys: someone
        who brought a key uses their own quota before anyone else's."""
        routes = [Route(p, m, own[p], "own") for p, m in chain if own.get(p)]
        if allow_default:
            routes += [Route(p, m, self._default_key(p), "default") for p, m in chain]
        return routes

    # ---- embeddings ----
    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return self._embed_documents(texts, None, True)

    def embed_query(self, text: str) -> list[float]:
        return self._embed_query(text, None, True)

    def _embed_documents(
        self, texts: Sequence[str], user_id: uuid.UUID | None, allow_default: bool
    ) -> list[list[float]]:
        """One vector per text, in order. Each text is its own content object:
        a plain list of strings would be embedded as ONE merged vector."""
        vectors: list[list[float]] = []
        for start in range(0, len(texts), EMBED_BATCH):
            batch = texts[start : start + EMBED_BATCH]
            vectors.extend(
                self._embed([DOC_PREFIX + t for t in batch], user_id, allow_default, "embed_posts")
            )
        return vectors

    def _embed_query(self, text: str, user_id: uuid.UUID | None, allow_default: bool):
        # One check-in drafted for three platforms embeds the same topic three times; the
        # model is fixed, so the vector is too. Per user, so a fast answer never hints that
        # someone else wrote the same words.
        cache_key = hashlib.sha256(f"{user_id}|{text}".encode()).hexdigest()
        with self._lock:
            hit = self._query_cache.get(cache_key)
            if hit is not None:
                self._query_cache.move_to_end(cache_key)
                return list(hit)
        vector = self._embed([QUERY_PREFIX + text], user_id, allow_default, "embed_query")[0]
        with self._lock:
            self._query_cache[cache_key] = tuple(vector)
            while len(self._query_cache) > QUERY_CACHE_SIZE:
                self._query_cache.popitem(last=False)
        return vector

    def _embed(
        self, texts: list[str], user_id: uuid.UUID | None, allow_default: bool, purpose: str
    ) -> list[list[float]]:
        """The fixed embedding model, on the user's Gemini key first, then the app's. The model
        never changes (rule 3); only whose quota pays for it."""
        started, tally, failures = self._clock(), Tally(), []
        model = self.settings.embedding_model
        routes = self._routes([("google", model)], self._own_keys(user_id), allow_default)
        for route in routes:
            if not route.key:
                failures.append("no Gemini key")
                continue
            paused = self.breaker.paused_for(route.breaker_key)
            if paused:
                failures.append(f"{route.source} key paused {paused:.0f}s after failures")
                continue
            tally.tried += 1
            try:
                vectors = self._embed_once(route, texts, tally)
            except EmbeddingUnavailable as e:
                self._fail(route, e.__cause__ or e, tally)
                failures.append(str(e))
                continue
            self.breaker.success(route.breaker_key)
            self._record(
                CallRecord(
                    user_id, purpose, "embed", True, "google", model, None, route.source, None,
                    tally.attempts, tally.tried, self._ms(started), items=len(texts),
                    rejected_keys=tuple(tally.rejected.items()),
                )
            )  # fmt: skip
            return vectors
        reason = "; ".join(failures) or "no route"
        self._record(
            CallRecord(
                user_id, purpose, "embed", False, None, model, None, None, reason[:300],
                tally.attempts, tally.tried, self._ms(started), items=len(texts),
                rejected_keys=tuple(tally.rejected.items()),
            )
        )  # fmt: skip
        raise EmbeddingUnavailable(reason)

    def _embed_once(self, route: Route, texts: list[str], tally: Tally) -> list[list[float]]:
        contents = [types.Content(parts=[types.Part(text=t)]) for t in texts]
        config = types.EmbedContentConfig(output_dimensionality=self.settings.embedding_dimensions)
        for attempt in range(1, self.max_attempts + 1):
            tally.attempts += 1
            try:
                resp = self._gemini(route).models.embed_content(
                    model=route.model, contents=contents, config=config
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
        return self._generate(prompt, purpose, temperature, None, True)

    def _generate(
        self,
        prompt: str,
        purpose: str,
        temperature: float,
        user_id: uuid.UUID | None,
        allow_default: bool,
    ) -> GenerationResult:
        """Try each route; move on when one is down, rate-limited, removed or paused.
        Everything together stops at the generation deadline (NFR-3)."""
        started = self._clock()
        deadline = started + self.settings.generation_deadline_seconds
        failures: list[str] = []
        tally = Tally()
        providers = {"google": self._generate_google, "groq": self._generate_groq}
        usable: list[Route] = []
        own = self._own_keys(user_id)
        for route in self._routes(self.settings.chain_for(purpose), own, allow_default):
            if route.provider not in providers:
                logger.warning("skipping %s:%s, unknown provider", route.provider, route.model)
                failures.append(f"{route.provider}:{route.model} unsupported")
            elif not route.key:
                failures.append(f"{route.model}: no {route.provider} key")
            elif paused := self.breaker.paused_for(route.breaker_key):
                failures.append(f"{route.model} paused {paused:.0f}s after failures")
            else:
                usable.append(route)
        for i, route in enumerate(usable):
            if self._clock() >= deadline:
                failures.append(f"{route.model} not tried, out of time")
                continue
            last = i == len(usable) - 1
            # While backups remain, one route may use only part of what's left, and only a
            # couple of tries, so a slow or failing model can't leave the backups no time.
            now = self._clock()
            share = deadline if last else now + (deadline - now) * MODEL_SHARE
            attempts = self.max_attempts if last else BACKUP_ATTEMPTS
            tally.tried += 1
            try:
                result = providers[route.provider](
                    route.model, prompt, temperature, share, route=route, attempts=attempts,
                    tally=tally,
                )  # fmt: skip
            except (errors.APIError, ProviderError, httpx.TransportError, AIUnavailable) as e:
                logger.warning("%s generation failed on %s: %s", purpose, route.model, describe(e))
                self._fail(route, e, tally)
                failures.append(f"{route.model} {describe(e)}")
                continue
            self.breaker.success(route.breaker_key)
            self._record(
                CallRecord(
                    user_id, purpose, "generate", True, result.provider, result.model,
                    result.model_version, route.source, None, tally.attempts, tally.tried,
                    self._ms(started), result.prompt_tokens, result.output_tokens,
                    result.thinking_tokens, rejected_keys=tuple(tally.rejected.items()),
                )
            )  # fmt: skip
            return result
        reason = "all models failed: " + "; ".join(failures)
        self._record(
            CallRecord(
                user_id, purpose, "generate", False, None, None, None, None, reason[:300],
                tally.attempts, tally.tried, self._ms(started),
                rejected_keys=tuple(tally.rejected.items()),
            )
        )  # fmt: skip
        raise AIUnavailable(reason)

    def _fail(self, route: Route, err: BaseException, tally: Tally) -> None:
        """Tell the breaker, and note a user's key that the provider refused."""
        if route.source == "own" and is_key_problem(err):
            tally.rejected[route.provider] = describe(err)[:200]
        self.breaker.failure(route.breaker_key, hold_for(err))

    def check_models(self) -> list[ModelCheck]:
        """The daily health check (BUILD_PLAN Phase 6): one tiny prompt to every model in the
        chain on its own, on the app's keys and past the breaker, so a model that disappeared
        shows up before the fallback hides it."""
        providers = {"google": self._generate_google, "groq": self._generate_groq}
        checks = []
        for provider, model in self.settings.generation_chain:
            call = providers.get(provider)
            if call is None:
                checks.append(ModelCheck(provider, model, "unknown provider"))
                continue
            try:
                call(model, HEALTH_PROMPT, 0.0, self._clock() + HEALTH_SECONDS)
                checks.append(ModelCheck(provider, model, None))
            except (errors.APIError, ProviderError, httpx.TransportError, AIUnavailable) as e:
                checks.append(ModelCheck(provider, model, describe(e)))
        return checks

    def check_key(self, provider: str, key: str) -> None:
        """Ask the provider whether a user's key works, without spending any generation quota:
        Gemini reads the embedding model's details, Groq lists its models. Raises KeyRejected
        or KeyCheckUnavailable."""
        if provider == "google":
            try:
                self._new_genai(key).models.get(model=self.settings.embedding_model)
            except errors.APIError as e:
                if e.code in RETRYABLE:
                    raise KeyCheckUnavailable(describe(e)) from e
                raise KeyRejected(describe(e)) from e
            except httpx.TransportError as e:
                raise KeyCheckUnavailable(describe(e)) from e
            return
        if provider == "groq":
            try:
                resp = self.http.get(
                    GROQ_MODELS_URL, headers={"Authorization": f"Bearer {key}"}, timeout=15
                )
            except httpx.TransportError as e:
                raise KeyCheckUnavailable(describe(e)) from e
            if resp.status_code == 200:
                return
            err = _groq_error(resp)
            if resp.status_code in RETRYABLE:
                raise KeyCheckUnavailable(describe(err))
            raise KeyRejected(describe(err))
        raise KeyRejected(f"unknown provider {provider}")

    def _left(self, deadline: float) -> float:
        """Seconds for the next call: the usual timeout, or less near the deadline."""
        return max(1.0, min(float(self.settings.ai_timeout_seconds), deadline - self._clock()))

    def _generate_google(
        self,
        model: str,
        prompt: str,
        temperature: float,
        deadline: float,
        route: Route | None = None,
        attempts: int | None = None,
        tally: Tally | None = None,
    ) -> GenerationResult:
        tally = tally or Tally()
        for attempt in range(1, (attempts or self.max_attempts) + 1):
            if deadline - self._clock() < GEMINI_MIN_SECONDS:
                # Gemini refuses a call deadline under 10 s (400), so don't ask; move on.
                raise AIUnavailable(f"{model} not tried, under {GEMINI_MIN_SECONDS} s left")
            config = types.GenerateContentConfig(
                temperature=temperature,
                http_options=types.HttpOptions(timeout=int(self._left(deadline) * 1000)),
            )
            if level := self.settings.gemini_thinking_level.strip():
                config.thinking_config = types.ThinkingConfig(thinking_level=level.upper())
            tally.attempts += 1
            try:
                resp = self._gemini(route).models.generate_content(
                    model=model, contents=prompt, config=config
                )
                usage = getattr(resp, "usage_metadata", None)
                return GenerationResult(
                    text=_answer(resp.text),
                    model=model,
                    provider="google",
                    model_version=getattr(resp, "model_version", None),
                    key_source=route.source if route else "default",
                    prompt_tokens=getattr(usage, "prompt_token_count", None),
                    output_tokens=getattr(usage, "candidates_token_count", None),
                    thinking_tokens=getattr(usage, "thoughts_token_count", None),
                )
            except (errors.APIError, httpx.TransportError) as e:
                # 429, 5xx and network drops get a few retries on the same model;
                # anything else moves on.
                if not retryable(e) or attempt == (attempts or self.max_attempts):
                    raise
                self._backoff(attempt, e, deadline)
        raise AIUnavailable("unreachable")

    @property
    def http(self) -> httpx.Client:
        if self._http is None:
            self._http = httpx.Client(timeout=self.settings.ai_timeout_seconds)
        return self._http

    def _generate_groq(
        self,
        model: str,
        prompt: str,
        temperature: float,
        deadline: float,
        route: Route | None = None,
        attempts: int | None = None,
        tally: Tally | None = None,
    ) -> GenerationResult:
        tally = tally or Tally()
        key = route.key if route else self.settings.groq_api_key
        if not key:
            raise AIUnavailable("GROQ_API_KEY is not set")
        body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
        }
        if model.startswith("openai/gpt-oss"):
            # A reasoning model: think briefly and return only the answer, not the reasoning.
            body |= {"reasoning_effort": "low", "include_reasoning": False}
        headers = {"Authorization": f"Bearer {key}"}
        for attempt in range(1, (attempts or self.max_attempts) + 1):
            tally.attempts += 1
            try:
                resp = self.http.post(
                    GROQ_URL, json=body, headers=headers, timeout=self._left(deadline)
                )
                if resp.status_code != 200:
                    raise _groq_error(resp)
                try:
                    data = resp.json()
                    content = data["choices"][0]["message"].get("content")
                except (ValueError, KeyError, IndexError, TypeError, AttributeError) as e:
                    raise AIUnavailable(f"{model} sent a reply we couldn't read") from e
                usage = data.get("usage") or {}
                details = usage.get("completion_tokens_details") or {}
                return GenerationResult(
                    text=_answer(content),
                    model=model,
                    provider="groq",
                    model_version=data.get("model") or model,
                    key_source=route.source if route else "default",
                    prompt_tokens=usage.get("prompt_tokens"),
                    output_tokens=usage.get("completion_tokens"),
                    thinking_tokens=details.get("reasoning_tokens"),
                )
            except (ProviderError, httpx.TransportError) as e:
                if not retryable(e) or attempt == (attempts or self.max_attempts):
                    raise
                self._backoff(attempt, e, deadline)
        raise AIUnavailable("unreachable")

    def _backoff(self, attempt: int, err: Exception, deadline: float | None = None) -> None:
        """Exponential backoff, but never shorter than what the server asked for. A wait that
        would pass the generation deadline re-raises instead, so the chain moves on."""
        wait = min(60.0, 2.0**attempt)
        hinted = retry_after(err)
        if hinted is not None:
            wait = min(MAX_WAIT, max(wait, hinted + 1.0))
        if deadline is not None and self._clock() + wait >= deadline:
            raise err
        logger.info("AI call got %s, retrying in %.0fs", describe(err), wait)
        self._sleep(wait)

    def _ms(self, started: float) -> int:
        return int((self._clock() - started) * 1000)

    def _record(self, record: CallRecord) -> None:
        if self._recorder is None:
            return
        try:
            self._recorder(record)
        except Exception:  # measuring must never break a draft
            logger.exception("couldn't record an AI call")


class UserAI:
    """The client acting for one user: their own keys first (FR-48), their calls recorded
    under their id. `allow_default=False` keeps a user who is past today's limit on their own
    keys only. Same methods as AIClient, so services take either."""

    def __init__(self, client: AIClient, user_id: uuid.UUID, allow_default: bool = True) -> None:
        self.client, self.user_id, self.allow_default = client, user_id, allow_default

    def generate(
        self, prompt: str, purpose: str = "draft", temperature: float = 0.9
    ) -> GenerationResult:
        return self.client._generate(prompt, purpose, temperature, self.user_id, self.allow_default)

    def embed_query(self, text: str) -> list[float]:
        return self.client._embed_query(text, self.user_id, self.allow_default)

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return self.client._embed_documents(texts, self.user_id, self.allow_default)


def for_user(ai, user_id: uuid.UUID, allow_default: bool = True):
    """Bind the real client to a user; a test fake (or an already bound client) passes through."""
    return ai.for_user(user_id, allow_default) if isinstance(ai, AIClient) else ai


def key_fingerprint(key: str) -> str:
    """A short, one-way label for a key: enough to tell keys apart, useless to an attacker."""
    return hashlib.sha256(key.encode()).hexdigest()[:12]


def _answer(text: str | None) -> str:
    """The model's text, or AIUnavailable when it's blank, so the chain moves on instead of
    saving an empty draft."""
    text = (text or "").strip()
    if not text:
        raise AIUnavailable("the model sent an empty reply")
    return text


def retryable(err: Exception) -> bool:
    """Rate limits, server errors and network drops (DNS, refused, timeout) are worth a retry."""
    if isinstance(err, httpx.TransportError):
        return True
    if not isinstance(err, errors.APIError | ProviderError) or err.code not in RETRYABLE:
        return False
    # A wait longer than we'd ever sleep means a daily quota: move on now, don't spin.
    hinted = retry_after(err)
    return hinted is None or hinted <= MAX_WAIT


def is_key_problem(err: BaseException) -> bool:
    """401/403, or Gemini's 400 "API key not valid": the key itself is the problem."""
    if not isinstance(err, errors.APIError | ProviderError):
        return False
    if err.code in (401, 403):
        return True
    return err.code == 400 and "api key" in str(err.message).lower()


def hold_for(err: BaseException) -> float | None:
    """How long a failure is known to last, for the breaker; None when it doesn't say."""
    if is_key_problem(err):
        return AUTH_HOLD
    if isinstance(err, errors.APIError | ProviderError):
        if err.code == 404:  # the model was removed or renamed
            return AUTH_HOLD
        hinted = retry_after(err)
        if hinted is not None and hinted > MAX_WAIT:  # a daily quota
            return hinted
    return None


def describe(err: BaseException) -> str:
    if isinstance(err, errors.APIError | ProviderError):
        return f"{err.code}: {err.message}"
    if isinstance(err, AIUnavailable | EmbeddingUnavailable):
        return str(err)
    return f"network error ({type(err).__name__})"


def retry_after(err: BaseException) -> float | None:
    if isinstance(err, ProviderError):
        return err.wait
    text = f"{getattr(err, 'message', '')} {getattr(err, 'details', '')}"
    m = RETRY_HINT.search(text)
    if not m:
        return None
    h, mins, secs = DURATION.fullmatch(m.group(1) or m.group(2)).groups()
    return int(h or 0) * 3600 + int(mins or 0) * 60 + float(secs)


def _groq_error(resp: httpx.Response) -> ProviderError:
    try:
        message = resp.json()["error"]["message"]
    except (ValueError, KeyError, TypeError):
        message = resp.text[:200]
    try:
        wait = float(resp.headers["retry-after"])
    except (KeyError, ValueError):
        wait = None
    return ProviderError(resp.status_code, message, wait)


_default: AIClient | None = None
_default_lock = threading.Lock()


def default_client() -> AIClient:
    """The app's one client, shared by every request so the breaker and caches are too. It
    reads users' keys and records calls through the services (imported late: they import
    this module)."""
    global _default
    with _default_lock:
        if _default is None:
            from app.services import ai_calls, ai_keys

            _default = AIClient(key_store=ai_keys.active_keys, recorder=ai_calls.record)
    return _default


def embed_documents(texts: Sequence[str]) -> list[list[float]]:
    return default_client().embed_documents(texts)


def embed_query(text: str) -> list[float]:
    return default_client().embed_query(text)


def generate(prompt: str, purpose: str = "draft") -> GenerationResult:
    return default_client().generate(prompt, purpose)
