# Unit tests for deterministic pricing explanation generation (R8).
# Validates formatted lines, singular/plural grammar, and approval reason phrases.

import dataclasses

import pytest

from app import rules
from app.config import get_catalog_path
from app.explain import explain_pricing
from app.rules import format_percent


def test_R8_worked_example_matches_readme_text() -> None:
    # R8: 50 seats, ONBOARDING x8, 20% discount matches canonical worked example
    catalog = rules.load_catalog(get_catalog_path())
    draft = rules.validate_draft(
        catalog,
        {
            "seats": 50,
            "lines": [{"sku": "ONBOARDING", "quantity": 8}],
            "discount_pct": "20",
            "annual_commitment": False,
        },
        require_customer_name=False,
    )
    result = rules.calculate(catalog, draft)
    expected = [
        "50 seats → Enterprise tier → maximum discount 30%.",
        "Subtotal $20,000.00 → 20% discount ($4,000.00) → final $16,000.00.",
        "Approval required because discount is above 15%.",
    ]
    assert explain_pricing(draft, result) == expected


def test_R8_no_approval_text() -> None:
    # R8: Quotes without approval triggers display Approval is not required.
    catalog = rules.load_catalog(get_catalog_path())
    draft = rules.validate_draft(
        catalog,
        {
            "seats": 9,
            "lines": [{"sku": "AGENT-CORE", "quantity": 10}],
            "discount_pct": "10",
            "annual_commitment": False,
        },
        require_customer_name=False,
    )
    result = rules.calculate(catalog, draft)
    expected = [
        "9 seats → Starter tier → maximum discount 10%.",
        "Subtotal $1,200.00 → 10% discount ($120.00) → final $1,080.00.",
        "Approval is not required.",
    ]
    assert explain_pricing(draft, result) == expected


def test_R8_all_three_reasons_in_fixed_order() -> None:
    # R8: All three approval reasons appear in strict business rule order
    catalog = rules.load_catalog(get_catalog_path())
    draft = rules.validate_draft(
        catalog,
        {
            "seats": 50,
            "lines": [{"sku": "ONBOARDING", "quantity": 12}],
            "discount_pct": "16",
            "annual_commitment": True,
        },
        require_customer_name=False,
    )
    result = rules.calculate(catalog, draft)
    expected = [
        "50 seats → Enterprise tier → maximum discount 30%.",
        "Subtotal $30,000.00 → 16% discount ($4,800.00) → final $25,200.00.",
        "Approval required because discount is above 15%.",
        "Approval required because total is above $25,000.",
        "Approval required because annual commitment is selected and discount is above 10%.",
    ]
    assert explain_pricing(draft, result) == expected


def test_R8_single_seat_uses_singular() -> None:
    # R8: Exactly 1 seat formats as 1 seat instead of plural seats
    catalog = rules.load_catalog(get_catalog_path())
    draft = rules.validate_draft(
        catalog,
        {
            "seats": 1,
            "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
            "discount_pct": "0",
            "annual_commitment": False,
        },
        require_customer_name=False,
    )
    result = rules.calculate(catalog, draft)
    explanation = explain_pricing(draft, result)
    assert explanation[0] == "1 seat → Starter tier → maximum discount 10%."
    assert explanation[1] == "Subtotal $120.00 → 0% discount ($0.00) → final $120.00."


def test_R8_thresholds_come_from_rules_constants() -> None:
    # R8: Explanation threshold numbers derive directly from rules constants
    catalog = rules.load_catalog(get_catalog_path())
    draft = rules.validate_draft(
        catalog,
        {
            "seats": 50,
            "lines": [{"sku": "ONBOARDING", "quantity": 12}],
            "discount_pct": "16",
            "annual_commitment": True,
        },
        require_customer_name=False,
    )
    result = rules.calculate(catalog, draft)
    explanation = explain_pricing(draft, result)

    assert format_percent(rules.DISCOUNT_ABOVE_PCT) in explanation[2]
    assert f"{rules.TOTAL_ABOVE:,.0f}" in explanation[3]
    assert format_percent(rules.COMMITMENT_DISCOUNT_ABOVE_PCT) in explanation[4]


def test_R8_every_reason_code_has_a_phrase() -> None:
    # R8: Every valid reason code maps to phrase; unknown reason code raises KeyError
    catalog = rules.load_catalog(get_catalog_path())

    # Case 1: only discount_above_15_percent
    d1 = rules.validate_draft(
        catalog,
        {
            "seats": 50,
            "lines": [{"sku": "ONBOARDING", "quantity": 8}],
            "discount_pct": "20",
            "annual_commitment": False,
        },
        require_customer_name=False,
    )
    r1 = rules.calculate(catalog, d1)
    assert r1.approval_reasons == ["discount_above_15_percent"]
    assert "Approval required because discount is above 15%." in explain_pricing(d1, r1)

    # Case 2: only total_above_25000
    d2 = rules.validate_draft(
        catalog,
        {
            "seats": 50,
            "lines": [{"sku": "ONBOARDING", "quantity": 11}],
            "discount_pct": "0",
            "annual_commitment": False,
        },
        require_customer_name=False,
    )
    r2 = rules.calculate(catalog, d2)
    assert r2.approval_reasons == ["total_above_25000"]
    assert "Approval required because total is above $25,000." in explain_pricing(d2, r2)

    # Case 3: only annual_commitment_discount_above_10_percent
    d3 = rules.validate_draft(
        catalog,
        {
            "seats": 10,
            "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
            "discount_pct": "11",
            "annual_commitment": True,
        },
        require_customer_name=False,
    )
    r3 = rules.calculate(catalog, d3)
    assert r3.approval_reasons == ["annual_commitment_discount_above_10_percent"]
    assert (
        "Approval required because annual commitment is selected and discount is above 10%."
        in explain_pricing(d3, r3)
    )

    # Unknown code raises KeyError
    bad_result = dataclasses.replace(r1, approval_reasons=["unknown_rule_code"])
    with pytest.raises(KeyError):
        explain_pricing(d1, bad_result)


def test_R8_is_deterministic() -> None:
    # R8: Generating explanation multiple times produces identical output
    catalog = rules.load_catalog(get_catalog_path())
    draft = rules.validate_draft(
        catalog,
        {
            "seats": 50,
            "lines": [{"sku": "ONBOARDING", "quantity": 8}],
            "discount_pct": "20",
            "annual_commitment": False,
        },
        require_customer_name=False,
    )
    result = rules.calculate(catalog, draft)
    first = explain_pricing(draft, result)
    second = explain_pricing(draft, result)
    assert first == second
