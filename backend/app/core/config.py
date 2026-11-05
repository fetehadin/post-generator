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
    groq_api_key: str = ""
    # Longest one AI call may take before it counts as a network drop and is retried.
    ai_timeout_seconds: int = 60
    # The most one draft may spend across retries and fallback models before the user is told
    # the AI is busy (NFR-3, NFR-4). Each call's timeout is cut to what is left.
    generation_deadline_seconds: int = 40
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
        chain = []
        for item in self.generation_models.split(","):
            item = item.strip()
            if not item:
                continue
            provider, _, model = item.partition(":")
            chain.append(
                (provider.strip(), model.strip()) if model else ("google", provider.strip())
            )
        return chain


@lru_cache
def get_settings() -> Settings:
    return Settings()
