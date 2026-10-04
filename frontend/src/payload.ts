// Pure mapping functions to transform raw component form state into typed API request payloads.
// Passes rep inputs directly as typed strings so backend rules handle validation (R5).

import { QuoteDraftPayload, QuoteFormState, SaveQuotePayload } from "./types";

// A subset of QuoteFormState with only the fields the live calculation needs.
// The customer name is excluded so typing it never triggers a re-calculation (R5/UX).
export type DraftFormFields = Pick<
  QuoteFormState,
  "seats" | "lines" | "discountPct" | "annualCommitment" | "customerRequestedDiscountPct"
>;

// Accept DraftFormFields so useCalculate can call this without a customer name.
// QuoteFormState satisfies DraftFormFields (it has all four fields), so toSavePayload still works.
export function toDraftPayload(form: DraftFormFields): QuoteDraftPayload {
  // Map form state to calculate payload without parsing or trimming numeric fields
  const payload: QuoteDraftPayload = {
    seats: form.seats,
    lines: form.lines.map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
    })),
    discount_pct: form.discountPct,
    annual_commitment: form.annualCommitment,
  };
  if (form.customerRequestedDiscountPct && form.customerRequestedDiscountPct.trim() !== "") {
    payload.customer_requested_discount_pct = form.customerRequestedDiscountPct.trim();
  }
  return payload;
}

export function toSavePayload(form: QuoteFormState): SaveQuotePayload {
  // Map form state to save payload, attaching customer_name for quote creation (R6)
  return {
    ...toDraftPayload(form),
    customer_name: form.customerName,
  };
}
