# Unit and integration tests for deal desk quote business rules and validation.
# Validates catalog loading, tier resolution, pricing math, approval triggers, and error reporting.

import json
from decimal import Decimal
from pathlib import Path

import pytest

from app.config import get_catalog_path
from app.rules import (
    Catalog,
    CatalogError,
    DraftLine,
    QuoteValidationError,
    ValidDraft,
    build_catalog,
    calculate,
    find_tier,
    format_money,
    format_percent,
    load_catalog,
    validate_draft,
)

CASES_PATH = Path(__file__).parent / "cases.json"
with open(CASES_PATH, "r", encoding="utf-8") as _f:
    _CASES_DATA = json.load(_f)

CALCULATION_CASES = _CASES_DATA["calculation_cases"]
VALIDATION_CASES = _CASES_DATA["validation_cases"]
SAVE_CASES = _CASES_DATA["save_cases"]


@pytest.fixture(scope="module")
def catalog() -> Catalog:
    """Fixture providing loaded and validated real catalog instance."""
    return load_catalog(get_catalog_path())


# === DATA-DRIVEN GOLDEN TESTS ===


@pytest.mark.parametrize("case", CALCULATION_CASES, ids=[c["id"] for c in CALCULATION_CASES])
def test_golden_calculation_cases(catalog: Catalog, case: dict) -> None:
    # R1-R4: Validate draft then calculate; assert tier, formatted money, and approval reasons match expected
    draft = validate_draft(catalog, case["input"])
    result = calculate(catalog, draft)
    expected = case["expected"]

    assert result.tier.code == expected["tier"]
    assert format_money(result.subtotal) == expected["subtotal"]
    assert format_money(result.discount_amount) == expected["discount_amount"]
    assert format_money(result.total) == expected["total"]
    assert result.approval_required == expected["approval_required"]
    assert result.approval_reasons == expected["approval_reasons"]


@pytest.mark.parametrize("case", VALIDATION_CASES, ids=[c["id"] for c in VALIDATION_CASES])
def test_golden_validation_cases(catalog: Catalog, case: dict) -> None:
    # R2 & R5: Invalid inputs must raise QuoteValidationError with exact errors in exact order
    with pytest.raises(QuoteValidationError) as exc_info:
        validate_draft(catalog, case["input"])

    actual_errors = [{"code": e.code, "field": e.field} for e in exc_info.value.errors]
    assert actual_errors == case["expected_errors"]


@pytest.mark.parametrize("case", SAVE_CASES, ids=[c["id"] for c in SAVE_CASES])
def test_golden_save_cases(catalog: Catalog, case: dict) -> None:
    # R6: Customer name validation required on save; valid base draft used with tested name
    base_input = {
        "seats": 10,
        "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": "0",
        "annual_commitment": False,
        "customer_name": case["customer_name"],
    }
    if not case["expected_errors"]:
        draft = validate_draft(catalog, base_input, require_customer_name=True)
        assert isinstance(draft, ValidDraft)
    else:
        with pytest.raises(QuoteValidationError) as exc_info:
            validate_draft(catalog, base_input, require_customer_name=True)
        actual_errors = [{"code": e.code, "field": e.field} for e in exc_info.value.errors]
        assert actual_errors == case["expected_errors"]


def test_every_error_has_a_readable_message(catalog: Catalog) -> None:
    # Sales reps need helpful error messages, not bare error codes
    for case in VALIDATION_CASES:
        with pytest.raises(QuoteValidationError) as exc_info:
            validate_draft(catalog, case["input"])
        for err in exc_info.value.errors:
            assert err.message, f"Empty message for error code {err.code} in case {case['id']}"
            assert err.message != err.code, (
                f"Error message should not equal error code in case {case['id']}"
            )


# === HAND-WRITTEN RULE TESTS ===


def test_R1_tier_boundaries_9_10_49_50(catalog: Catalog) -> None:
    # R1: Seats map to tiers by range boundaries; lower tiers closed, top tier open-ended
    assert find_tier(catalog, 1).code == "STARTER"
    assert find_tier(catalog, 9).code == "STARTER"
    assert find_tier(catalog, 10).code == "GROWTH"
    assert find_tier(catalog, 49).code == "GROWTH"
    assert find_tier(catalog, 50).code == "ENTERPRISE"
    assert find_tier(catalog, 100_000).code == "ENTERPRISE"


def test_R1_top_tier_is_open_ended_even_if_catalog_says_99999(catalog: Catalog) -> None:
    # R1: Top tier upper bound 99999 is a sentinel for 50+; max_seats must be None
    top_tier = find_tier(catalog, 50)
    assert top_tier.code == "ENTERPRISE"
    assert top_tier.max_seats is None
    assert find_tier(catalog, 99_999).code == "ENTERPRISE"
    assert find_tier(catalog, 100_000).code == "ENTERPRISE"
    assert find_tier(catalog, 1_000_000).code == "ENTERPRISE"


def test_R2_discount_cap_per_tier(catalog: Catalog) -> None:
    # R2: 0 <= discount <= tier cap. Cap accepted; cap + 0.01 rejected as discount_exceeds_tier_max
    tiers_to_test = [
        (9, "10", "10.01"),  # STARTER max 10%
        (49, "20", "20.01"),  # GROWTH max 20%
        (50, "30", "30.01"),  # ENTERPRISE max 30%
    ]
    for seats, cap_pct, over_pct in tiers_to_test:
        valid_raw = {
            "seats": seats,
            "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
            "discount_pct": cap_pct,
            "annual_commitment": False,
        }
        draft = validate_draft(catalog, valid_raw)
        assert draft.discount_pct == Decimal(cap_pct)

        invalid_raw = dict(valid_raw)
        invalid_raw["discount_pct"] = over_pct
        with pytest.raises(QuoteValidationError) as exc_info:
            validate_draft(catalog, invalid_raw)
        assert any(e.code == "discount_exceeds_tier_max" for e in exc_info.value.errors)


def test_R3_rounding_half_up_not_bankers(catalog: Catalog) -> None:
    # R3: 150 at 10.03% gives 15.045 discount.
    # Python round() and banker's rounding (ROUND_HALF_EVEN) round 15.045 to 15.04 (even neighbor).
    # ROUND_HALF_UP correctly rounds 15.045 to 15.05.
    raw = {
        "seats": 10,
        "lines": [{"sku": "AGENT-AUTOMATE", "quantity": 1}],  # unit price 150.00
        "discount_pct": "10.03",
        "annual_commitment": False,
    }
    draft = validate_draft(catalog, raw)
    result = calculate(catalog, draft)
    assert result.subtotal == Decimal("150.00")
    assert result.discount_amount == Decimal("15.05")
    assert result.total == Decimal("134.95")


def test_R3_total_is_subtotal_minus_rounded_discount(catalog: Catalog) -> None:
    # R3: Total is calculated by subtraction so numbers always add up exactly
    test_inputs = [
        (10, [DraftLine("AGENT-CORE", 5), DraftLine("AGENT-ANALYTICS", 3)], Decimal(5)),
        (50, [DraftLine("ONBOARDING", 8)], Decimal(20)),
        (10, [DraftLine("AGENT-CORE", 10)], Decimal("10.01")),
    ]
    for seats, lines, discount in test_inputs:
        draft = ValidDraft(
            customer_name="Test",
            seats=seats,
            lines=lines,
            discount_pct=discount,
            annual_commitment=False,
        )
        res = calculate(catalog, draft)
        assert res.total == res.subtotal - res.discount_amount


def test_R3_annual_commitment_does_not_change_price(catalog: Catalog) -> None:
    # R3 & R4: Annual commitment affects approval reasons only, never pricing or discount amounts
    draft_no_commit = ValidDraft(
        customer_name="A",
        seats=10,
        lines=[DraftLine("AGENT-CORE", 10)],
        discount_pct=Decimal(10),
        annual_commitment=False,
    )
    draft_with_commit = ValidDraft(
        customer_name="A",
        seats=10,
        lines=[DraftLine("AGENT-CORE", 10)],
        discount_pct=Decimal(10),
        annual_commitment=True,
    )
    res_no = calculate(catalog, draft_no_commit)
    res_with = calculate(catalog, draft_with_commit)
    assert res_no.subtotal == res_with.subtotal
    assert res_no.discount_amount == res_with.discount_amount
    assert res_no.total == res_with.total


def test_R4_approval_not_triggered_at_15(catalog: Catalog) -> None:
    # R4: Strict > comparison; exactly 15% discount does not require deal desk approval
    draft = ValidDraft(
        customer_name="A",
        seats=10,
        lines=[DraftLine("AGENT-CORE", 100)],
        discount_pct=Decimal(15),
        annual_commitment=False,
    )
    res = calculate(catalog, draft)
    assert not res.approval_required
    assert "discount_above_15_percent" not in res.approval_reasons


def test_R4_approval_triggered_at_15_01(catalog: Catalog) -> None:
    # R4: Strict > comparison; 15.01% is above 15% and requires approval
    draft = ValidDraft(
        customer_name="A",
        seats=10,
        lines=[DraftLine("AGENT-CORE", 100)],
        discount_pct=Decimal("15.01"),
        annual_commitment=False,
    )
    res = calculate(catalog, draft)
    assert res.approval_required
    assert "discount_above_15_percent" in res.approval_reasons


def test_R4_total_exactly_25000_is_not_approval(catalog: Catalog) -> None:
    # R4: Strict > comparison; post-discount total of exactly $25,000 does not require approval
    draft = ValidDraft(
        customer_name="A",
        seats=50,
        lines=[DraftLine("ONBOARDING", 10)],  # 10 * 2500 = 25000.00
        discount_pct=Decimal(0),
        annual_commitment=False,
    )
    res = calculate(catalog, draft)
    assert res.total == Decimal("25000.00")
    assert not res.approval_required
    assert "total_above_25000" not in res.approval_reasons


def test_R4_total_after_discount_is_what_counts(catalog: Catalog) -> None:
    # R4: Approval is evaluated on total AFTER discount; subtotal > 25000 with total <= 25000 needs no approval
    draft = ValidDraft(
        customer_name="A",
        seats=50,
        lines=[DraftLine("ONBOARDING", 11)],  # subtotal = 27500.00
        discount_pct=Decimal(10),  # discount = 2750.00 -> total = 24750.00
        annual_commitment=False,
    )
    res = calculate(catalog, draft)
    assert res.subtotal == Decimal("27500.00")
    assert res.total == Decimal("24750.00")
    assert not res.approval_required
    assert "total_above_25000" not in res.approval_reasons

    # Adding $120 exceeds threshold: total = 25120.00 > 25000.00
    draft_over = ValidDraft(
        customer_name="A",
        seats=50,
        lines=[DraftLine("ONBOARDING", 10), DraftLine("AGENT-CORE", 1)],
        discount_pct=Decimal(0),
        annual_commitment=False,
    )
    res_over = calculate(catalog, draft_over)
    assert res_over.total == Decimal("25120.00")
    assert "total_above_25000" in res_over.approval_reasons


def test_R4_commitment_10_vs_10_01(catalog: Catalog) -> None:
    # R4: Commitment discount cap is strict > 10%; exactly 10% is exempt, 10.01% requires approval
    draft_10 = ValidDraft(
        customer_name="A",
        seats=10,
        lines=[DraftLine("AGENT-CORE", 10)],
        discount_pct=Decimal(10),
        annual_commitment=True,
    )
    assert (
        "annual_commitment_discount_above_10_percent"
        not in calculate(catalog, draft_10).approval_reasons
    )

    draft_10_01 = ValidDraft(
        customer_name="A",
        seats=10,
        lines=[DraftLine("AGENT-CORE", 10)],
        discount_pct=Decimal("10.01"),
        annual_commitment=True,
    )
    assert (
        "annual_commitment_discount_above_10_percent"
        in calculate(catalog, draft_10_01).approval_reasons
    )

    draft_no_commit = ValidDraft(
        customer_name="A",
        seats=10,
        lines=[DraftLine("AGENT-CORE", 10)],
        discount_pct=Decimal("10.01"),
        annual_commitment=False,
    )
    assert (
        "annual_commitment_discount_above_10_percent"
        not in calculate(catalog, draft_no_commit).approval_reasons
    )


def test_R4_multiple_reasons_in_fixed_order(catalog: Catalog) -> None:
    # R4: Approval reasons must be generated in deterministic fixed order: discount, total, commitment
    draft = ValidDraft(
        customer_name="A",
        seats=50,
        lines=[DraftLine("ONBOARDING", 12)],  # subtotal 30000, 16% discount -> total 25200
        discount_pct=Decimal(16),
        annual_commitment=True,
    )
    res = calculate(catalog, draft)
    assert res.approval_required
    assert res.approval_reasons == [
        "discount_above_15_percent",
        "total_above_25000",
        "annual_commitment_discount_above_10_percent",
    ]


def test_R5_all_errors_at_once(catalog: Catalog) -> None:
    # R5: Collect all errors simultaneously rather than stopping on first error
    raw = {
        "seats": 0,
        "lines": [{"sku": "AGENT-CORE", "quantity": 0}],
        "discount_pct": -5,
        "annual_commitment": False,
    }
    with pytest.raises(QuoteValidationError) as exc_info:
        validate_draft(catalog, raw)
    codes = [e.code for e in exc_info.value.errors]
    assert codes == ["seats_out_of_range", "quantity_out_of_range", "discount_negative"]


def test_R5_no_cap_error_when_seats_invalid(catalog: Catalog) -> None:
    # R2 & R5: Tier discount cap check skipped if seats invalid since tier is unknown
    raw = {
        "seats": 0,
        "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": "99",
        "annual_commitment": False,
    }
    with pytest.raises(QuoteValidationError) as exc_info:
        validate_draft(catalog, raw)
    codes = [e.code for e in exc_info.value.errors]
    assert codes == ["seats_out_of_range"]
    assert "discount_exceeds_tier_max" not in codes


def test_R5_numeric_strings_are_accepted_and_trimmed(catalog: Catalog) -> None:
    # R5: Forms submit strings; whitespace-padded numeric strings must parse cleanly
    raw = {
        "seats": " 10 ",
        "lines": [{"sku": "AGENT-CORE", "quantity": " 2 "}],
        "discount_pct": " 10.5 ",
        "annual_commitment": False,
    }
    draft = validate_draft(catalog, raw)
    assert draft.seats == 10
    assert draft.lines[0].quantity == 2
    assert draft.discount_pct == Decimal("10.5")


def test_R5_nan_and_infinity_discount_are_not_numbers(catalog: Catalog) -> None:
    # R5: NaN and Infinity are non-finite floats and must be rejected as discount_not_number
    for bad_float in [float("nan"), float("inf"), float("-inf")]:
        raw = {
            "seats": 10,
            "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
            "discount_pct": bad_float,
            "annual_commitment": False,
        }
        with pytest.raises(QuoteValidationError) as exc_info:
            validate_draft(catalog, raw)
        assert exc_info.value.errors[0].code == "discount_not_number"


def test_R5_huge_digit_string_does_not_crash(catalog: Catalog) -> None:
    # R5: Python integer conversion limit protection; huge digit string yields seats_not_integer without crash
    raw = {
        "seats": "9" * 5000,
        "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": "0",
        "annual_commitment": False,
    }
    with pytest.raises(QuoteValidationError) as exc_info:
        validate_draft(catalog, raw)
    assert any(e.code == "seats_not_integer" for e in exc_info.value.errors)


def test_R5_negative_zero_discount_is_zero(catalog: Catalog) -> None:
    # R5: Negative zero counts as zero, not negative discount
    raw = {
        "seats": 10,
        "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": "-0",
        "annual_commitment": False,
    }
    draft = validate_draft(catalog, raw)
    assert draft.discount_pct == Decimal(0)
    assert format_percent(draft.discount_pct) == "0"


def test_R5_percent_formatting() -> None:
    # R5: Normalized percentage display without exponential notation; zeros format as "0"
    assert format_percent(Decimal("10.500")) == "10.5"
    assert format_percent(Decimal(20)) == "20"
    assert format_percent(Decimal("0.00")) == "0"
    assert format_percent(Decimal("-0")) == "0"
    assert format_percent(Decimal("10.01")) == "10.01"


def test_R5_unknown_sku_is_exact_match(catalog: Catalog) -> None:
    # R5: Product SKUs are exact and case-sensitive; no lowercase or trimming matches allowed
    for bad_sku in ["agent-core", "AGENT-CORE ", " AGENT-CORE"]:
        raw = {
            "seats": 10,
            "lines": [{"sku": bad_sku, "quantity": 1}],
            "discount_pct": "0",
            "annual_commitment": False,
        }
        with pytest.raises(QuoteValidationError) as exc_info:
            validate_draft(catalog, raw)
        assert any(e.code == "sku_unknown" for e in exc_info.value.errors)


def test_R5_missing_and_wrong_typed_fields(catalog: Catalog) -> None:
    # R5: Malformed payloads must be handled gracefully without crashing
    for malformed in [{}, "text", None]:
        with pytest.raises(QuoteValidationError) as exc_info:
            validate_draft(catalog, malformed)  # type: ignore[arg-type]
        assert len(exc_info.value.errors) > 0

    base = {"seats": 10, "lines": [{"sku": "AGENT-CORE", "quantity": 1}], "discount_pct": "0"}
    for bad_commit in ["true", 1, 0, "false"]:
        raw = dict(base)
        raw["annual_commitment"] = bad_commit
        with pytest.raises(QuoteValidationError) as exc_info:
            validate_draft(catalog, raw)
        assert any(e.code == "annual_commitment_invalid" for e in exc_info.value.errors)

    # Missing annual_commitment defaults to False
    draft = validate_draft(catalog, base)
    assert draft.annual_commitment is False


def test_R6_customer_name_rules(catalog: Catalog) -> None:
    # R6: Customer name: required on save, max 120 chars, stripped of whitespace
    base = {
        "seats": 10,
        "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": "0",
        "annual_commitment": False,
    }
    # 120 chars is valid
    raw_120 = dict(base, customer_name="A" * 120)
    draft_120 = validate_draft(catalog, raw_120, require_customer_name=True)
    assert draft_120.customer_name == "A" * 120

    # 121 chars is rejected
    raw_121 = dict(base, customer_name="A" * 121)
    with pytest.raises(QuoteValidationError) as exc_info:
        validate_draft(catalog, raw_121, require_customer_name=True)
    assert exc_info.value.errors[0].code == "customer_name_too_long"

    # Whitespace trimmed
    raw_padded = dict(base, customer_name="   Acme Corp   ")
    draft_padded = validate_draft(catalog, raw_padded, require_customer_name=True)
    assert draft_padded.customer_name == "Acme Corp"

    # Calculate only (require_customer_name=False) allows empty/missing name
    draft_calc = validate_draft(catalog, base, require_customer_name=False)
    assert draft_calc.customer_name == ""


def test_catalog_self_validation() -> None:
    # R1: Catalog consistency checks; detects duplicate SKUs, tier gaps, overlaps, and missing tiers
    base_catalog = {
        "currency": "USD",
        "discount_rules": [
            {"code": "T1", "min_seats": 1, "max_seats": 99999, "max_discount_pct": 10}
        ],
        "products": [{"sku": "P1", "name": "Prod 1", "unit_price": 10}],
    }
    # Duplicate SKU
    dup_sku = dict(
        base_catalog,
        products=[
            {"sku": "P1", "name": "Prod 1", "unit_price": 10},
            {"sku": "P1", "name": "Prod 1 Dup", "unit_price": 20},
        ],
    )
    with pytest.raises(CatalogError, match="Duplicate product SKU"):
        build_catalog(dup_sku)

    # No tiers
    no_tiers = dict(base_catalog, discount_rules=[])
    with pytest.raises(CatalogError, match="at least one discount tier"):
        build_catalog(no_tiers)

    # First tier does not start at 1
    bad_start = dict(
        base_catalog,
        discount_rules=[{"code": "T1", "min_seats": 2, "max_seats": 99999, "max_discount_pct": 10}],
    )
    with pytest.raises(CatalogError, match="must start at min_seats 1"):
        build_catalog(bad_start)

    # Overlapping tiers
    overlap = dict(
        base_catalog,
        discount_rules=[
            {"code": "T1", "min_seats": 1, "max_seats": 10, "max_discount_pct": 10},
            {"code": "T2", "min_seats": 10, "max_seats": 99999, "max_discount_pct": 20},
        ],
    )
    with pytest.raises(CatalogError, match="Tier gap or overlap"):
        build_catalog(overlap)

    # Gap between tiers
    gap = dict(
        base_catalog,
        discount_rules=[
            {"code": "T1", "min_seats": 1, "max_seats": 9, "max_discount_pct": 10},
            {"code": "T2", "min_seats": 12, "max_seats": 99999, "max_discount_pct": 20},
        ],
    )
    with pytest.raises(CatalogError, match="Tier gap or overlap"):
        build_catalog(gap)


def test_real_catalog_loads(catalog: Catalog) -> None:
    # R1: Validates expected structure and types of the production catalog.json
    assert [t.code for t in catalog.tiers] == ["STARTER", "GROWTH", "ENTERPRISE"]
    assert catalog.tiers[-1].max_seats is None
    assert len(catalog.products) == 4
    assert catalog.products["AGENT-CORE"].unit_price == Decimal("120.00")


def test_R5_negative_zero_discount_sign_normalization(catalog: Catalog) -> None:
    # Kills M25: Ensures -0 normalizes to positive Decimal(0) so discount_amount and formatting never produce -0.00
    raw = {
        "seats": 10,
        "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": "-0",
        "annual_commitment": False,
    }
    draft = validate_draft(catalog, raw)
    assert not draft.discount_pct.is_signed()
    result = calculate(catalog, draft)
    assert not result.discount_amount.is_signed()
    assert format_money(result.discount_amount) == "0.00"


def test_R3_format_money_half_up_rounding() -> None:
    # Kills M35: format_money must round half-cent up (12.005 -> 12.01) rather than even (12.00)
    assert format_money(Decimal("12.005")) == "12.01"
    assert format_money(Decimal("12.015")) == "12.02"


def test_R6_customer_name_length_is_checked_after_stripping(catalog: Catalog) -> None:
    # R6: Name with surrounding spaces strips to exactly 120 chars and is accepted
    padded_name = " " + "A" * 120 + " "
    raw = {
        "seats": 10,
        "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": "0",
        "annual_commitment": False,
        "customer_name": padded_name,
    }
    draft = validate_draft(catalog, raw, require_customer_name=True)
    assert draft.customer_name == "A" * 120


@pytest.mark.parametrize(
    "payload",
    [
        None,
        [],
        "text",
        {},
        {"seats": [], "lines": [{"sku": "AGENT-CORE", "quantity": 1}], "discount_pct": "0"},
        {"seats": {}, "lines": [{"sku": "AGENT-CORE", "quantity": 1}], "discount_pct": "0"},
        {"seats": 10, "lines": {}, "discount_pct": "0"},
        {"seats": 10, "lines": "bad", "discount_pct": "0"},
        {"seats": 10, "lines": [None], "discount_pct": "0"},
        {"seats": 10, "lines": [5], "discount_pct": "0"},
        {"seats": 10, "lines": ["AGENT-CORE"], "discount_pct": "0"},
        {"seats": 10, "lines": [{"sku": ["AGENT-CORE"], "quantity": 1}], "discount_pct": "0"},
        {"seats": 10, "lines": [{"sku": "AGENT-CORE", "quantity": [1]}], "discount_pct": "0"},
        {"seats": 10, "lines": [{"sku": "AGENT-CORE", "quantity": {}}], "discount_pct": "0"},
        {
            "seats": 10,
            "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
            "discount_pct": float("inf"),
        },
        {"seats": 10, "lines": [{"sku": "AGENT-CORE", "quantity": 1}], "discount_pct": []},
        {"seats": 10, "lines": [{"sku": "AGENT-CORE", "quantity": 1}], "discount_pct": {}},
        {
            "seats": 10,
            "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
            "discount_pct": "0",
            "customer_name": 42,
            "annual_commitment": False,
        },
        {
            "seats": 10,
            "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
            "discount_pct": "0",
            "annual_commitment": [],
        },
    ],
)
def test_R5_malformed_payloads_only_raise_quote_validation_error(
    catalog: Catalog, payload: object
) -> None:
    # R5: Every malformed payload must raise QuoteValidationError (never KeyError, TypeError, etc.)
    # and every error must have a non-empty code, a field, and a message.
    try:
        validate_draft(catalog, payload, require_customer_name=True)  # type: ignore[arg-type]
        assert False, f"Expected QuoteValidationError for payload: {payload!r}"
    except QuoteValidationError as exc:
        assert len(exc.errors) > 0, "At least one error expected"
        for err in exc.errors:
            assert err.code, f"Error code must be non-empty: {err!r}"
            assert err.field is not None, f"Error field must not be None: {err!r}"
            assert err.message, f"Error message must be non-empty: {err!r}"
    except Exception as exc:
        raise AssertionError(
            f"Expected QuoteValidationError but got {type(exc).__name__}: {exc}\n"
            f"Payload: {payload!r}"
        ) from exc


def test_C2_non_object_line_reports_only_sku_unknown(catalog: Catalog) -> None:
    # C2: A non-object line reports exactly one error: sku_unknown on lines[i].sku; no quantity error
    base = {
        "seats": 10,
        "discount_pct": "0",
        "annual_commitment": False,
    }
    for bad_line in [5, "AGENT-CORE", None]:
        raw = dict(base, lines=[bad_line])
        with pytest.raises(QuoteValidationError) as exc_info:
            validate_draft(catalog, raw)
        errors = [(e.code, e.field) for e in exc_info.value.errors]
        assert errors == [("sku_unknown", "lines[0].sku")], (
            f"For line {bad_line!r}, expected [(sku_unknown, lines[0].sku)], got {errors}"
        )

    # Mixed: first line bad, second line valid -> only the bad line's sku_unknown
    raw_mixed = dict(
        base,
        lines=[5, {"sku": "AGENT-CORE", "quantity": 1}],
    )
    with pytest.raises(QuoteValidationError) as exc_info:
        validate_draft(catalog, raw_mixed)
    errors = [(e.code, e.field) for e in exc_info.value.errors]
    assert errors == [("sku_unknown", "lines[0].sku")], (
        f"For mixed lines, expected [(sku_unknown, lines[0].sku)], got {errors}"
    )


def test_C3_catalog_tier_errors_raise_catalog_error() -> None:
    # C3: Missing or non-integer max_seats on a lower tier raises CatalogError, not KeyError/TypeError
    base_products = [{"sku": "P1", "name": "Prod 1", "unit_price": 10}]

    # Lower tier with max_seats missing -> CatalogError naming the tier code
    missing_max = {
        "currency": "USD",
        "products": base_products,
        "discount_rules": [
            {"code": "T1", "min_seats": 1, "max_discount_pct": 10},
            {"code": "T2", "min_seats": 2, "max_seats": 99999, "max_discount_pct": 20},
        ],
    }
    with pytest.raises(CatalogError, match="T1"):
        build_catalog(missing_max)

    # Lower tier with max_seats = None -> CatalogError naming the tier code
    none_max = {
        "currency": "USD",
        "products": base_products,
        "discount_rules": [
            {"code": "T1", "min_seats": 1, "max_seats": None, "max_discount_pct": 10},
            {"code": "T2", "min_seats": 2, "max_seats": 99999, "max_discount_pct": 20},
        ],
    }
    with pytest.raises(CatalogError, match="T1"):
        build_catalog(none_max)

    # Lower tier with max_seats below min_seats -> CatalogError naming the tier code
    max_below_min = {
        "currency": "USD",
        "products": base_products,
        "discount_rules": [
            {"code": "T1", "min_seats": 1, "max_seats": 0, "max_discount_pct": 10},
            {"code": "T2", "min_seats": 2, "max_seats": 99999, "max_discount_pct": 20},
        ],
    }
    with pytest.raises(CatalogError, match="T1"):
        build_catalog(max_below_min)

    # Top tier without max_seats builds fine
    top_no_max = {
        "currency": "USD",
        "products": base_products,
        "discount_rules": [
            {"code": "T1", "min_seats": 1, "max_seats": 9, "max_discount_pct": 10},
            {"code": "T2", "min_seats": 10, "max_discount_pct": 20},
        ],
    }
    cat = build_catalog(top_no_max)
    assert cat.tiers[-1].max_seats is None


def test_C4_catalog_unit_price_rounds_half_up() -> None:
    # C4: Catalog unit prices quantize with ROUND_HALF_UP (e.g. 0.005 -> 0.01, 12.345 -> 12.35)
    catalog_data = {
        "currency": "USD",
        "discount_rules": [
            {"code": "T1", "min_seats": 1, "max_discount_pct": 10},
        ],
        "products": [
            {"sku": "P1", "name": "Prod 1", "unit_price": Decimal("0.005")},
            {"sku": "P2", "name": "Prod 2", "unit_price": Decimal("12.345")},
        ],
    }
    cat = build_catalog(catalog_data)
    assert cat.products["P1"].unit_price == Decimal("0.01")
    assert cat.products["P2"].unit_price == Decimal("12.35")
