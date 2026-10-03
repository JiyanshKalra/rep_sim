# Design Decisions

## 1. Decisions required by the assignment

1. **Same product added twice**:
   - *Decision*: Rejected by the backend with 422 error code `sku_duplicate` at field path `lines[i].sku`. The frontend builder dropdown also hides already-added SKUs.
   - *Why*: Product unit prices are fixed per SKU. Merging duplicate lines silently could mask sales rep typos, while allowing separate identical lines creates ambiguity in quote presentation. One line with an adjusted quantity covers every legitimate scenario.
   - *Trade-off*: Reps cannot split a product across separate lines (for example, allocating seats across departments).
   - *Where it lives*: `backend/app/rules.py` in `_validate_lines`.

2. **0% discount**:
   - *Decision*: Always formatted as the number `0` (serialized as string `"0"`), never omitted or null.
   - *Why*: Provides a stable, predictable response schema. No discount is an explicit business choice rather than an unstated default.
   - *Trade-off*: Clients must handle the explicit "0" string rather than treating absence as zero, but null checks are eliminated.
   - *Where it lives*: `backend/app/rules.py` in `_parse_discount`, `_validate_discount`, and `format_percent`.

3. **Money and rounding**:
   - *Decision*: Python Decimal end-to-end; catalog loaded with parse_float=Decimal. Line totals and subtotal are unrounded Decimal values. Only discount_amount is rounded to 2 decimal places using ROUND_HALF_UP. total = subtotal - discount_amount. Money is serialized as 2-decimal strings (for example, "12000.00").
   - *Why*: Eliminates IEEE-754 binary floating-point errors (such as 0.1 + 0.2 != 0.3). Computing total by subtraction guarantees that subtotal - discount_amount = total exactly with zero penny discrepancies. Python round() uses bankers rounding, which would round half to even.
   - *Trade-off*: Differs from the numeric example JSON in the assignment prompt (strings prevent JavaScript precision degradation during JSON.parse).
   - *Where it lives*: `backend/app/rules.py` in `calculate`, `format_money`, and `load_catalog`.

4. **Annual commitment pricing**:
   - *Decision*: Annual commitment is a boolean that affects approval only (triggers deal desk approval when discount_pct > 10%). It does not alter unit pricing, subtotal, or tier discount caps.
   - *Why*: The assignment specifies approval rules for annual commitment but defines no price effect; inventing a discount formula would be an unverified guess.
   - *Trade-off*: Customers committing annually do not automatically receive a cheaper price unless the rep enters an approved discount.
   - *Where it lives*: `backend/app/rules.py` in `_find_approval_reasons` and `calculate`.

5. **Product removed from catalog after saving**:
   - *Decision*: Saved quotes store an immutable point-in-time snapshot of lines (sku, name, unit price, quantity, line total) and calculated totals. A saved quote is returned as stored and is never recalculated. Each line carries a read-time catalog_status ("ok", "removed", "price_changed"), displayed as a warning badge on the review page.
   - *Why*: Quotes are commercial records; historical customer commitments must remain fixed even if the catalog changes.
   - *Trade-off*: If a product is retired or re-priced, historical quotes do not reflect modern prices, requiring explicit warning flags.
   - *Where it lives*: `backend/app/rules.py` in `line_catalog_status`, and `backend/app/storage.py` in `create_quote` and `get_quote`.

6. **Where business rules live**:
   - *Decision*: All business logic, validation, tiers, rounding, and approval rules live solely in `backend/app/rules.py`. GET /api/catalog exposes tiers and approval thresholds for UI hints, but the frontend performs no money arithmetic and renders what /api/quotes/calculate returns.
   - *Why*: A single source of truth prevents frontend/backend calculation divergence and ensures any API consumer obeys identical rules.
   - *Trade-off*: Every price calculation or preview requires a roundtrip request to /api/quotes/calculate.
   - *Where it lives*: `backend/app/rules.py` (authoritative implementation) and `backend/app/main.py`.

7. **Allowed status transitions**:
   - *Decision*: Explicit state machine: draft -> submitted, submitted -> approved, submitted -> rejected. approved and rejected are terminal states. Any other transition returns 409 invalid_transition stating the current status and allowed next states.
   - *Why*: Enforces business process integrity and prevents accidental modification of finalized or rejected quotes.
   - *Trade-off*: Once approved or rejected, a quote cannot be reopened or edited; the sales rep must create a new quote draft.
   - *Where it lives*: `backend/app/rules.py` in `STATUS_TRANSITIONS`, `allowed_next_statuses`, and `check_transition`.

## 2. Additional decisions and assumptions

- Any submitted quote can be approved or rejected whether or not approval_required is true (business policy decision in absence of user roles).
- Saved quotes are immutable except for status and updated_at timestamps.
- Calculate does not require a customer name (so typing in the builder is uninterrupted), but saving does.
- Catalog max_seats: 99999 for ENTERPRISE is an open-ended sentinel for "50+", with an application sanity limit of 1,000,000 seats.
- Quantity must be an integer from 1 to 10,000 (sanity boundary).
- Discount percentage accepts up to 2 decimal places.
- Persistence is a single local JSON file written atomically under a file lock (single-process only).

## 3. What I noticed

- The assignment example response (subtotal 12,000, discount 1,800 = exactly 15%, reason discount_above_15_percent) contradicts its written rule "discount above 15%". I followed the written rule with strict >: at exactly 15%, no approval is required.
- The example shows money as numbers; we return decimal strings to prevent client-side floating-point issues.
- Catalog max_seats: 99999 is a sentinel for "50+".
- A discount above the tier maximum is a 422 validation error (discount_exceeds_tier_max), not an approval case; invalid quotes cannot be calculated or saved.
- Seats do not multiply prices; ONBOARDING is a flat per-unit line item.
- A status-change endpoint is not in the assignment endpoint list; PATCH /api/quotes/{id}/status was added because the review page needs it.
- 49 seats at 20% discount is GROWTH tier and requires deal desk approval because 20% is strictly above 15% (an easy boundary case to mislabel as valid without approval).
- Explain pricing (SHOULD BUILD B) and Scenario comparison (SHOULD BUILD A) were implemented end-to-end with deterministic backend logic and dedicated UI components.

## 4. Testing approach

- **What is covered and why**:
  - Backend pytest suite (237 passed across 5 test files): covers rules R1–R7, input parsing, error envelope conformity, FastAPI status codes, deterministic pricing explanations, health checks, and seat/discount boundaries (9/10, 49/50 seats; 10%, 15%, 20%, 30% discounts; exact $25,000.00 total).
  - Test cases in `backend/tests/cases.json` are golden fixtures checked independently with Decimal and never relaxed.
  - Frontend unit tests in Vitest cover pure helper modules (51 passed across 4 test files):
    - `frontend/src/compareLines.test.ts` (10 tests: product diffing, diff tags, quantity/price changes)
    - `frontend/src/fieldErrors.test.ts` (14 tests: mapping API error codes to input fields and form banners)
    - `frontend/src/draftStorage.test.ts` (9 tests: localStorage schema validation and corrupt-draft recovery)
    - `frontend/src/display.test.ts` (18 tests: currency formatting, percentage formatting, status display)
- **What I would test next**:
  - React component interaction tests for `QuoteBuilder.tsx` and `ScenarioComparison.tsx` using React Testing Library.
  - End-to-end browser integration tests with Playwright covering draft creation, save, and review status updates.

## 5. AI usage

AI assistants were used: Claude to plan and review, Google Antigravity coding agent to write code and tests under written task prompts. The business rules and golden test cases were written first (docs/BUSINESS_RULES.md, backend/tests/cases.json) and their expected values were checked independently with Decimal and never edited to make tests pass. A hand-made mutation check of rules.py (34 mutants, 33 caught, the survivor covered by a new test). Problems caught in review: a test file with corrupted assertion keys, a storage layer that swallowed read errors and could overwrite saved quotes, default values that would have shown a fake 0.00 total, and an agent that ignored rules (an amend, an unrequested script, edits to files it was told not to touch). I read the code and ran the tests myself.

## 6. Known limitations

- **Single process with a file lock**: Quotes are persisted in a local JSON file (`backend/data/quotes.json`) under a file lock; cannot support concurrent worker processes or horizontal scaling.
- **No login or roles**: The application does not implement authentication or role-based access control; any user can submit, approve, or reject quotes.
- **Static catalog**: Product catalog is loaded from a static file; catalog modifications do not retroactively alter saved quote records (flagged via read-time catalog_status instead).
- **UTC timestamps**: All quote timestamps are recorded in UTC without client timezone localization.
- **API client trusts the success body**: The frontend API client trusts 2xx JSON responses match TypeScript types without runtime schema decoding.
- **Frontend tests cover helpers only**: Vitest suite covers pure data transformations and error routing; no DOM or browser integration tests.

## 7. What I would do with another day

- A real database with proper transactions instead of the JSON file (PostgreSQL with SQLAlchemy and Alembic migrations)
- Login and roles so only an approver can approve (separate sales rep and deal desk permissions)
- A status history (audit log tracking timestamps and actors for each transition)
- Component and browser end-to-end tests (React Testing Library and Playwright)
- Paging and search on the quotes list (server-side pagination, customer search, status filtering)
- Docker Compose (multi-container setup for one-command backend and frontend launch)

## 8. Log (newest last)

- Repo foundation created: gitignore, env example, README and DECISIONS skeletons.
- Wrote BUSINESS_RULES R1-R7 and golden cases. Added input-parsing rules: integers and discounts accept numeric strings so the form can send what the rep typed and the API is the only validator. Approval reasons are always listed in a fixed order.
- Implemented Vitest setup and comprehensive frontend unit tests for display and field error helpers.
- Styled frontend with clean, responsive design tokens, layout hierarchy, and status workflow presentation.
- Implemented draft persistence and recovery in localStorage with shape validation.
- Implemented deterministic pricing explanation in backend (`app/explain.py`), exposing plain-English breakdown on calculation and saved quote responses, and rendered via `ExplanationPanel` on preview and review.
- Implemented pure product comparison helper (`src/compareLines.ts`) and Scenario B side-by-side comparison in `ScenarioComparison.tsx`.
- Conducted full-fidelity QA audit: added duplicate submit guard on quote creation, comparison row diff text tags, table horizontal scroll support on narrow viewports, and normalized all repo files to LF without BOM.
