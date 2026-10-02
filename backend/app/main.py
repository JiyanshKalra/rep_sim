# Main FastAPI application definition and HTTP routing.
# Configures CORS middleware and basic service health endpoints.

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_cors_origins

app = FastAPI(title="Deal Desk Quote Simulator API")

# Explicit CORS configuration restricting origins to configured frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    """Health check endpoint to verify the service is running."""
    return {"status": "ok"}
