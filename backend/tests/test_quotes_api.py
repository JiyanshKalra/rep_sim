# Integration tests for quote persistence, status workflow, and storage isolation.
# Validates quote creation snapshots, list/detail endpoints, and status state machine (R6, R7).

import json
import os
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CASES_PATH = Path(__file__).parent / "cases.json"
with open(CASES_PATH, "r", encoding="utf-8") as f:
    _CASES_DATA = json.load(f)

SAVE_CASES = _CASES_DATA["save_cases"]

WORKED_EXAMPLE = {
    "customer_name": "Acme Corp",
    "seats": 50,
    "lines": [{"sku": "ONBOARDING", "quantity": 8}],
    "discount_pct": "20",
    "annual_commitment": False,
}


def _save_worked_example(name: str = "Acme Corp") -> dict[str, Any]:
    payload = {**WORKED_EXAMPLE, "customer_name": name}
    res = client.post("/api/quotes", json=payload)
    assert res.status_code == 201
    return res.json()


@pytest.mark.parametrize("case", SAVE_CASES, ids=[c["id"] for c in SAVE_CASES])
def test_R6_golden_save_cases_via_api(case: dict[str, Any]) -> None:
    # R6: Verify golden save cases from cases.json enforce customer name validation
    payload = {
        "seats": 10,
        "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": "0",
        "annual_commitment": False,
        "customer_name": case["customer_name"],
    }
    response = client.post("/api/quotes", json=payload)
    expected_errors = case["expected_errors"]
    if not expected_errors:
        assert response.status_code == 201
        assert response.json()["status"] == "draft"
    else:
        assert response.status_code == 422
        actual_errors = [
            {"code": e["code"], "field": e["field"]} for e in response.json()["errors"]
        ]
        assert actual_errors == expected_errors


def test_R6_saved_result_equals_calculate_response() -> None:
    # R6: Snapshot result in saved quote matches calculate endpoint response exactly
    calc_res = client.post("/api/quotes/calculate", json=WORKED_EXAMPLE)
    assert calc_res.status_code == 200

    saved = _save_worked_example()
    assert saved["result"] == calc_res.json()


def test_saved_quote_stores_explanation() -> None:
    # R8: Saved quote persists explanation snapshot identical to calculate endpoint
    calc_res = client.post("/api/quotes/calculate", json=WORKED_EXAMPLE)
    assert calc_res.status_code == 200
    calc_explanation = calc_res.json()["explanation"]

    saved = _save_worked_example("Stored Explanation Corp")
    get_res = client.get(f"/api/quotes/{saved['id']}")
    assert get_res.status_code == 200
    stored_result = get_res.json()["result"]
    assert stored_result["explanation"] == calc_explanation


def test_saved_explanation_survives_catalog_change(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # R8: Saved explanation is an immutable snapshot surviving subsequent catalog changes
    saved = _save_worked_example("Immutable Explanation Corp")
    quote_id = saved["id"]
    original_explanation = saved["result"]["explanation"]

    mod_catalog_file = tmp_path / "mod_catalog.json"
    mod_catalog_data = {
        "currency": "USD",
        "products": [
            {"sku": "AGENT-CORE", "name": "Agent Core", "unit_price": 999.00},
        ],
        "discount_rules": [
            {"code": "STARTER", "min_seats": 1, "max_seats": 99999, "max_discount_pct": 5},
        ],
    }
    mod_catalog_file.write_text(json.dumps(mod_catalog_data), encoding="utf-8")
    monkeypatch.setenv("CATALOG_PATH", str(mod_catalog_file))

    get_res = client.get(f"/api/quotes/{quote_id}")
    assert get_res.status_code == 200
    assert get_res.json()["result"]["explanation"] == original_explanation


def test_R5_invalid_save_stores_nothing() -> None:
    # R5: Invalid save returns validation errors in order and creates no stored records
    payload = {
        "customer_name": "",
        "seats": "abc",
        "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": 0,
        "annual_commitment": False,
    }
    response = client.post("/api/quotes", json=payload)
    assert response.status_code == 422
    errors = response.json()["errors"]
    assert [{"code": e["code"], "field": e["field"]} for e in errors] == [
        {"code": "customer_name_required", "field": "customer_name"},
        {"code": "seats_not_integer", "field": "seats"},
    ]

    list_res = client.get("/api/quotes")
    assert list_res.status_code == 200
    assert list_res.json() == []


def test_list_items_have_exactly_summary_keys() -> None:
    # R6: List endpoint returns summary objects with exact required keys and values
    _save_worked_example()
    list_res = client.get("/api/quotes")
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) == 1
    item = items[0]
    expected_keys = {
        "id",
        "customer_name",
        "seats",
        "tier",
        "total",
        "approval_required",
        "status",
        "created_at",
    }
    assert set(item.keys()) == expected_keys
    assert item["tier"] == "ENTERPRISE"
    assert item["total"] == "16000.00"
    assert item["approval_required"] is True
    assert item["status"] == "draft"


STATUS_TEXTS = {
    "draft": "submitted",
    "submitted": "approved, rejected",
    "approved": "none (this status is final)",
    "rejected": "none (this status is final)",
}

ALL_STATUSES = ["draft", "submitted", "approved", "rejected"]
REQUESTED_STATUSES = ["draft", "submitted", "approved", "rejected", "banana"]
VALID_PAIRS = {("draft", "submitted"), ("submitted", "approved"), ("submitted", "rejected")}


@pytest.mark.parametrize("current", ALL_STATUSES)
@pytest.mark.parametrize("requested", REQUESTED_STATUSES)
def test_R7_every_status_pair(current: str, requested: str) -> None:
    # R7: Exhaustively verify valid status transitions and 409 rejections for all pairs
    saved = _save_worked_example(f"Quote {current}->{requested}")
    quote_id = saved["id"]

    # Transition to current state
    if current == "submitted":
        client.patch(f"/api/quotes/{quote_id}/status", json={"status": "submitted"})
    elif current in ("approved", "rejected"):
        client.patch(f"/api/quotes/{quote_id}/status", json={"status": "submitted"})
        client.patch(
            f"/api/quotes/{quote_id}/status",
            json={"status": current, "reason": "Test setup rejection" if current == "rejected" else None},
        )

    # Test requested transition
    payload: dict[str, Any] = {"status": requested}
    if requested == "rejected":
        payload["reason"] = "Test requested rejection"
    res = client.patch(f"/api/quotes/{quote_id}/status", json=payload)
    if (current, requested) in VALID_PAIRS:
        assert res.status_code == 200
        assert res.json()["status"] == requested
    else:
        assert res.status_code == 409
        expected_msg = (
            f"A {current} quote cannot change to {requested}. "
            f"Allowed next statuses: {STATUS_TEXTS[current]}."
        )
        assert res.json() == {
            "errors": [
                {
                    "code": "invalid_transition",
                    "field": "status",
                    "message": expected_msg,
                }
            ]
        }

    # Verify quote status remains current after rejected transition
    get_res = client.get(f"/api/quotes/{quote_id}")
    expected_final = requested if (current, requested) in VALID_PAIRS else current
    assert get_res.json()["status"] == expected_final


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("GET", "/api/quotes/missing-id", None),
        ("PATCH", "/api/quotes/missing-id/status", {"status": "submitted"}),
    ],
)
def test_unknown_quote_id_uses_not_found_envelope(
    method: str, path: str, body: dict[str, Any] | None
) -> None:
    # 404: Missing quote IDs on GET or PATCH return standard not_found envelope
    if method == "GET":
        res = client.get(path)
    else:
        res = client.patch(path, json=body)
    assert res.status_code == 404
    assert res.json() == {
        "errors": [
            {
                "code": "not_found",
                "field": None,
                "message": "That quote was not found.",
            }
        ]
    }


@pytest.mark.parametrize("bad_body", [{}, {"status": 5}])
def test_status_body_must_have_a_string_status(bad_body: dict[str, Any]) -> None:
    # 422: Status update requests missing a valid string status return malformed_request envelope
    saved = _save_worked_example()
    res = client.patch(f"/api/quotes/{saved['id']}/status", json=bad_body)
    assert res.status_code == 422
    assert res.json() == {
        "errors": [
            {
                "code": "malformed_request",
                "field": None,
                "message": "The request could not be read. Check the data you sent and try again.",
            }
        ]
    }


def test_saved_quote_is_in_file_and_survives_new_client() -> None:
    # R6: Quote record is persisted to disk with exact keys and readable by fresh client
    saved = _save_worked_example()
    quote_id = saved["id"]

    quotes_path = Path(os.environ["QUOTES_PATH"])
    file_data = json.loads(quotes_path.read_text(encoding="utf-8"))
    assert list(file_data.keys()) == [quote_id]

    record = file_data[quote_id]
    expected_record_keys = {
        "id",
        "customer_name",
        "seats",
        "annual_commitment",
        "status",
        "created_at",
        "updated_at",
        "result",
        "history",
    }
    assert set(record.keys()) == expected_record_keys

    # No leftover temporary files in directory
    files_in_dir = [f.name for f in quotes_path.parent.iterdir() if f.is_file()]
    assert files_in_dir == ["quotes.json"]

    # Fresh client can read persisted quote
    fresh_client = TestClient(app)
    get_res = fresh_client.get(f"/api/quotes/{quote_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == quote_id


def test_corrupt_quotes_file_is_never_overwritten() -> None:
    # R6: Corrupted persistence file raises 500 and prevents write operations from overwriting
    quotes_path = Path(os.environ["QUOTES_PATH"])
    corrupt_content = "{not json"
    quotes_path.write_text(corrupt_content, encoding="utf-8")

    server_client = TestClient(app, raise_server_exceptions=False)
    list_res = server_client.get("/api/quotes")
    assert list_res.status_code == 500
    assert list_res.json()["errors"][0]["code"] == "internal_error"

    save_res = server_client.post("/api/quotes", json=WORKED_EXAMPLE)
    assert save_res.status_code == 500
    assert save_res.json()["errors"][0]["code"] == "internal_error"

    assert quotes_path.read_text(encoding="utf-8") == corrupt_content
