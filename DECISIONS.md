# Design Decisions

## 1. Decisions required by the assignment
1. Same product added twice: rejected by the backend with code `sku_duplicate` (422) at `lines[i].sku`; the UI hides already-added SKUs. Price is fixed per SKU, so one line with a bigger quantity covers every legitimate case.
2. 0% discount: always the number 0, never omitted or null. Stable response shape; "no discount" is an explicit choice.
3. Money and rounding: Python Decimal end to end; catalog loaded with parse_float=Decimal. Only discount_amount is rounded, to 2 places, ROUND_HALF_UP. total = subtotal - discount_amount, so numbers always add up. Never float, never round(). Money is serialized as decimal strings with 2 places ("12000.00"). This differs from the assignment's example response, which shows numbers; field names are unchanged.
4. Annual commitment: affects approval only, not price or discount limits. The assignment defines no price effect and inventing one would be a guess.
5. Product removed from catalog after saving: the saved quote stores a snapshot of each line and of the calculated result and is returned as stored, never recalculated. Each line carries a read-time catalog_status: ok, removed or price_changed, shown as a warning on the review page.
6. Where business rules live: only in backend/app/rules.py. GET /api/catalog exposes tiers and approval thresholds for UI hints. The frontend does no money arithmetic and renders what /calculate returns.
7. Status transitions: draft -> submitted, submitted -> approved, submitted -> rejected. approved and rejected are terminal. Anything else returns 409 `invalid_transition` naming the current status and allowed next states.

## 2. Additional decisions and assumptions
One line each: any submitted quote can be approved or rejected whether or not approval_required is true (product question; no auth); saved quotes are immutable except status and updated_at; calculate does not require a customer name but save does; max_seats 99999 in the catalog is treated as an open-ended sentinel for "50+" with a sanity cap of 1,000,000 seats; discount accepts up to 2 decimals; quantity must be an integer from 1 to 10,000 (these caps are our own sanity limits, not business rules); persistence is a JSON file written atomically under a lock, single-process only.

## 3. What I noticed
- The assignment's example response (subtotal 12000, discount 1800 = exactly 15%, reason discount_above_15_percent) contradicts the written rule "discount above 15%". Decision: follow the written rule with strict ">"; at exactly 15% no approval is required. Question for the Deal Desk owner.
- The example shows money as numbers; we return strings (see 1.3).
- catalog max_seats 99999 is a sentinel for "50+".
- A discount above the tier maximum is a validation error, not an approval case.
- Seats do not multiply price; ONBOARDING is a flat per-unit line.
- A status-change endpoint is not in the assignment's list; PATCH /api/quotes/{id}/status was added because the review workflow needs it.
- "Explain pricing" (SHOULD BUILD B) was intentionally skipped.

## 4. Log (newest last)
- Repo foundation created: gitignore, env example, README and DECISIONS skeletons.

## 5. AI usage
TODO

## 6. Limitations
TODO

## 7. What I would do with another day
TODO
