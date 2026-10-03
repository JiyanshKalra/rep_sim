# Pydantic response models and serializer functions for the quote simulator API.
# Defines typed data transfer schemas and converts internal rule domain models.

from typing import Any

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


class SavedLineOut(BaseModel):
    sku: str
    name: str
    unit_price: Money
    quantity: int
    line_total: Money
    catalog_status: str


class SavedQuoteResponse(BaseModel):
    id: str
    customer_name: str
    seats: int
    annual_commitment: bool
    status: str
    created_at: str
    updated_at: str
    allowed_next_statuses: list[str]
    lines: list[SavedLineOut]
    result: CalculationResponse


class QuoteSummaryOut(BaseModel):
    id: str
    customer_name: str
    seats: int
    tier: str
    total: Money
    approval_required: bool
    status: str
    created_at: str


class StatusUpdateRequest(BaseModel):
    status: str


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


def calculation_to_response(result: rules.CalculationResult) -> CalculationResponse:
    # Preserve line order from calculation result and format money fields
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
    )


def saved_quote_to_response(catalog: rules.Catalog, quote: dict[str, Any]) -> SavedQuoteResponse:
    # R6: Compute line freshness dynamically against loaded catalog
    lines = [
        SavedLineOut(
            sku=line["sku"],
            name=line["name"],
            unit_price=line["unit_price"],
            quantity=line["quantity"],
            line_total=line["line_total"],
            catalog_status=rules.line_catalog_status(catalog, line["sku"], line["unit_price"]),
        )
        for line in quote.get("lines", [])
    ]

    calc_data = quote.get("result", {})
    calc_lines = [
        LineOut(
            sku=line["sku"],
            name=line["name"],
            unit_price=line["unit_price"],
            quantity=line["quantity"],
            line_total=line["line_total"],
        )
        for line in calc_data.get("lines", [])
    ]

    calc_response = CalculationResponse(
        tier=calc_data.get("tier", ""),
        max_discount_pct=calc_data.get("max_discount_pct", "0"),
        currency=calc_data.get("currency", catalog.currency),
        lines=calc_lines,
        subtotal=calc_data.get("subtotal", "0.00"),
        discount_pct=calc_data.get("discount_pct", "0"),
        discount_amount=calc_data.get("discount_amount", "0.00"),
        total=calc_data.get("total", "0.00"),
        approval_required=calc_data.get("approval_required", False),
        approval_reasons=calc_data.get("approval_reasons", []),
    )

    status = quote.get("status", rules.INITIAL_STATUS)
    return SavedQuoteResponse(
        id=quote["id"],
        customer_name=quote["customer_name"],
        seats=quote["seats"],
        annual_commitment=quote["annual_commitment"],
        status=status,
        created_at=quote["created_at"],
        updated_at=quote["updated_at"],
        allowed_next_statuses=rules.allowed_next_statuses(status),
        lines=lines,
        result=calc_response,
    )


def quote_to_summary(quote: dict[str, Any]) -> QuoteSummaryOut:
    calc = quote.get("result", {})
    return QuoteSummaryOut(
        id=quote["id"],
        customer_name=quote["customer_name"],
        seats=quote["seats"],
        tier=calc.get("tier", ""),
        total=calc.get("total", "0.00"),
        approval_required=calc.get("approval_required", False),
        status=quote.get("status", rules.INITIAL_STATUS),
        created_at=quote.get("created_at", ""),
    )
