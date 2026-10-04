from app.config import get_catalog_path
# Tests for audit history, rejection reason, customer-requested discount, and approval guidance.

import json
import os
from decimal import Decimal
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app import rules
from app.explain import generate_approval_guidance
from app.main import app

client = TestClient(app)

BASE_PAYLOAD = {
    "customer_name": "Test Enterprise",
    "seats": 50,
    "lines": [{"sku": "ONBOARDING", "quantity": 8}],
    "discount_pct": "20",
    "annual_commitment": False,
}


def _create_saved_quote(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = {**BASE_PAYLOAD, **(overrides or {})}
    res = client.post("/api/quotes", json=payload)
    assert res.status_code == 201
    return res.json()


def test_new_quote_starts_with_audit_history() -> None:
    # 1. New quote starts with audit history
    quote = _create_saved_quote()
    assert "history" in quote
    assert len(quote["history"]) == 1
    first = quote["history"][0]
    assert first["action"] == "created"
    assert first["details"] == "Quote created"
    assert "timestamp" in first and len(first["timestamp"]) > 0


def test_draft_to_submitted_records_history() -> None:
    # 2. draft -> submitted records history
    quote = _create_saved_quote()
    quote_id = quote["id"]

    res = client.patch(f"/api/quotes/{quote_id}/status", json={"status": "submitted"})
    assert res.status_code == 200
    updated = res.json()
    assert len(updated["history"]) == 2
    assert updated["history"][1]["action"] == "submitted"
    assert updated["history"][1]["details"] == "Quote submitted for approval"


def test_submitted_to_approved_records_history() -> None:
    # 3. submitted -> approved records history
    quote = _create_saved_quote()
    quote_id = quote["id"]

    client.patch(f"/api/quotes/{quote_id}/status", json={"status": "submitted"})
    res = client.patch(f"/api/quotes/{quote_id}/status", json={"status": "approved"})
    assert res.status_code == 200
    updated = res.json()
    assert len(updated["history"]) == 3
    assert updated["history"][2]["action"] == "approved"
    assert updated["history"][2]["details"] == "Quote approved"


def test_submitted_to_rejected_requires_reason() -> None:
    # 4 & 5. submitted -> rejected requires non-empty reason
    quote = _create_saved_quote()
    quote_id = quote["id"]
    client.patch(f"/api/quotes/{quote_id}/status", json={"status": "submitted"})

    # Missing reason
    res_missing = client.patch(f"/api/quotes/{quote_id}/status", json={"status": "rejected"})
    assert res_missing.status_code == 422
    assert res_missing.json()["errors"][0]["code"] == "rejection_reason_required"

    # Whitespace-only reason
    res_blank = client.patch(
        f"/api/quotes/{quote_id}/status", json={"status": "rejected", "reason": "   "}
    )
    assert res_blank.status_code == 422
    assert res_blank.json()["errors"][0]["code"] == "rejection_reason_required"


def test_submitted_to_rejected_stores_reason_in_history_and_quote() -> None:
    # 6. submitted -> rejected stores reason
    quote = _create_saved_quote()
    quote_id = quote["id"]
    client.patch(f"/api/quotes/{quote_id}/status", json={"status": "submitted"})

    reason_text = "Budget freeze for Q4"
    res = client.patch(
        f"/api/quotes/{quote_id}/status",
        json={"status": "rejected", "reason": reason_text},
    )
    assert res.status_code == 200
    updated = res.json()
    assert updated["status"] == "rejected"
    assert updated["rejection_reason"] == reason_text
    assert len(updated["history"]) == 3
    last_event = updated["history"][-1]
    assert last_event["action"] == "rejected"
    assert reason_text in last_event["details"]


def test_existing_quote_without_history_loads_and_transitions_safely() -> None:
    # 7. Existing quote without history loads successfully
    quote = _create_saved_quote()
    quote_id = quote["id"]

    # Directly edit the JSON file to simulate an old record saved before history was introduced
    quotes_path = Path(os.environ["QUOTES_PATH"])
    file_data = json.loads(quotes_path.read_text(encoding="utf-8"))
    assert quote_id in file_data
    del file_data[quote_id]["history"]
    if "rejection_reason" in file_data[quote_id]:
        del file_data[quote_id]["rejection_reason"]
    if "customer_requested_discount_pct" in file_data[quote_id]:
        del file_data[quote_id]["customer_requested_discount_pct"]
    quotes_path.write_text(json.dumps(file_data, indent=2), encoding="utf-8")

    # Verify GET loads safely with history as empty list
    get_res = client.get(f"/api/quotes/{quote_id}")
    assert get_res.status_code == 200
    loaded = get_res.json()
    assert loaded["history"] == []
    assert loaded["rejection_reason"] is None

    # Transitioning the legacy quote appends cleanly without crashing
    patch_res = client.patch(f"/api/quotes/{quote_id}/status", json={"status": "submitted"})
    assert patch_res.status_code == 200
    assert len(patch_res.json()["history"]) == 1
    assert patch_res.json()["history"][0]["action"] == "submitted"


def test_customer_requested_discount_does_not_affect_pricing() -> None:
    # 8. Customer-requested discount does NOT affect pricing
    catalog = rules.load_catalog(get_catalog_path())
    draft_no_req = rules.validate_draft(
        catalog,
        {
            "customer_name": "Test",
            "seats": 50,
            "lines": [{"sku": "ONBOARDING", "quantity": 8}],
            "discount_pct": "15",
            "annual_commitment": False,
        },
    )
    draft_with_req = rules.validate_draft(
        catalog,
        {
            "customer_name": "Test",
            "seats": 50,
            "lines": [{"sku": "ONBOARDING", "quantity": 8}],
            "discount_pct": "15",
            "annual_commitment": False,
            "customer_requested_discount_pct": "35",
        },
    )

    res1 = rules.calculate(catalog, draft_no_req)
    res2 = rules.calculate(catalog, draft_with_req)

    assert res1.subtotal == res2.subtotal
    assert res1.discount_amount == res2.discount_amount
    assert res1.total == res2.total
    assert res1.tier == res2.tier
    assert res1.approval_required == res2.approval_required


def test_customer_requested_discount_does_not_affect_approval() -> None:
    # 9. Customer-requested discount does NOT affect approval
    catalog = rules.load_catalog(get_catalog_path())
    # 5 seats, 10% proposed discount (no approval required), customer asked for 50%
    draft = rules.validate_draft(
        catalog,
        {
            "customer_name": "Test",
            "seats": 5,
            "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
            "discount_pct": "10",
            "annual_commitment": False,
            "customer_requested_discount_pct": "50",
        },
    )
    res = rules.calculate(catalog, draft)
    assert not res.approval_required
    assert res.approval_reasons == []


def test_approval_guidance_deterministic_reasons() -> None:
    # Approval guidance for discount >15%, annual commitment + discount >10%, total >$25k
    catalog = rules.load_catalog(get_catalog_path())

    # Case 1: discount > 15%
    d1 = rules.ValidDraft(
        customer_name="Test",
        seats=50,
        lines=[rules.DraftLine("AGENT-CORE", 1)],
        discount_pct=Decimal(20),
        annual_commitment=False,
    )
    r1 = rules.calculate(catalog, d1)
    g1 = generate_approval_guidance(r1)
    assert len(g1) == 1
    assert "Discount exceeds the 15% approval threshold." in g1[0]
    assert "Reducing the discount to 15% or below removes this discount-based approval requirement." in g1[0]

    # Case 2: annual commitment + discount > 10%
    d2 = rules.ValidDraft(
        customer_name="Test",
        seats=50,
        lines=[rules.DraftLine("AGENT-CORE", 1)],
        discount_pct=Decimal(12),
        annual_commitment=True,
    )
    r2 = rules.calculate(catalog, d2)
    g2 = generate_approval_guidance(r2)
    assert any("Annual commitment with a discount above 10% requires approval." in msg for msg in g2)

    # Case 3: total > $25,000
    d3 = rules.ValidDraft(
        customer_name="Test",
        seats=50,
        lines=[rules.DraftLine("ONBOARDING", 12)],
        discount_pct=Decimal(10),
        annual_commitment=False,
    )
    r3 = rules.calculate(catalog, d3)
    g3 = generate_approval_guidance(r3)
    assert any("Quote total exceeds $25,000 and requires approval." in msg for msg in g3)

    # Case 4: No approval required
    d4 = rules.ValidDraft(
        customer_name="Test",
        seats=50,
        lines=[rules.DraftLine("AGENT-CORE", 1)],
        discount_pct=Decimal(10),
        annual_commitment=False,
    )
    r4 = rules.calculate(catalog, d4)
    g4 = generate_approval_guidance(r4)
    assert g4 == []
