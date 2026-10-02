# Health check and environment configuration tests.
# Validates endpoint availability, CORS policies, and configuration path resolution.

import pytest
from fastapi.testclient import TestClient

from app.config import get_catalog_path, get_cors_origins
from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    # Service health endpoint must return 200 and standard status dictionary
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_allows_the_frontend_origin() -> None:
    # Configured frontend origin must be permitted via access-control-allow-origin header
    response = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_does_not_allow_other_origins() -> None:
    # Unlisted third-party origins must not receive allow-origin header
    response = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_config_defaults_do_not_depend_on_working_directory() -> None:
    # Catalog path resolution must point to backend/data/catalog.json and exist on disk
    catalog_path = get_catalog_path()
    normalized_path = str(catalog_path).replace("\\", "/")
    assert normalized_path.endswith("backend/data/catalog.json")
    assert catalog_path.exists()
    # Default CORS origins must contain exactly two development URLs
    assert len(get_cors_origins()) == 2


def test_config_cors_origins_parsing(monkeypatch: pytest.MonkeyPatch) -> None:
    # Whitespace and empty entries must be trimmed and filtered from CORS_ORIGINS env
    monkeypatch.setenv("CORS_ORIGINS", " http://a.test , ,http://b.test ")
    assert get_cors_origins() == ["http://a.test", "http://b.test"]
