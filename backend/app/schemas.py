# Pydantic response models and serializer functions for the quote simulator API.
# Defines typed data transfer schemas and converts internal rule domain models.

from typing import Any, Literal

from pydantic import BaseModel

from app import rules

# Money and percentages travel as strings so JSON never turns them into floats
Money = str
Percent = str


class ErrorItem(BaseModel):
    code: str
    field: str | None
    message: str


class ErrorResponse(BaseModel):
    errors: list[ErrorItem]


class ProductOut(BaseModel):
    sku: str
    name: str
    unit_price: Money


class TierOut(BaseModel):
    code: str
    min_seats: int
    max_seats: int | None
    max_discount_pct: Percent


class ApprovalRulesOut(BaseModel):
    discount_above_pct: Percent
    total_above: Money
    annual_commitment_discount_above_pct: Percent


class CatalogResponse(BaseModel):
    currency: str
    products: list[ProductOut]
    tiers: list[TierOut]
    approval_rules: ApprovalRulesOut


class LineOut(BaseModel):
    sku: str
    name: str
    unit_price: Money
    quantity: int
    line_total: Money


class CalculationResponse(BaseModel):
    tier: str
    max_discount_pct: Percent
    currency: str
    lines: list[LineOut]
    subtotal: Money
    discount_pct: Percent
    discount_amount: Money
    total: Money
    approval_required: bool
    approval_reasons: list[str]
    explanation: list[str]


class SavedLineOut(BaseModel):
    sku: str
    name: str
    unit_price: Money
    quantity: int
    line_total: Money
    catalog_status: Literal["ok", "removed", "price_changed"]


class AuditEntry(BaseModel):
    action: str
    timestamp: str
    details: str


class SavedQuoteResponse(BaseModel):
    id: str
    customer_name: str
    seats: int
    annual_commitment: bool
    status: Literal["draft", "submitted", "approved", "rejected"]
    rejection_reason: str | None = None
    customer_requested_discount_pct: Percent | None = None
    created_at: str
    updated_at: str
    allowed_next_statuses: list[str]
    lines: list[SavedLineOut]
    result: CalculationResponse
    history: list[AuditEntry] = []


class QuoteSummaryOut(BaseModel):
    id: str
    customer_name: str
    seats: int
    tier: str
    total: Money
    approval_required: bool
    status: Literal["draft", "submitted", "approved", "rejected"]
    created_at: str


class StatusUpdateRequest(BaseModel):
    status: str
    reason: str | None = None


def _format_approval_rules() -> ApprovalRulesOut:
    # R4: Approval thresholds sourced from rules constants as single source of truth
    return ApprovalRulesOut(
        discount_above_pct=rules.format_percent(rules.DISCOUNT_ABOVE_PCT),
        total_above=rules.format_money(rules.TOTAL_ABOVE),
        annual_commitment_discount_above_pct=rules.format_percent(
            rules.COMMITMENT_DISCOUNT_ABOVE_PCT
        ),
    )


def catalog_to_response(catalog: rules.Catalog) -> CatalogResponse:
    products = [
        ProductOut(sku=p.sku, name=p.name, unit_price=rules.format_money(p.unit_price))
        for p in catalog.products.values()
    ]
    tiers: list[TierOut] = []
    for t in catalog.tiers:
        tiers.append(
            TierOut(
                code=t.code,
                min_seats=t.min_seats,
                max_seats=t.max_seats,
                max_discount_pct=rules.format_percent(t.max_discount_pct),
            )
        )
    return CatalogResponse(
        currency=catalog.currency,
        products=products,
        tiers=tiers,
        approval_rules=_format_approval_rules(),
    )


def calculation_to_response(
    result: rules.CalculationResult, explanation: list[str]
) -> CalculationResponse:
    lines = [
        LineOut(
            sku=line.sku,
            name=line.name,
            unit_price=rules.format_money(line.unit_price),
            quantity=line.quantity,
            line_total=rules.format_money(line.line_total),
        )
        for line in result.lines
    ]
    return CalculationResponse(
        tier=result.tier.code,
        max_discount_pct=rules.format_percent(result.tier.max_discount_pct),
        currency=result.currency,
        lines=lines,
        subtotal=rules.format_money(result.subtotal),
        discount_pct=rules.format_percent(result.discount_pct),
        discount_amount=rules.format_money(result.discount_amount),
        total=rules.format_money(result.total),
        approval_required=result.approval_required,
        approval_reasons=list(result.approval_reasons),
        explanation=explanation,
    )


def saved_quote_to_response(catalog: rules.Catalog, quote: dict[str, Any]) -> SavedQuoteResponse:
    # Reconstruct CalculationResponse and evaluate live catalog freshness for each line
    result = CalculationResponse.model_validate(quote["result"])
    lines = [
        SavedLineOut(
            **line.model_dump(),
            catalog_status=rules.line_catalog_status(catalog, line.sku, line.unit_price),
        )
        for line in result.lines
    ]
    raw_history = quote.get("history") or []
    history = [AuditEntry.model_validate(entry) for entry in raw_history]
    return SavedQuoteResponse(
        id=quote["id"],
        customer_name=quote["customer_name"],
        seats=quote["seats"],
        annual_commitment=quote["annual_commitment"],
        status=quote["status"],
        rejection_reason=quote.get("rejection_reason"),
        customer_requested_discount_pct=quote.get("customer_requested_discount_pct"),
        created_at=quote["created_at"],
        updated_at=quote["updated_at"],
        allowed_next_statuses=rules.allowed_next_statuses(quote["status"]),
        lines=lines,
        result=result,
        history=history,
    )


def quote_to_summary(quote: dict[str, Any]) -> QuoteSummaryOut:
    # Direct indexing ensures missing data raises immediately rather than defaulting
    return QuoteSummaryOut(
        id=quote["id"],
        customer_name=quote["customer_name"],
        seats=quote["seats"],
        tier=quote["result"]["tier"],
        total=quote["result"]["total"],
        approval_required=quote["result"]["approval_required"],
        status=quote["status"],
        created_at=quote["created_at"],
    )
