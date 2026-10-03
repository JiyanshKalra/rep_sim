# Shared pytest configuration and persistence isolation fixtures.

from collections.abc import Generator
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def isolate_quotes_storage(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> Generator[Path, None, None]:
    """Isolate quotes persistence to a temporary file for every test."""
    temp_quotes_file = tmp_path / "quotes.json"
    monkeypatch.setenv("QUOTES_PATH", str(temp_quotes_file))
    yield temp_quotes_file
