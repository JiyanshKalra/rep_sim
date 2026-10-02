# Environment settings and resolved file paths.
# Provides default locations resolved relative to the source code tree.

import os
from pathlib import Path


def get_catalog_path() -> Path:
    """Return the absolute path to catalog.json, defaulting to backend/data/catalog.json."""
    custom = os.environ.get("CATALOG_PATH")
    if custom:
        return Path(custom)
    # Resolve from source file location so working directory does not affect path resolution
    backend_dir = Path(__file__).resolve().parent.parent
    return backend_dir / "data" / "catalog.json"


def get_quotes_path() -> Path:
    """Return the absolute path to quotes.json, defaulting to backend/data/quotes.json."""
    custom = os.environ.get("QUOTES_PATH")
    if custom:
        return Path(custom)
    # Resolve from source file location so working directory does not affect path resolution
    backend_dir = Path(__file__).resolve().parent.parent
    return backend_dir / "data" / "quotes.json"


def get_cors_origins() -> list[str]:
    """Return parsed CORS origins list from environment or default local frontend URLs."""
    raw = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    # Split comma-separated string, strip surrounding whitespace, and filter out empty items
    return [origin.strip() for origin in raw.split(",") if origin.strip()]
