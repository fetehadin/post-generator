"""The FastAPI app. Run it with: uvicorn app.main:app --reload

Interactive docs at http://localhost:8000/docs. Every route lives under /api/v1.
"""

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.ai.local_embed import local_embedder
from app.api import (
    ai_keys,
    checkins,
    drafts,
    github,
    guest,
    health,
    imports,
    me,
    platforms,
    posts,
    profile,
    telegram,
    threads,
    uploads,
)
from app.core import errors
from app.core.config import get_settings
from app.services.background import start_github_loop, start_retry_loop

logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Start the embedding retry loop with the server, stop it on shutdown (NFR-14)."""
    cfg = get_settings()
    interval = cfg.embedding_retry_seconds
    stop = start_retry_loop(interval) if interval > 0 else None
    github_stop = start_github_loop() if cfg.github_enabled and cfg.app_env != "test" else None
    if cfg.local_embedding_preload and cfg.app_env != "test":
        # Load the local model once, in the background: requests can start at once, and the
        # first one that needs it waits only until it's ready (FR-41).
        threading.Thread(target=_warm_local_model, name="local-embed-warm", daemon=True).start()
    yield
    if stop is not None:
        stop.set()
    if github_stop is not None:
        github_stop.set()


def _warm_local_model() -> None:
    try:
        local_embedder().warm()
    except Exception:  # missing model files must not stop the API; drafts work without it
        logger.exception("couldn't load the local embedding model")


def create_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    app = FastAPI(
        title="Voxlace API",
        version="0.1.0",
        description="Drafts posts in your own voice. Send the Supabase login token as Bearer.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[get_settings().frontend_url],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    errors.install(app)
    for module in (
        health,
        me,
        ai_keys,
        profile,
        uploads,
        platforms,
        imports,
        posts,
        checkins,
        threads,
        drafts,
        guest,
        github,
        telegram,
    ):
        app.include_router(module.router, prefix=API_PREFIX)
    app.include_router(github.webhooks, prefix=API_PREFIX)
    app.include_router(telegram.webhooks, prefix=API_PREFIX)
    return app


app = create_app()
