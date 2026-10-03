# Main FastAPI application definition and HTTP routing.
# Configures CORS middleware, catalog loading, quote calculation, and storage endpoints.

from typing import Annotated, Any

from fastapi import Body, Depends, FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app import rules, storage
from app.config import get_catalog_path, get_cors_origins
from app.errors import register_error_handlers
from app.schemas import (
    CalculationResponse,
    CatalogResponse,
    ErrorResponse,
    QuoteSummaryOut,
    SavedQuoteResponse,
    calculation_to_response,
    catalog_to_response,
    quote_to_summary,
    saved_quote_to_response,
)

app = FastAPI(title="Deal Desk Quote Simulator API")

# Explicit CORS configuration restricting origins to configured frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

# Register single error envelope exception handlers
register_error_handlers(app)


def get_catalog() -> rules.Catalog:
    """FastAPI dependency to load the catalog on each request from CATALOG_PATH."""
    # Path read dynamically on each request so tests can override CATALOG_PATH with monkeypatch
    return rules.load_catalog(get_catalog_path())


@app.get("/api/health")
def health_check() -> dict[str, str]:
    """Health check endpoint to verify the service is running."""
    return {"status": "ok"}


@app.get("/api/catalog", response_model=CatalogResponse)
def get_catalog_endpoint(
    catalog: Annotated[rules.Catalog, Depends(get_catalog)],
) -> CatalogResponse:
    """Return available products, seat discount tiers, and approval threshold rules."""
    # Route handlers contain no business logic: serialize loaded catalog directly
    return catalog_to_response(catalog)


@app.post(
    "/api/quotes/calculate",
    response_model=CalculationResponse,
    status_code=200,
    responses={422: {"model": ErrorResponse}},
)
def calculate_quote(
    body: Annotated[dict[str, Any], Body(...)],
    catalog: Annotated[rules.Catalog, Depends(get_catalog)],
) -> CalculationResponse:
    """Validate a draft quote and calculate totals, applied discount, and approval rules."""
    # Route handlers contain no business logic: validate draft, calculate, and serialize
    draft = rules.validate_draft(catalog, body, require_customer_name=False)
    result = rules.calculate(catalog, draft)
    return calculation_to_response(result)


@app.post(
    "/api/quotes",
    response_model=SavedQuoteResponse,
    status_code=201,
    responses={422: {"model": ErrorResponse}},
)
def create_quote(
    body: Annotated[dict[str, Any], Body(...)],
    catalog: Annotated[rules.Catalog, Depends(get_catalog)],
) -> SavedQuoteResponse:
    """Validate and save a quote snapshot, assigning initial draft status (R6)."""
    draft = rules.validate_draft(catalog, body, require_customer_name=True)
    result = rules.calculate(catalog, draft)
    saved = storage.save_quote(catalog, draft, result)
    return saved_quote_to_response(catalog, saved)


@app.get("/api/quotes", response_model=list[QuoteSummaryOut])
def list_quotes_endpoint() -> list[QuoteSummaryOut]:
    """Return all saved quotes sorted newest first."""
    quotes = storage.list_quotes()
    return [quote_to_summary(q) for q in quotes]


@app.get(
    "/api/quotes/{quote_id}",
    response_model=SavedQuoteResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_quote_endpoint(
    quote_id: str,
    catalog: Annotated[rules.Catalog, Depends(get_catalog)],
) -> SavedQuoteResponse:
    """Retrieve a saved quote snapshot with live catalog freshness checks (R6)."""
    quote = storage.get_quote(quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found.")
    return saved_quote_to_response(catalog, quote)


@app.patch(
    "/api/quotes/{quote_id}/status",
    response_model=SavedQuoteResponse,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def update_quote_status_endpoint(
    quote_id: str,
    body: Annotated[dict[str, Any], Body(...)],
    catalog: Annotated[rules.Catalog, Depends(get_catalog)],
) -> SavedQuoteResponse:
    """Update quote workflow status, rejecting invalid transitions (R7)."""
    if not isinstance(body, dict) or "status" not in body or not isinstance(body["status"], str):
        raise RequestValidationError(errors=[])
    quote = storage.get_quote(quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found.")
    updated = storage.update_quote_status(quote_id, body["status"])
    assert updated is not None
    return saved_quote_to_response(catalog, updated)
