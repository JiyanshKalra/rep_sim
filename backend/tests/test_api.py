# API integration tests for catalog retrieval, quote calculation, and error envelope handling.
# Tests HTTP endpoints, status codes, response schemas, and CORS headers using TestClient.

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CASES_PATH = Path(__file__).parent / "cases.json"
with open(CASES_PATH, "r", encoding="utf-8") as _f:
    _CASES_DATA = json.load(_f)

CALCULATION_CASES = _CASES_DATA["calculation_cases"]
VALIDATION_CASES = _CASES_DATA["validation_cases"]


def test_catalog_shape_and_strings() -> None:
    # Verify catalog endpoint returns structured products, tiers, and approval thresholds
    response = client.get("/api/catalog")
    assert response.status_code == 200
    data = response.json()
    assert data["currency"] == "USD"
    assert len(data["products"]) == 4

    agent_core = next(p for p in data["products"] if p["sku"] == "AGENT-CORE")
    assert agent_core["unit_price"] == "120.00"

    assert [t["code"] for t in data["tiers"]] == ["STARTER", "GROWTH", "ENTERPRISE"]
    assert [t["max_seats"] for t in data["tiers"]] == [9, 49, None]
    assert [t["max_discount_pct"] for t in data["tiers"]] == ["10", "20", "30"]

    assert data["approval_rules"] == {
        "discount_above_pct": "15",
        "total_above": "25000.00",
        "annual_commitment_discount_above_pct": "10",
    }


@pytest.mark.parametrize("case", CALCULATION_CASES, ids=[c["id"] for c in CALCULATION_CASES])
def test_golden_calculation_cases_via_api(case: dict) -> None:
    # Verify calculated totals, discount amount, and approval status match expected golden cases
    response = client.post("/api/quotes/calculate", json=case["input"])
    assert response.status_code == 200
    data = response.json()
    expected = case["expected"]
    assert data["tier"] == expected["tier"]
    assert data["subtotal"] == expected["subtotal"]
    assert data["discount_amount"] == expected["discount_amount"]
    assert data["total"] == expected["total"]
    assert data["approval_required"] == expected["approval_required"]
    assert data["approval_reasons"] == expected["approval_reasons"]


@pytest.mark.parametrize("case", VALIDATION_CASES, ids=[c["id"] for c in VALIDATION_CASES])
def test_golden_validation_cases_via_api(case: dict) -> None:
    # Verify invalid drafts produce expected 422 error envelope and rule codes
    response = client.post("/api/quotes/calculate", json=case["input"])
    assert response.status_code == 422
    data = response.json()
    assert list(data.keys()) == ["errors"]
    actual_errors = [{"code": e["code"], "field": e["field"]} for e in data["errors"]]
    assert actual_errors == case["expected_errors"]
    for err in data["errors"]:
        assert isinstance(err["message"], str) and len(err["message"]) > 0


def test_R1_api_tier_boundaries_9_10_49_50() -> None:
    # R1: Verify seat boundary transitions between tiers at 9, 10, 49, and 50 seats
    expected_tiers = [(9, "STARTER"), (10, "GROWTH"), (49, "GROWTH"), (50, "ENTERPRISE")]
    for seats, expected_tier in expected_tiers:
        payload = {
            "seats": seats,
            "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
            "discount_pct": 0,
            "annual_commitment": False,
        }
        response = client.post("/api/quotes/calculate", json=payload)
        assert response.status_code == 200
        assert response.json()["tier"] == expected_tier


def test_R3_worked_example_full_response() -> None:
    # R3 & R4: Verify complete response structure and values for 50-seat ONBOARDING example
    payload = {
        "seats": 50,
        "lines": [{"sku": "ONBOARDING", "quantity": 8}],
        "discount_pct": "20",
        "annual_commitment": False,
    }
    response = client.post("/api/quotes/calculate", json=payload)
    assert response.status_code == 200
    assert response.json() == {
        "tier": "ENTERPRISE",
        "max_discount_pct": "30",
        "currency": "USD",
        "lines": [
            {
                "sku": "ONBOARDING",
                "name": "Implementation",
                "unit_price": "2500.00",
                "quantity": 8,
                "line_total": "20000.00",
            }
        ],
        "subtotal": "20000.00",
        "discount_pct": "20",
        "discount_amount": "4000.00",
        "total": "16000.00",
        "approval_required": True,
        "approval_reasons": ["discount_above_15_percent"],
    }


def test_calculate_does_not_require_customer_name() -> None:
    # R5: Preview calculations do not require customer name
    payload = {
        "seats": 10,
        "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": "0",
        "annual_commitment": False,
    }
    response = client.post("/api/quotes/calculate", json=payload)
    assert response.status_code == 200


def test_calculate_accepts_discount_as_number_and_string() -> None:
    # R5: Number and numeric string inputs for discount produce identical JSON output
    base_payload = {
        "seats": 10,
        "lines": [{"sku": "AGENT-CORE", "quantity": 1}],
        "annual_commitment": False,
    }
    res_num = client.post("/api/quotes/calculate", json={**base_payload, "discount_pct": 10.5})
    res_str = client.post("/api/quotes/calculate", json={**base_payload, "discount_pct": "10.5"})
    assert res_num.status_code == 200
    assert res_str.status_code == 200
    assert res_num.json() == res_str.json()


def test_malformed_json_uses_envelope() -> None:
    # RequestValidationError on malformed JSON payload must return standard 422 envelope
    response = client.post(
        "/api/quotes/calculate",
        content="{bad json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json() == {
        "errors": [
            {
                "code": "malformed_request",
                "field": None,
                "message": "The request could not be read. Send a JSON object with seats, lines, discount_pct and annual_commitment.",
            }
        ]
    }


def test_non_object_body_uses_envelope() -> None:
    # RequestValidationError on non-object JSON body must return standard 422 envelope
    response = client.post(
        "/api/quotes/calculate",
        content="[]",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json() == {
        "errors": [
            {
                "code": "malformed_request",
                "field": None,
                "message": "The request could not be read. Send a JSON object with seats, lines, discount_pct and annual_commitment.",
            }
        ]
    }


def test_unknown_route_uses_envelope() -> None:
    # Starlette 404 handler returns formatted not_found envelope
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.json() == {
        "errors": [
            {
                "code": "not_found",
                "field": None,
                "message": "That address does not exist.",
            }
        ]
    }


def test_wrong_method_uses_envelope() -> None:
    # Starlette 405 handler returns formatted method_not_allowed envelope
    response = client.get("/api/quotes/calculate")
    assert response.status_code == 405
    assert response.json() == {
        "errors": [
            {
                "code": "method_not_allowed",
                "field": None,
                "message": "That method is not allowed here.",
            }
        ]
    }


def test_server_error_hides_details(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    # Unhandled exceptions return 500 internal_error envelope without exposing stack traces
    bad_catalog = tmp_path / "broken_catalog.json"
    bad_catalog.write_text("{not valid json", encoding="utf-8")
    monkeypatch.setenv("CATALOG_PATH", str(bad_catalog))

    isolated_client = TestClient(app, raise_server_exceptions=False)
    response = isolated_client.get("/api/catalog")
    assert response.status_code == 500
    assert response.json() == {
        "errors": [
            {
                "code": "internal_error",
                "field": None,
                "message": "Something went wrong on our side. Please try again.",
            }
        ]
    }
    assert "Traceback" not in response.text
    assert str(bad_catalog) not in response.text


def test_cors_preflight_for_calculate() -> None:
    # CORS preflight options request on calculate endpoint must permit configured origin
    headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    response = client.options("/api/quotes/calculate", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
