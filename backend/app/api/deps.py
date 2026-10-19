"""Shared route dependencies. Tests override these to use fakes."""

from app.ai.client import AIClient, default_client


def get_ai() -> AIClient:
    return default_client()
