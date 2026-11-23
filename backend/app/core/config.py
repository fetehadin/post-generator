"""Settings: the only place environment variables are read (NFR-9)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Looked up from backend/ (local runs) and the repo root.
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    app_env: str = "development"
    frontend_url: str = "http://localhost:5173"  # the React app, allowed by CORS

    # The API connects as the limited role (RLS applies); Alembic as the table owner.
    database_url: str = "postgresql+psycopg://voxlace_app:voxlace_app@localhost:5432/voxlace"
    migrations_database_url: str = "postgresql+psycopg://voxlace:voxlace@localhost:5432/voxlace"

    # Login (FR-27): Supabase issues the token, we only verify it. Cloud projects sign with
    # keys published at {supabase_url}/auth/v1/.well-known/jwks.json (ES256/RS256); local
    # Supabase signs with a shared secret (HS256). Each token's algorithm picks its key.
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    # FR-28: off by default since 5 Nov 2026 (anyone can make an account). When on, only an
    # invite code or an email in allowed_emails (comma-separated, the team) gets in.
    invite_only: bool = False
    allowed_emails: str = ""
    # FR-47: guests draft without logging in; nothing of theirs is stored. Per visitor (hashed
    # IP) and in total per UTC day, counting every AI writing call. The key signs the guest's
    # drafts so they can be saved, with their exact prompt, once the guest logs in.
    guest_daily_drafts: int = 12
    guest_daily_total: int = 300
    guest_signing_key: str = ""
    # The edge Worker sends the visitor's IP with this shared secret (deploy/edge). Only then is
    # the IP believed; without it every caller counts as the one address that connected.
    edge_secret: str = ""

    gemini_api_key: str = ""
    embedding_model: str = "gemini-embedding-2"
    embedding_dimensions: int = 768
    # Ordered fallback chain, comma-separated "provider:model" (FR-31). Providers: google, groq.
    generation_models: str = "google:gemini-flash-latest"
    # Optional cheaper chain for small jobs (voice card, summary card); empty = the main chain.
    generation_models_light: str = ""
    # Gemini's thinking for writing calls: "" leaves the model's default; minimal, low, medium
    # or high. Less thinking is faster and uses less quota; check drafts with the ten topics.
    gemini_thinking_level: str = ""
    groq_api_key: str = ""
    # FR-48: the model a user's own key writes with when they don't pick one, per provider.
    # Their key's provider must be one of: google, groq, openai, anthropic, openrouter, mistral.
    byok_default_models: str = (
        "google:gemini-flash-latest,groq:openai/gpt-oss-120b,openai:gpt-4.1-mini,"
        "anthropic:claude-opus-5-5,openrouter:openrouter/auto,mistral:mistral-small-latest"
    )
    # Claude models whose refusals are re-run server-side on another Claude model.
    anthropic_fallback_models: str = (
        "claude-fable-5-2,claude-fable-5-1,claude-opus-5-5,claude-opus-5,claude-sonnet-5-5"
    )
    # FR-48: users may add their own AI keys. They are encrypted with these Fernet keys
    # (comma-separated; the first encrypts, all decrypt, for rotation). Empty turns the
    # feature off. Make one with `python -m app.dev new-secret-key`.
    ai_key_encryption_keys: str = ""
    # Longest one AI call may take before it counts as a network drop and is retried.
    ai_timeout_seconds: int = 60
    # The most one draft may spend across retries and fallback models before the user is told
    # the AI is busy (NFR-3, NFR-4). Each call's timeout is cut to what is left.
    generation_deadline_seconds: int = 40
    # FR-41, FR-49: the local model for the inspiration pool and the originality check
    # (fastembed, CPU, free). A different vector space from users' posts (rule 3); changing it
    # means re-running `python -m app.dev backfill-inspiration`. 384 dims is fixed by the
    # database column. Alternative: BAAI/bge-small-en-v1.5 (English only, no prefixes).
    local_embedding_model: str = "intfloat/multilingual-e5-small"
    local_embedding_dimensions: int = 384
    local_embedding_cache_dir: str = ""  # Docker: /opt/models, filled at build time
    local_embedding_threads: int = 2  # the server is shared with other apps
    local_embedding_preload: bool = True  # load at startup, not on the first draft
    # How many inspiration posts a draft gets as structure examples.
    structure_examples: int = 3
    # FR-49: a draft this similar (cosine) to one of its examples is rewritten once, then flagged.
    originality_threshold: float = 0.9

    # FR-14: GitHub → daily dev drafts (optional; empty = off). An OAuth App with no scopes
    # (public activity) and a GitHub App for private repos: Contents, Pull requests and
    # Metadata read-only, webhooks for push, pull_request and release. See docs/API.md.
    github_client_id: str = ""
    github_client_secret: str = ""
    github_app_id: str = ""
    github_app_slug: str = ""  # github.com/apps/<slug>
    github_app_private_key: str = ""  # PEM; "\n" in one line is fine
    github_webhook_secret: str = ""
    # Telegram bot (FR-36): posts approved drafts to the user's channel when they tap Post.
    telegram_bot_token: str = ""  # from @BotFather; never logged
    telegram_bot_username: str = ""  # without the @, e.g. VoxlaceBot
    telegram_webhook_secret: str = ""  # sent back by Telegram in X-Telegram-Bot-Api-Secret-Token
    telegram_link_minutes: int = 15  # how long a "link your account" token lasts
    github_suggest_hour: int = 19  # suggestions appear at this hour, the user's own clock
    # Stage 1 (no LLM): weights per signal and the score a day/week needs to reach the LLM.
    github_score_weights: str = (
        "merged_pr:5,described_pr:2,opened_pr:1,release:5,new_repo:4,feature:2,theme:2,"
        "milestone:3,streak:3,commit:1"
    )
    github_threshold_daily: int = 6
    github_threshold_weekly: int = 8
    github_threshold_highlights: int = 10

    # FR-30: per user per UTC day. Drafts count every AI writing call (new drafts and chat
    # revisions); posts count what an import adds, since each new post is embedded once.
    daily_draft_limit: int = 40
    daily_post_limit: int = 3000
    # NFR-14: how often the API retries waiting embeddings in the background; 0 turns it off.
    embedding_retry_seconds: int = 300

    @property
    def login_configured(self) -> bool:
        return bool(self.supabase_url or self.supabase_jwt_secret)

    @property
    def dev_user_without_login(self) -> bool:
        """Local development with no login set up: every request is the dev user.
        Never in production, and never once login is configured."""
        return self.app_env == "development" and not self.login_configured

    @property
    def allowed_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.allowed_emails.split(",") if e.strip()}

    @property
    def generation_chain(self) -> list[tuple[str, str]]:
        return _chain(self.generation_models)

    @property
    def github_enabled(self) -> bool:
        return bool(self.github_client_id and self.github_client_secret)

    @property
    def telegram_enabled(self) -> bool:
        return bool(
            self.telegram_bot_token and self.telegram_bot_username and self.telegram_webhook_secret
        )

    @property
    def github_app_enabled(self) -> bool:
        return bool(self.github_app_id and self.github_app_private_key and self.github_app_slug)

    @property
    def github_weights(self) -> dict[str, int]:
        out = {}
        for part in self.github_score_weights.split(","):
            name, _, value = part.partition(":")
            if name.strip() and value.strip().lstrip("-").isdigit():
                out[name.strip()] = int(value)
        return out

    @property
    def anthropic_fallback_model_set(self) -> set[str]:
        return {m.strip() for m in self.anthropic_fallback_models.split(",") if m.strip()}

    def byok_default_model(self, provider: str) -> str:
        for provider_, model in _chain(self.byok_default_models):
            if provider_ == provider:
                return model
        return ""

    def chain_for(self, purpose: str) -> list[tuple[str, str]]:
        """Small jobs use the light chain when one is set; writing always uses the main one."""
        if purpose in LIGHT_PURPOSES and self.generation_models_light.strip():
            return _chain(self.generation_models_light)
        return self.generation_chain


# AI jobs that don't write a post: they can run on a cheaper model.
LIGHT_PURPOSES = frozenset({"voice_card", "summary", "tag_inspiration", "github_judge"})


def _chain(spec: str) -> list[tuple[str, str]]:
    chain = []
    for item in spec.split(","):
        item = item.strip()
        if not item:
            continue
        provider, _, model = item.partition(":")
        chain.append((provider.strip(), model.strip()) if model else ("google", provider.strip()))
    return chain


@lru_cache
def get_settings() -> Settings:
    return Settings()
