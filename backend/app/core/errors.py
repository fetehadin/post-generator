"""One error shape for every response (docs/API.md, OPEN_QUESTIONS Q8):

    {"error": {"code": "invalid_file", "message": "A sentence the user can act on."}}

FastAPI's own 404/405 and 422 responses are converted to the same shape.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def error_body(code: str, message: str, **extra) -> dict:
    return {"error": {"code": code, "message": message, **extra}}


def install(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(error_body(exc.code, exc.message), status_code=exc.status)

    @app.exception_handler(StarletteHTTPException)
    def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        message = "Not found." if exc.status_code == 404 else str(exc.detail)
        return JSONResponse(error_body(code, message), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "problem": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            error_body("validation_error", "Some fields are missing or invalid.", fields=fields),
            status_code=422,
        )

    @app.exception_handler(Exception)
    def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error")
        return JSONResponse(
            error_body("internal_error", "Something went wrong on our side. Try again."),
            status_code=500,
        )
