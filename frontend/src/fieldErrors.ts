// Utility functions to route API error items to the right field or a catch-all.
// The API returns all errors at once (R5); these helpers distribute them across the UI.

import type { ApiErrorItem } from "./types";

// Return the messages for errors whose field exactly matches `field`.
export function messagesFor(errors: ApiErrorItem[], field: string): string[] {
  return errors.filter((e) => e.field === field).map((e) => e.message);
}

// All field paths that have a dedicated FieldErrors element in the form,
// including one entry per line index for sku and quantity.
// Used to identify which errors have already been shown next to their input.
export function placedFieldNames(lineCount: number): string[] {
  const base = ["customer_name", "seats", "lines", "discount_pct", "annual_commitment"];
  const lineFields: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    lineFields.push("lines[" + i + "].sku");
    lineFields.push("lines[" + i + "].quantity");
  }
  return base.concat(lineFields);
}

// Return messages for errors that have no field or whose field is not in placedFields.
// These are shown in the global problems box so nothing gets lost.
export function unplacedMessages(errors: ApiErrorItem[], placedFields: string[]): string[] {
  return errors
    .filter((e) => e.field === null || !placedFields.includes(e.field))
    .map((e) => e.message);
}
