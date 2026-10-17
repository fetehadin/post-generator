"""Settings: the only place environment variables are read (NFR-9)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Looked up from backend/ (local runs) and the repo root.
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    app_env: str = "development"

    # The API connects as the limited role (RLS applies); Alembic as the table owner.
    database_url: str = "postgresql+psycopg://voxlace_app:voxlace_app@localhost:5432/voxlace"
    migrations_database_url: str = "postgresql+psycopg://voxlace:voxlace@localhost:5432/voxlace"

    gemini_api_key: str = ""
    embedding_model: str = "gemini-embedding-2"
    embedding_dimensions: int = 768
    # Ordered fallback chain, comma-separated "provider:model" (FR-31).
    generation_models: str = "google:gemini-flash-latest"
    fallback_api_key: str = ""

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
