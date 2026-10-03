#!/usr/bin/env python3
"""End-to-end smoke tests against a live running Deal Desk backend.

Covers:
  1. Health check (GET /api/health)
  2. Catalog retrieval (GET /api/catalog)
  3. Quote calculation (POST /api/quotes/calculate)
  4. Quote creation & persistence (POST /api/quotes)
  5. Quote listing (GET /api/quotes)
  6. Quote detail with line freshness (GET /api/quotes/{id})
  7. Status transition to submitted (PATCH /api/quotes/{id}/status)
  8. Status transition to approved (PATCH /api/quotes/{id}/status)
  9. Invalid transition rejection (PATCH /api/quotes/{id}/status -> 409)
"""

import json
import os
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE_URL = os.environ.get("API_URL", "http://127.0.0.1:8000").rstrip("/")


def _request(method: str, path: str, data: dict | None = None) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}"
    headers = {"Accept": "application/json"}
    body_bytes = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        body_bytes = json.dumps(data).encode("utf-8")

    req = Request(url, data=body_bytes, headers=headers, method=method)
    try:
        with urlopen(req) as resp:
            status = resp.status
            content = json.loads(resp.read().decode("utf-8"))
            return status, content
    except HTTPError as e:
        content = json.loads(e.read().decode("utf-8"))
        return e.code, content


def run_smoke_tests() -> None:
    print(f"Connecting to live backend at {BASE_URL}...")

    # 1. Health
    status, body = _request("GET", "/api/health")
    assert status == 200 and body.get("status") == "ok", f"Health failed: {status} {body}"
    print("  [OK] 1. GET /api/health -> 200 ok")

    # 2. Catalog
    status, body = _request("GET", "/api/catalog")
    assert status == 200 and len(body.get("products", [])) > 0, f"Catalog failed: {status} {body}"
    print(f"  [OK] 2. GET /api/catalog -> 200 ({len(body['products'])} products, {len(body['tiers'])} tiers)")

    # 3. Calculate
    calc_payload = {
        "seats": 50,
        "lines": [{"sku": "ONBOARDING", "quantity": 8}],
        "discount_pct": "20",
        "annual_commitment": False,
    }
    status, body = _request("POST", "/api/quotes/calculate", calc_payload)
    assert status == 200 and body.get("total") == "16000.00", f"Calculate failed: {status} {body}"
    assert body.get("approval_required") is True
    print(f"  [OK] 3. POST /api/quotes/calculate -> 200 (total: {body['total']}, approval: {body['approval_required']})")

    # 4. Save Quote
    save_payload = {
        "customer_name": "Smoke Test Corp",
        "seats": 50,
        "lines": [{"sku": "ONBOARDING", "quantity": 8}],
        "discount_pct": "20",
        "annual_commitment": False,
    }
    status, body = _request("POST", "/api/quotes", save_payload)
    assert status == 201 and "id" in body, f"Save quote failed: {status} {body}"
    quote_id = body["id"]
    assert body.get("status") == "draft"
    print(f"  [OK] 4. POST /api/quotes -> 201 (id: {quote_id}, status: {body['status']})")

    # 5. List Quotes
    status, body = _request("GET", "/api/quotes")
    assert status == 200 and any(q.get("id") == quote_id for q in body), f"List quotes failed: {status} {body}"
    print(f"  [OK] 5. GET /api/quotes -> 200 (found quote in {len(body)} quotes)")

    # 6. Get Quote Detail
    status, body = _request("GET", f"/api/quotes/{quote_id}")
    assert status == 200 and body.get("customer_name") == "Smoke Test Corp", f"Get quote failed: {status} {body}"
    assert body["lines"][0]["catalog_status"] == "ok"
    print(f"  [OK] 6. GET /api/quotes/{quote_id} -> 200 (customer: {body['customer_name']})")

    # 7. Submit Quote
    status, body = _request("PATCH", f"/api/quotes/{quote_id}/status", {"status": "submitted"})
    assert status == 200 and body.get("status") == "submitted", f"Submit failed: {status} {body}"
    print("  [OK] 7. PATCH /api/quotes/{id}/status -> 200 (draft -> submitted)")

    # 8. Approve Quote
    status, body = _request("PATCH", f"/api/quotes/{quote_id}/status", {"status": "approved"})
    assert status == 200 and body.get("status") == "approved", f"Approve failed: {status} {body}"
    print("  [OK] 8. PATCH /api/quotes/{id}/status -> 200 (submitted -> approved)")

    # 9. Invalid Transition (Terminal)
    status, body = _request("PATCH", f"/api/quotes/{quote_id}/status", {"status": "draft"})
    assert status == 409 and body.get("errors", [{}])[0].get("code") == "invalid_transition", f"409 check failed: {status} {body}"
    print(f"  [OK] 9. PATCH /api/quotes/{id}/status -> 409 invalid_transition ({body['errors'][0]['message']})")

    print("\nAll smoke tests passed successfully!")


if __name__ == "__main__":
    try:
        run_smoke_tests()
    except Exception as err:
        print(f"\nSmoke test error: {err}", file=sys.stderr)
        sys.exit(1)
