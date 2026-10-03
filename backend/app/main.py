# Main FastAPI application definition and HTTP routing.
# Configures CORS middleware, catalog loading, quote calculation, and error envelope.

from typing import Annotated, Any

from fastapi import Body, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import rules
from app.config import get_catalog_path, get_cors_origins
from app.errors import register_error_handlers
from app.schemas import (
    CalculationResponse,
    CatalogResponse,
    ErrorResponse,
    calculation_to_response,
    catalog_to_response,
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
