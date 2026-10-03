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


class QuoteNotFoundError(Exception):
    """Raised when a quote lookup fails to find the requested quote ID."""


def _read_quotes_file(path: Path) -> dict[str, dict[str, Any]]:
    # If the storage file does not exist, return an empty dictionary
    if not path.exists():
        return {}
    # A corrupt file must raise so a later save can never overwrite good data with an empty file
    return json.loads(path.read_text(encoding="utf-8"))


def _write_quotes_file(path: Path, quotes: dict[str, dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f".tmp.{uuid.uuid4().hex}")
    temp_path.write_text(json.dumps(quotes, indent=2), encoding="utf-8")
    os.replace(temp_path, path)


def create_quote(
    customer_name: str,
    seats: int,
    annual_commitment: bool,
    result: dict[str, Any],
    quotes_path: Path | None = None,
) -> dict[str, Any]:
    """Persist a newly calculated draft quote record under the storage lock (R6)."""
    target_path = quotes_path or get_quotes_path()
    quote_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "id": quote_id,
        "customer_name": customer_name,
        "seats": seats,
        "annual_commitment": annual_commitment,
        "status": rules.INITIAL_STATUS,
        "created_at": now_iso,
        "updated_at": now_iso,
        "result": result,
    }
    with _storage_lock:
        quotes = _read_quotes_file(target_path)
        quotes[quote_id] = record
        _write_quotes_file(target_path, quotes)
    return record


def get_quote(quote_id: str, quotes_path: Path | None = None) -> dict[str, Any]:
    """Retrieve a saved quote record by its ID or raise QuoteNotFoundError."""
    target_path = quotes_path or get_quotes_path()
    with _storage_lock:
        quotes = _read_quotes_file(target_path)
        quote = quotes.get(quote_id)
        if quote is None:
            raise QuoteNotFoundError(f"Quote {quote_id} not found.")
        return quote


def list_quotes(quotes_path: Path | None = None) -> list[dict[str, Any]]:
    """Return all saved quotes newest first based on reverse insertion order."""
    target_path = quotes_path or get_quotes_path()
    with _storage_lock:
        quotes = _read_quotes_file(target_path)

    # Reverse dict values so newest created quotes appear first without timestamp collision issues
    return list(reversed(quotes.values()))


def update_quote_status(
    quote_id: str,
    new_status: str,
    quotes_path: Path | None = None,
) -> dict[str, Any]:
    """Validate and transition quote status under storage lock or raise on error (R7)."""
    target_path = quotes_path or get_quotes_path()
    with _storage_lock:
        quotes = _read_quotes_file(target_path)
        quote = quotes.get(quote_id)
        if quote is None:
            raise QuoteNotFoundError(f"Quote {quote_id} not found.")

        current_status = quote["status"]
        rules.check_transition(current_status, new_status)

        quote["status"] = new_status
        quote["updated_at"] = datetime.now(timezone.utc).isoformat()
        quotes[quote_id] = quote
        _write_quotes_file(target_path, quotes)
        return quote
