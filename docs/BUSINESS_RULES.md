# Business Rules (R1 to R7)

This is the source of truth for the calculation and its tests. Tests and code
comments cite these IDs. The only implementation of these rules is
backend/app/rules.py.

## Terms
- Quote draft: customer_name (needed only to save), seats, lines
  [{sku, quantity}], discount_pct, annual_commitment (true/false).
- Money: Decimal with 2 places. In JSON it is a string, for example "12000.00".
- Percent: Decimal with at most 2 decimals. In JSON responses it is a normalized
  string: "20", "10.01", "0".

## R1 Tier from seats
Tiers are read from catalog.json discount_rules, sorted by min_seats. The tier is
the rule whose range contains the seat count. The highest tier is open-ended: its
catalog value max_seats 99999 is a sentinel for "50+", so 100000 seats is still
ENTERPRISE. Seats do not change prices.
Tiers today: STARTER 1-9 (max 10%), GROWTH 10-49 (max 20%), ENTERPRISE 50+ (max 30%).

## R2 Discount cap
0 <= discount_pct <= the tier's max_discount_pct. Going above the cap is a
validation error (discount_exceeds_tier_max), not an approval case. The quote
cannot be calculated or saved. This check is skipped when seats are invalid,
because the tier is unknown.

## R3 Pricing and rounding
- line_total = quantity x unit_price
- subtotal = sum of line_total
- discount_amount = round_half_up(subtotal x discount_pct / 100, 2 places)
- total = subtotal - discount_amount
Only discount_amount is rounded, and total is obtained by subtraction, so the
numbers always add up. Decimal only, never float, never Python round().
Example: 150 at 10.03% gives 15.045, which rounds to 15.05 (banker's rounding
would wrongly give 15.04). Annual commitment does not change any price.

## R4 Approval (every comparison is strict ">")
approval_reasons is a list. Each reason is checked independently, and the list is
always built in this order:
1. discount_above_15_percent: discount_pct > 15
2. total_above_25000: total > 25000 (the total after discount)
3. annual_commitment_discount_above_10_percent: annual_commitment is true AND
   discount_pct > 10
approval_required is true when the list is not empty. The percentage is compared
as entered, never recomputed from amounts. Exactly 15%, exactly $25,000.00 and
exactly 10% with annual commitment do NOT need approval.

## R5 Validation
All errors are returned together (not just the first), in this order: seats,
lines (per line: sku, then quantity), discount_pct.
- Integer fields (seats, quantity) accept a JSON integer or a string of digits
  with an optional leading minus (surrounding spaces ignored). Booleans, null,
  empty strings, decimals and text give seats_not_integer / quantity_not_integer.
- seats: integer from 1 to 1,000,000, else seats_out_of_range. (1,000,000 is our
  own sanity limit, not a business rule.)
- lines: at least one, else lines_empty (field "lines").
- Each line: sku must exist in the catalog (sku_unknown), a SKU may appear only
  once (sku_duplicate, reported on the second occurrence), quantity is an integer
  from 1 to 10,000 (quantity_out_of_range). (10,000 is our own sanity limit.)
- discount_pct: a JSON number or a string like "10", "10.5", "-5" (surrounding
  spaces ignored), else discount_not_number. Null, booleans, "abc", "NaN" and
  "1e1" are not numbers. Negative gives discount_negative. More than 2 decimals
  gives discount_too_many_decimals ("10.500" is fine, "10.001" is not). Above the
  tier cap gives discount_exceeds_tier_max (R2).
- Errors carry a field path such as seats, lines[0].quantity, lines[1].sku,
  discount_pct, customer_name.
- Calculate does not require a customer name, so the preview does not nag while
  the rep is still typing.

## R6 Saving
Saving applies R5 and also requires customer_name: trimmed, not empty
(customer_name_required), at most 120 characters (customer_name_too_long). A new
quote starts as draft. A saved quote stores a snapshot of its lines (sku, name,
unit price, quantity, line total) and of the calculated result. It is never
recalculated when read. Only its status can change afterwards.

## R7 Status machine
draft -> submitted
submitted -> approved
submitted -> rejected
approved and rejected are terminal. Every other change is rejected with
invalid_transition and the message names the current status and the allowed next
statuses. Any submitted quote may be approved or rejected, whether or not
approval_required is true (no roles or login in this version).

## Worked example
50 seats, ONBOARDING x8, 20% discount, no annual commitment:
- R1: 50 seats is ENTERPRISE, cap 30%, so 20% is allowed (R2)
- R3: line_total 20000.00, subtotal 20000.00, discount_amount 4000.00,
  total 16000.00
- R4: 20 > 15, so reason discount_above_15_percent; total 16000.00 is not above
  25000, and there is no annual commitment. Approval is required.
