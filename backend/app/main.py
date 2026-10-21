"""The FastAPI app. Run it with: uvicorn app.main:app --reload

Interactive docs at http://localhost:8000/docs. Every route lives under /api/v1.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import drafts, health, imports, me, posts, profile
from app.core import errors
from app.core.config import get_settings

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    app = FastAPI(
        title="Voxlace API",
        version="0.1.0",
        description="Drafts posts in your own voice. Send the Supabase login token as Bearer.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[get_settings().frontend_url],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    errors.install(app)
    for module in (health, me, profile, imports, posts, drafts):
        app.include_router(module.router, prefix=API_PREFIX)
    return app


app = create_app()
