// Pure mapping functions to transform raw component form state into typed API request payloads.
// Passes rep inputs directly as typed strings so backend rules handle validation (R5).

import { QuoteDraftPayload, QuoteFormState, SaveQuotePayload } from "./types";

export function toDraftPayload(form: QuoteFormState): QuoteDraftPayload {
  // Map form state to calculate payload without parsing or trimming numeric fields
  return {
    seats: form.seats,
    lines: form.lines.map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
    })),
    discount_pct: form.discountPct,
    annual_commitment: form.annualCommitment,
  };
}

export function toSavePayload(form: QuoteFormState): SaveQuotePayload {
  // Map form state to save payload, attaching customer_name for quote creation (R6)
  return {
    ...toDraftPayload(form),
    customer_name: form.customerName,
  };
}
