"""The FastAPI app. Run it with: uvicorn app.main:app --reload

Interactive docs at http://localhost:8000/docs. Every route lives under /api/v1.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import checkins, drafts, health, imports, me, platforms, posts, profile, threads
from app.core import errors
from app.core.config import get_settings
from app.services.background import start_retry_loop

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Start the embedding retry loop with the server, stop it on shutdown (NFR-14)."""
    interval = get_settings().embedding_retry_seconds
    stop = start_retry_loop(interval) if interval > 0 else None
    yield
    if stop is not None:
        stop.set()


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
    for module in (health, me, profile, platforms, imports, posts, checkins, threads, drafts):
        app.include_router(module.router, prefix=API_PREFIX)
    return app


app = create_app()
