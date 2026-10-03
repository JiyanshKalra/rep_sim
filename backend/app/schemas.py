# Pydantic response models and serializer functions for the quote simulator API.
# Defines typed data transfer schemas and converts internal rule domain models.

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
    """Convert Catalog domain model to API CatalogResponse schema."""
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
    """Convert CalculationResult domain model to API CalculationResponse schema."""
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
