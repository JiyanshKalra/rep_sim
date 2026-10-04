// Unsaved quote builder draft storage with shape validation.
// Persists draft state in browser localStorage across page refreshes.

import type { LineFormState, QuoteFormState } from "./types";

// Storage key for unsaved quote builder drafts.
// Bump the version if the stored shape changes, so old drafts are ignored.
export const DRAFT_STORAGE_KEY = "dealdesk:draft:v1";

// This is the single definition of the empty form, kept here so the storage code
// can compare against it without importing a component.
export function initialForm(): QuoteFormState {
  return {
    customerName: "",
    seats: "",
    lines: [],
    discountPct: "0",
    annualCommitment: false,
    customerRequestedDiscountPct: "",
  };
}

// Hand-written type guards verifying each field and type without any or type assertions.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLineFormState(value: unknown): value is LineFormState {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.sku === "string" &&
    typeof value.quantity === "string"
  );
}

export function isFormState(value: unknown): value is QuoteFormState {
  if (!isRecord(value)) return false;
  if (
    typeof value.customerName !== "string" ||
    typeof value.seats !== "string" ||
    !Array.isArray(value.lines) ||
    typeof value.discountPct !== "string" ||
    typeof value.annualCommitment !== "boolean"
  ) {
    return false;
  }
  if (
    "customerRequestedDiscountPct" in value &&
    typeof value.customerRequestedDiscountPct !== "string"
  ) {
    return false;
  }
  return value.lines.every(isLineFormState);
}

// Reads the draft key from localStorage and validates its shape.
// Returns null if the key is absent, corrupted, or does not match QuoteFormState.
export function loadDraft(): QuoteFormState | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isFormState(parsed)) return null;
    return parsed;
  } catch {
    // Storage can be blocked by the browser or JSON may be malformed; never throw.
    return null;
  }
}

// Saves the draft to localStorage. If the form equals the initial empty state,
// removes the key to avoid storing unnecessary empty entries.
export function saveDraft(form: QuoteFormState): void {
  try {
    if (JSON.stringify(form) === JSON.stringify(initialForm())) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
  } catch {
    // Failures ignored silently: draft persistence is a convenience, not core data.
  }
}

// Clears the draft key from localStorage; never throws.
export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage access might fail in restricted environments; ignore safely.
  }
}
