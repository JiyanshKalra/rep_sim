# JSON-file-based quote storage with thread-safe atomic file writes.
# Implements persistence for saved quotes under QUOTES_PATH lock (R6).

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app import rules
from app.config import get_quotes_path

_storage_lock = threading.Lock()


def _read_quotes_file(path: Path) -> dict[str, dict[str, Any]]:
    # If the storage file does not exist, return an empty dictionary
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
        if isinstance(data, list):
            return {q["id"]: q for q in data if isinstance(q, dict) and "id" in q}
        return {}
    except (json.JSONDecodeError, OSError):
        return {}


def _write_quotes_file(path: Path, quotes: dict[str, dict[str, Any]]) -> None:
    # Ensure parent directory exists before writing temporary file
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f".tmp.{uuid.uuid4().hex}")
    temp_path.write_text(json.dumps(quotes, indent=2), encoding="utf-8")
    # Atomic file replacement ensures no partial writes are read by concurrent readers
    os.replace(temp_path, path)


def save_quote(
    catalog: rules.Catalog,
    draft: rules.ValidDraft,
    result: rules.CalculationResult,
    quotes_path: Path | None = None,
) -> dict[str, Any]:
    """Persist a newly validated and calculated draft quote as a saved snapshot (R6)."""
    target_path = quotes_path or get_quotes_path()
    quote_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    # R6: Snapshot lines and calculation result are immutable once saved
    snapshot_lines = [
        {
            "sku": line.sku,
            "name": line.name,
            "unit_price": rules.format_money(line.unit_price),
            "quantity": line.quantity,
            "line_total": rules.format_money(line.line_total),
        }
        for line in result.lines
    ]

    calc_snapshot = {
        "tier": result.tier.code,
        "max_discount_pct": rules.format_percent(result.tier.max_discount_pct),
        "currency": result.currency,
        "lines": snapshot_lines,
        "subtotal": rules.format_money(result.subtotal),
        "discount_pct": rules.format_percent(result.discount_pct),
        "discount_amount": rules.format_money(result.discount_amount),
        "total": rules.format_money(result.total),
        "approval_required": result.approval_required,
        "approval_reasons": list(result.approval_reasons),
    }

    quote_record = {
        "id": quote_id,
        "customer_name": draft.customer_name,
        "seats": draft.seats,
        "annual_commitment": draft.annual_commitment,
        "status": rules.INITIAL_STATUS,
        "created_at": now_iso,
        "updated_at": now_iso,
        "lines": snapshot_lines,
        "result": calc_snapshot,
    }

    with _storage_lock:
        quotes = _read_quotes_file(target_path)
        quotes[quote_id] = quote_record
        _write_quotes_file(target_path, quotes)

    return quote_record


def get_quote(quote_id: str, quotes_path: Path | None = None) -> dict[str, Any] | None:
    """Retrieve a single saved quote record by its ID."""
    target_path = quotes_path or get_quotes_path()
    with _storage_lock:
        quotes = _read_quotes_file(target_path)
        return quotes.get(quote_id)


def list_quotes(quotes_path: Path | None = None) -> list[dict[str, Any]]:
    """Return all saved quotes sorted newest first by creation timestamp."""
    target_path = quotes_path or get_quotes_path()
    with _storage_lock:
        quotes = _read_quotes_file(target_path)

    # Sort descending by created_at timestamp so newest quotes appear at the top
    items = list(quotes.values())
    items.sort(key=lambda q: q.get("created_at", ""), reverse=True)
    return items


def update_quote_status(
    quote_id: str,
    new_status: str,
    quotes_path: Path | None = None,
) -> dict[str, Any] | None:
    """Validate and transition quote status, raising InvalidTransitionError if disallowed (R7)."""
    target_path = quotes_path or get_quotes_path()
    with _storage_lock:
        quotes = _read_quotes_file(target_path)
        quote = quotes.get(quote_id)
        if quote is None:
            return None

        current_status = quote.get("status", rules.INITIAL_STATUS)
        # R7: Enforce valid status transition graph
        rules.check_transition(current_status, new_status)

        quote["status"] = new_status
        quote["updated_at"] = datetime.now(timezone.utc).isoformat()
        quotes[quote_id] = quote
        _write_quotes_file(target_path, quotes)
        return quote
