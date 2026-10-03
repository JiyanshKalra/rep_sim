# Single error envelope and FastAPI exception handlers.
# Formats all non-2xx responses into standard {"errors": [{"code", "field", "message"}]} schema.

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import rules

logger = logging.getLogger(__name__)


def _make_error_item(code: str, field: str | None, message: str) -> dict[str, str | None]:
    return {"code": code, "field": field, "message": message}


async def quote_validation_handler(
    request: Request, exc: rules.QuoteValidationError
) -> JSONResponse:
    # R5: Return all validation errors in order with field paths for sales reps
    errors = [_make_error_item(err.code, err.field, err.message) for err in exc.errors]
    return JSONResponse(status_code=422, content={"errors": errors})


async def invalid_transition_handler(
    request: Request, exc: rules.InvalidTransitionError
) -> JSONResponse:
    # R7: Return 409 envelope with specific transition error message
    errors = [_make_error_item(code="invalid_transition", field="status", message=str(exc))]
    return JSONResponse(status_code=409, content={"errors": errors})


async def request_validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Intercept invalid JSON or non-object payloads with a clear sales-rep friendly error
    errors = [
        _make_error_item(
            code="malformed_request",
            field=None,
            message="The request could not be read. Send a JSON object with seats, lines, discount_pct and annual_commitment.",
        )
    ]
    return JSONResponse(status_code=422, content={"errors": errors})


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    # Map HTTP status codes to standard error codes while preserving status
    if exc.status_code == 404:
        code = "not_found"
        message = (
            str(exc.detail)
            if exc.detail and exc.detail != "Not Found"
            else "That address does not exist."
        )
    elif exc.status_code == 405:
        code = "method_not_allowed"
        message = "That method is not allowed here."
    else:
        code = "http_error"
        message = str(exc.detail) if exc.detail else "An HTTP error occurred."

    errors = [_make_error_item(code=code, field=None, message=message)]
    return JSONResponse(
        status_code=exc.status_code,
        content={"errors": errors},
        headers=exc.headers,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Log full traceback internally but never leak server internals to clients
    logger.exception("Unhandled server error processing request: %s", exc)
    errors = [
        _make_error_item(
            code="internal_error",
            field=None,
            message="Something went wrong on our side. Please try again.",
        )
    ]
    return JSONResponse(status_code=500, content={"errors": errors})


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(rules.QuoteValidationError, quote_validation_handler)
    app.add_exception_handler(rules.InvalidTransitionError, invalid_transition_handler)
    app.add_exception_handler(RequestValidationError, request_validation_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
