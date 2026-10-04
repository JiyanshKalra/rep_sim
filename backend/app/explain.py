# Pure Python pricing explanation generator (R8).
# Converts calculation drafts and results into deterministic human-readable lines.

from app.rules import (
    COMMITMENT_DISCOUNT_ABOVE_PCT,
    DISCOUNT_ABOVE_PCT,
    TOTAL_ABOVE,
    CalculationResult,
    ValidDraft,
    format_percent,
)

# R8: Approval reason phrases parameterized with rules threshold constants
_APPROVAL_REASON_PHRASES: dict[str, str] = {
    "discount_above_15_percent": f"discount is above {format_percent(DISCOUNT_ABOVE_PCT)}%",
    "total_above_25000": f"total is above ${TOTAL_ABOVE:,.0f}",
    "annual_commitment_discount_above_10_percent": (
        f"annual commitment is selected and discount is above {format_percent(COMMITMENT_DISCOUNT_ABOVE_PCT)}%"
    ),
}


def _format_tier_line(draft: ValidDraft, result: CalculationResult) -> str:
    # R8: Singular seat for exactly 1 seat, plural seats otherwise
    seat_word = "seat" if draft.seats == 1 else "seats"
    tier_name = result.tier.code.capitalize()
    max_pct = format_percent(result.tier.max_discount_pct)
    return f"{draft.seats} {seat_word} → {tier_name} tier → maximum discount {max_pct}%."


def _format_pricing_line(result: CalculationResult) -> str:
    # R8: The values are already rounded to 2 places by rules.calculate, so this
    # only adds the dollar sign and thousands separators and never rounds again
    s = f"${result.subtotal:,.2f}"
    d = f"${result.discount_amount:,.2f}"
    t = f"${result.total:,.2f}"
    p = format_percent(result.discount_pct)
    return f"Subtotal {s} → {p}% discount ({d}) → final {t}."


def _format_approval_lines(result: CalculationResult) -> list[str]:
    # R8: Clear confirmation when no approval is required
    if not result.approval_reasons:
        return ["Approval is not required."]

    # R8: One line per reason in result order; missing code raises KeyError
    return [
        f"Approval required because {_APPROVAL_REASON_PHRASES[code]}."
        for code in result.approval_reasons
    ]


def explain_pricing(draft: ValidDraft, result: CalculationResult) -> list[str]:
    # R8: Combine tier summary, pricing breakdown, and approval status
    return [
        _format_tier_line(draft, result),
        _format_pricing_line(result),
        *_format_approval_lines(result),
    ]


def generate_approval_guidance(result: CalculationResult) -> list[str]:
    # Deterministic guidance explaining why approval is required and what change removes each trigger
    if not result.approval_required:
        return []

    guidance: list[str] = []
    for reason in result.approval_reasons:
        if reason == "discount_above_15_percent":
            guidance.append(
                f"Discount exceeds the {format_percent(DISCOUNT_ABOVE_PCT)}% approval threshold. "
                f"Reducing the discount to {format_percent(DISCOUNT_ABOVE_PCT)}% or below removes this discount-based approval requirement."
            )
        elif reason == "annual_commitment_discount_above_10_percent":
            guidance.append(
                f"Annual commitment with a discount above {format_percent(COMMITMENT_DISCOUNT_ABOVE_PCT)}% requires approval."
            )
        elif reason == "total_above_25000":
            guidance.append(
                f"Quote total exceeds ${TOTAL_ABOVE:,.0f} and requires approval."
            )
    return guidance

