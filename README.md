# Deal Desk Quote Simulator

Interactive quote calculator and approval simulator for enterprise sales deals.

## Requirements

- Python 3.11+
- Node 24

## Quick Start

1. Backend:
   ```bash
   cd backend
   python -m venv .venv
   # Windows PowerShell:  .venv\Scripts\Activate.ps1
   # macOS/Linux:         source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

2. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open http://localhost:3000

*(commands become valid as the backend and frontend are added)*

## Tests

- **Backend**: Pytest suite in `backend/tests/` covering unit rules R1–R7 (`test_rules.py`), FastAPI routes and validation (`test_api.py`), deterministic calculation cases, and status transitions.
- **Frontend**: Vitest suite in `frontend/src/` covering pure string-formatting helpers (`src/display.test.ts`) and error-routing helpers (`src/fieldErrors.test.ts`).

To run tests and linters:
```bash
# Backend tests & lint
cd backend
pytest
ruff check .

# Frontend tests, lint & typecheck
cd frontend
npm test
npm run lint
npm run typecheck
```

## API

FastAPI endpoints provided by the backend (details in `DECISIONS.md`):

- `GET /api/catalog` – Fetch products, discount tiers, and approval threshold metadata.
- `POST /api/quotes/calculate` – Validate line items/discounts and return computed breakdown and approval reasons without saving.
- `POST /api/quotes` – Save a validated quote draft (requires `customer_name`).
- `GET /api/quotes` – List all saved quotes.
- `GET /api/quotes/{id}` – Fetch snapshot of a saved quote by ID.
- `PATCH /api/quotes/{id}/status` – Transition status (`draft` -> `submitted` -> `approved` / `rejected`).

## Business rules

All business logic is isolated in `backend/app/rules.py` (see `docs/BUSINESS_RULES.md` for the complete specification):

- **R1 (Tiers)**: Seat-based tiers (`STARTER` 1–9, `GROWTH` 10–49, `ENTERPRISE` 50+).
- **R2 (Discount Cap)**: Maximum discount percentage enforced per tier; exceeding cap is a validation error.
- **R3 (Pricing & Rounding)**: Line totals and subtotal use Decimal. discount_amount is rounded to 2 decimal places using ROUND_HALF_UP. total = subtotal - discount_amount. Money is serialized as 2-decimal strings.
- **R4 (Approvals)**: Strict `>` triggers (discount > 15%, total > $25,000, or annual commitment with discount > 10%).
- **R5 (Validation)**: Complete error envelopes returned across all fields simultaneously.
- **R6 & R7 (Snapshots & Lifecycle)**: Immutable line-item pricing snapshots upon creation; explicit state machine governing status progression.

## Design decisions

Key architecture highlights (see `DECISIONS.md` for full rationale):

- **Single Calculation Authority**: All calculations and validation occur exclusively on the backend; the frontend never calculates totals or approval triggers.
- **Precision First**: Strict `Decimal` arithmetic end-to-end to eliminate IEEE-754 floating-point inaccuracies.
- **Quote Immutability**: Quotes capture point-in-time snapshots with catalog status warnings on review rather than automatic recalculations.
- **Explicit State Transitions**: Enforced state transitions with deterministic error codes.

## Known limitations

- **Storage**: Quotes are persisted in a single local JSON file (`backend/data/quotes.json`) with file-level locking; single-process only.
- **Authentication**: No authentication or user roles; quote submission and approval actions are open.
- **Catalog Management**: Product catalog is static; price changes do not retroactively alter saved quotes.
