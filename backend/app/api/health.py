from fastapi import APIRouter
from sqlalchemy import text

from app.core.db import get_engine
from app.schemas import HealthOut

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        db = "ok"
    except Exception:  # health must answer even when the database is down
        db = "error"
    return HealthOut(api="ok", db=db)
