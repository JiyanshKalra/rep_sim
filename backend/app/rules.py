# Business rules, validation, pricing calculation, and tier resolution for deal desk quotes.
# Pure Python implementation relying strictly on the standard library.

import json
import math
import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

# R4: Strict >, exactly 15% discount does not need deal desk approval
DISCOUNT_ABOVE_PCT = Decimal("15")  # noqa: FURB157
# R4: Strict >, exactly $25,000 post-discount total does not need deal desk approval
TOTAL_ABOVE = Decimal("25000")  # noqa: FURB157
# R4: Strict >, exactly 10% discount with annual commitment does not need deal desk approval
COMMITMENT_DISCOUNT_ABOVE_PCT = Decimal("10")  # noqa: FURB157
# R5: System sanity limit for seat count minimum
MIN_SEATS = 1
# R5: System sanity limit for seat count maximum
MAX_SEATS = 1_000_000
# R5: System sanity limit for line item quantity minimum
MIN_QUANTITY = 1
# R5: System sanity limit for line item quantity maximum
MAX_QUANTITY = 10_000
# R6: Customer name character limit
MAX_CUSTOMER_NAME_LENGTH = 120
# R5: Discount percentage maximum decimal precision
MAX_DISCOUNT_DECIMALS = 2

_INTEGER_PATTERN = re.compile(r"^-?[0-9]+$")
_DISCOUNT_PATTERN = re.compile(r"^-?[0-9]+(\.[0-9]+)?$")


@dataclass(frozen=True)
class Product:
    sku: str
    name: str
    unit_price: Decimal


@dataclass(frozen=True)
class Tier:
    code: str
    min_seats: int
    max_seats: int | None
    max_discount_pct: Decimal


@dataclass(frozen=True)
class Catalog:
    currency: str
    products: dict[str, Product]
    tiers: list[Tier]


@dataclass(frozen=True)
class RuleError:
    code: str
    field: str | None
    message: str


@dataclass(frozen=True)
class DraftLine:
    sku: str
    quantity: int


@dataclass(frozen=True)
class ValidDraft:
    customer_name: str
    seats: int
    lines: list[DraftLine]
    discount_pct: Decimal
    annual_commitment: bool


@dataclass(frozen=True)
class PricedLine:
    sku: str
    name: str
    unit_price: Decimal
    quantity: int
    line_total: Decimal


@dataclass(frozen=True)
class CalculationResult:
    tier: Tier
    currency: str
    lines: list[PricedLine]
    subtotal: Decimal
    discount_pct: Decimal
    discount_amount: Decimal
    total: Decimal
    approval_required: bool
    approval_reasons: list[str]


class CatalogError(ValueError):
    """Raised when the catalog file or configuration is inconsistent."""


class QuoteValidationError(Exception):
    """Raised when draft quote validation fails with one or more errors."""

    def __init__(self, errors: list[RuleError]) -> None:
        super().__init__(f"Validation failed with {len(errors)} error(s)")
        self.errors = errors


def _parse_integer(raw: Any) -> int | None:
    # R5: Accept int (excluding bool) or string matching integer regex
    if isinstance(raw, bool) or raw is None:
        return None
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str):
        trimmed = raw.strip()
        if not _INTEGER_PATTERN.match(trimmed):
            return None
        try:
            return int(trimmed)
        except ValueError:
            # Python rejects strings with too many digits (>4300)
            return None
    return None


def _parse_discount(raw: Any) -> tuple[Decimal | None, str | None]:
    # R5: Accept int (not bool), finite float, or decimal string
    if isinstance(raw, bool) or raw is None:
        return None, "discount_not_number"
    if isinstance(raw, int):
        dec = Decimal(raw)
    elif isinstance(raw, float):
        if not math.isfinite(raw):
            return None, "discount_not_number"
        dec = Decimal(str(raw))
    elif isinstance(raw, str):
        trimmed = raw.strip()
        if not _DISCOUNT_PATTERN.match(trimmed):
            return None, "discount_not_number"
        dec = Decimal(trimmed)
    else:
        return None, "discount_not_number"

    # R5: Negative zero (-0 or -0.0) counts as 0, not negative
    if dec == Decimal(0):
        dec = Decimal(0)
    if dec < Decimal(0):
        return None, "discount_negative"
    # R5: Decimals checked after normalization; 10.500 ok, 10.001 rejected
    if dec.normalize().as_tuple().exponent < -MAX_DISCOUNT_DECIMALS:
        return None, "discount_too_many_decimals"
    return dec, None


def _validate_tiers(sorted_rules: list[dict]) -> list[Tier]:
    # R1: First tier must start at 1 seat
    if sorted_rules[0]["min_seats"] != 1:
        raise CatalogError(
            f"First discount tier must start at min_seats 1, got {sorted_rules[0]['min_seats']}"
        )

    tiers: list[Tier] = []
    num_tiers = len(sorted_rules)
    for i, r in enumerate(sorted_rules):
        is_highest = i == num_tiers - 1
        code = r["code"]
        min_seats = int(r["min_seats"])

        if is_highest:
            # R1: Highest tier is open-ended; max_seats is None, catalog sentinel 99999 is ignored
            max_seats = None
        else:
            # C3: Every non-highest tier must have a whole-number max_seats
            raw_max = r.get("max_seats")
            if not isinstance(raw_max, int) or isinstance(raw_max, bool):
                raise CatalogError(f"Tier '{code}' needs a whole-number max_seats.")
            if raw_max < min_seats:
                raise CatalogError(
                    f"Tier '{code}' has max_seats {raw_max} below its min_seats {min_seats}."
                )
            max_seats = raw_max

        if i > 0:
            prev_max = tiers[i - 1].max_seats
            expected_min = prev_max + 1  # type: ignore[operator]
            if min_seats != expected_min:
                raise CatalogError(
                    f"Tier gap or overlap: tier '{code}' starts at {min_seats}, expected {expected_min}"
                )
        tiers.append(
            Tier(
                code=code,
                min_seats=min_seats,
                max_seats=max_seats,
                max_discount_pct=Decimal(str(r["max_discount_pct"])),
            )
        )
    return tiers


def build_catalog(data: dict) -> Catalog:
    """Validate catalog data structure and build the Catalog instance."""
    products: dict[str, Product] = {}
    for p in data.get("products", []):
        sku = p["sku"]
        # R1: SKU uniqueness check
        if sku in products:
            raise CatalogError(f"Duplicate product SKU in catalog: '{sku}'")
        unit_price = Decimal(str(p["unit_price"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        products[sku] = Product(sku=sku, name=p["name"], unit_price=unit_price)

    discount_rules = data.get("discount_rules", [])
    # R1: Must define at least one tier
    if not discount_rules:
        raise CatalogError("Catalog must define at least one discount tier.")

    sorted_rules = sorted(discount_rules, key=lambda t: t["min_seats"])
    tiers = _validate_tiers(sorted_rules)
    return Catalog(currency=data.get("currency", "USD"), products=products, tiers=tiers)


def load_catalog(path: Path) -> Catalog:
    """Load and parse catalog JSON file using Decimal for floating point numbers."""
    with open(path, "r", encoding="utf-8") as f:
        # Load floats as Decimal to maintain precision from source
        data = json.load(f, parse_float=Decimal)
    return build_catalog(data)


def find_tier(catalog: Catalog, seats: int) -> Tier:
    """Return the discount tier whose range contains the given seat count."""
    # R1: Search sorted tiers; top tier has max_seats=None (open-ended)
    for tier in catalog.tiers:
        if tier.max_seats is None:
            if seats >= tier.min_seats:
                return tier
        else:
            if tier.min_seats <= seats <= tier.max_seats:
                return tier
    raise ValueError(f"No tier found for seats count {seats}.")


def _validate_customer_name(raw: dict, require: bool, errors: list[RuleError]) -> str:
    # R6: customer_name checked only when require_customer_name is True
    c_raw = raw.get("customer_name")
    if not require:
        return c_raw.strip() if isinstance(c_raw, str) else ""
    if not isinstance(c_raw, str) or not c_raw.strip():
        errors.append(
            RuleError(
                code="customer_name_required",
                field="customer_name",
                message="Enter the customer name.",
            )
        )
        return ""
    trimmed = c_raw.strip()
    if len(trimmed) > MAX_CUSTOMER_NAME_LENGTH:
        errors.append(
            RuleError(
                code="customer_name_too_long",
                field="customer_name",
                message="Customer name must be 120 characters or fewer.",
            )
        )
        return ""
    return trimmed


def _validate_seats(raw: dict, errors: list[RuleError]) -> int | None:
    # R5: Seats must be an integer within [1, 1_000_000]
    seats_raw = raw.get("seats")
    parsed = _parse_integer(seats_raw)
    if parsed is None:
        errors.append(
            RuleError(
                code="seats_not_integer", field="seats", message="Seats must be a whole number."
            )
        )
        return None
    if parsed < MIN_SEATS or parsed > MAX_SEATS:
        errors.append(
            RuleError(
                code="seats_out_of_range",
                field="seats",
                message="Seats must be between 1 and 1,000,000.",
            )
        )
        return None
    return parsed


def _validate_lines(catalog: Catalog, raw: dict, errors: list[RuleError]) -> list[DraftLine]:
    # R5: Must include at least one valid line item
    lines_raw = raw.get("lines")
    if not isinstance(lines_raw, list) or len(lines_raw) == 0:
        errors.append(
            RuleError(code="lines_empty", field="lines", message="Add at least one product.")
        )
        return []

    parsed_lines: list[DraftLine] = []
    seen_skus: set[str] = set()
    for i, line in enumerate(lines_raw):
        prefix = f"lines[{i}]"
        if not isinstance(line, dict):
            # C2: Non-object line has no SKU; skip quantity check entirely
            errors.append(
                RuleError(
                    code="sku_unknown",
                    field=f"{prefix}.sku",
                    message="This product is not in the catalog.",
                )
            )
            continue

        sku_val = line.get("sku")
        sku_valid = False
        if not isinstance(sku_val, str) or sku_val not in catalog.products:
            msg = (
                f"Product '{sku_val}' is not in the catalog."
                if isinstance(sku_val, str)
                else "This product is not in the catalog."
            )
            errors.append(RuleError(code="sku_unknown", field=f"{prefix}.sku", message=msg))
        elif sku_val in seen_skus:
            errors.append(
                RuleError(
                    code="sku_duplicate",
                    field=f"{prefix}.sku",
                    message=f"Product '{sku_val}' is already on this quote. Increase its quantity instead.",
                )
            )
        else:
            seen_skus.add(sku_val)
            sku_valid = True

        qty_val = line.get("quantity")
        qty_parsed = _parse_integer(qty_val)
        qty_valid = False
        if qty_parsed is None:
            errors.append(
                RuleError(
                    code="quantity_not_integer",
                    field=f"{prefix}.quantity",
                    message="Quantity must be a whole number.",
                )
            )
        elif qty_parsed < MIN_QUANTITY or qty_parsed > MAX_QUANTITY:
            errors.append(
                RuleError(
                    code="quantity_out_of_range",
                    field=f"{prefix}.quantity",
                    message="Quantity must be between 1 and 10,000.",
                )
            )
        else:
            qty_valid = True

        if sku_valid and qty_valid:
            parsed_lines.append(DraftLine(sku=sku_val, quantity=qty_parsed))  # type: ignore[arg-type]
    return parsed_lines


def _validate_discount(
    catalog: Catalog, raw: dict, seats: int | None, errors: list[RuleError]
) -> Decimal | None:
    # R5 & R2: Validate discount format and tier cap when seats are valid
    disc_raw = raw.get("discount_pct")
    disc_val, disc_err = _parse_discount(disc_raw)
    if disc_err is not None:
        messages = {
            "discount_not_number": "Discount must be a number (use 0 for no discount).",
            "discount_negative": "Discount cannot be negative.",
            "discount_too_many_decimals": "Discount can have at most 2 decimal places.",
        }
        errors.append(RuleError(code=disc_err, field="discount_pct", message=messages[disc_err]))
        return None

    # R2: Cap check performed only when seat count is valid
    if seats is not None and disc_val is not None:
        tier = find_tier(catalog, seats)
        if disc_val > tier.max_discount_pct:
            range_str = (
                f"{tier.min_seats}+ seats"
                if tier.max_seats is None
                else f"{tier.min_seats}-{tier.max_seats} seats"
            )
            pct_str = format_percent(disc_val)
            max_str = format_percent(tier.max_discount_pct)
            msg = f"Discount {pct_str}% exceeds the {max_str}% maximum for the {tier.code} tier ({range_str})."
            errors.append(
                RuleError(code="discount_exceeds_tier_max", field="discount_pct", message=msg)
            )
            return None
    return disc_val


def _validate_commitment(raw: dict, errors: list[RuleError]) -> bool:
    # R5: annual_commitment defaults to False if missing, requires strict bool
    if "annual_commitment" not in raw:
        return False
    val = raw["annual_commitment"]
    if isinstance(val, bool):
        return val
    errors.append(
        RuleError(
            code="annual_commitment_invalid",
            field="annual_commitment",
            message="Annual commitment must be true or false.",
        )
    )
    return False


def validate_draft(catalog: Catalog, raw: dict, require_customer_name: bool = False) -> ValidDraft:
    """Validate draft quote dictionary and return a ValidDraft or raise QuoteValidationError."""
    raw_dict = raw if isinstance(raw, dict) else {}
    errors: list[RuleError] = []

    name = _validate_customer_name(raw_dict, require_customer_name, errors)
    seats = _validate_seats(raw_dict, errors)
    lines = _validate_lines(catalog, raw_dict, errors)
    discount = _validate_discount(catalog, raw_dict, seats, errors)
    commitment = _validate_commitment(raw_dict, errors)

    if errors:
        raise QuoteValidationError(errors)

    return ValidDraft(
        customer_name=name,
        seats=seats,  # type: ignore[arg-type]
        lines=lines,
        discount_pct=discount if discount is not None else Decimal(0),
        annual_commitment=commitment,
    )


def calculate(catalog: Catalog, draft: ValidDraft) -> CalculationResult:
    """Calculate line totals, rounded discount amount, and approval status."""
    tier = find_tier(catalog, draft.seats)

    # R3: Line item pricing without rounding intermediate multiplications
    priced_lines: list[PricedLine] = []
    subtotal = Decimal("0.00")
    for line in draft.lines:
        prod = catalog.products[line.sku]
        line_total = Decimal(line.quantity) * prod.unit_price
        priced_lines.append(
            PricedLine(
                sku=prod.sku,
                name=prod.name,
                unit_price=prod.unit_price,
                quantity=line.quantity,
                line_total=line_total,
            )
        )
        subtotal += line_total

    # R3: Never use float arithmetic or Python round(); quantize once using ROUND_HALF_UP
    discount_amount = (subtotal * draft.discount_pct / Decimal(100)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    # R3: Total is subtotal minus discount amount, ensuring numbers always balance
    total = subtotal - discount_amount

    # R4: Strict > comparisons evaluated independently in fixed rule order
    reasons: list[str] = []
    if draft.discount_pct > DISCOUNT_ABOVE_PCT:
        reasons.append("discount_above_15_percent")
    if total > TOTAL_ABOVE:
        reasons.append("total_above_25000")
    if draft.annual_commitment and draft.discount_pct > COMMITMENT_DISCOUNT_ABOVE_PCT:
        reasons.append("annual_commitment_discount_above_10_percent")

    return CalculationResult(
        tier=tier,
        currency=catalog.currency,
        lines=priced_lines,
        subtotal=subtotal,
        discount_pct=draft.discount_pct,
        discount_amount=discount_amount,
        total=total,
        approval_required=len(reasons) > 0,
        approval_reasons=reasons,
    )


def format_money(value: Decimal) -> str:
    """Format a monetary Decimal to two decimal places using ROUND_HALF_UP."""
    # R3: Quantize money to 2 decimal places with ROUND_HALF_UP
    rounded = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{rounded:.2f}"


def format_percent(value: Decimal) -> str:
    """Format a percentage Decimal to a normalized string without exponent notation."""
    # R5: Any zero (including negative zero) formats as "0"
    if value == Decimal(0):
        return "0"
    return f"{value.normalize():f}"
