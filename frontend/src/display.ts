// Pure string-formatting helpers for values that the API already calculated.
// There is NO arithmetic in this file — the browser formats strings the API returned (R3).

import type { ApprovalReason, ApprovalRules, Money, Percent, Tier } from "./types";

// Insert commas every three digits in the whole-number part of a money string.
// "20000" -> "20,000". Uses a regex replace, not numeric parsing.
function insertCommas(whole: string): string {
  // Walk right to left, inserting a comma every 3 digits.
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Format a Money string for display.
// USD and CAD get a "$" prefix; every other currency gets the code and a space.
// Example: formatMoney("20000.00", "USD") -> "$20,000.00"
// Example: formatMoney("1000.00", "EUR") -> "EUR 1,000.00"
// No numeric casts or arithmetic formatting APIs — just string splitting and regex (R3).
export function formatMoney(amount: Money, currency: string): string {
  const [whole, cents] = amount.split(".");
  const formatted = insertCommas(whole) + (cents !== undefined ? "." + cents : "");
  if (currency === "USD" || currency === "CAD") {
    return "$" + formatted;
  }
  return currency + " " + formatted;
}

// Format a Percent string for display.
// Example: formatPercent("20") -> "20%"
export function formatPercent(value: Percent): string {
  return value + "%";
}

// Describe a pricing tier in plain English for the seats help text.
// Example: "GROWTH: 10-49 seats, up to 20% discount"
// Example: "ENTERPRISE: 50+ seats, up to 30% discount"
// max_seats is null for the open-ended top tier (the API already converts 99999 to null).
export function describeTier(tier: Tier): string {
  const range =
    tier.max_seats === null
      ? tier.min_seats + "+ seats"
      : tier.min_seats + "-" + tier.max_seats + " seats";
  return tier.code + ": " + range + ", up to " + formatPercent(tier.max_discount_pct) + " discount";
}

// Describe one approval reason in a sentence for the preview panel.
// Thresholds come from the API so the browser never repeats a business rule (R4).
// The switch is exhaustive with NO default branch — a new reason causes a TypeScript error.
export function describeReason(
  reason: ApprovalReason,
  rules: ApprovalRules,
  currency: string,
): string {
  switch (reason) {
    case "discount_above_15_percent":
      return "Discount is above " + formatPercent(rules.discount_above_pct);
    case "total_above_25000":
      return "Total is above " + formatMoney(rules.total_above, currency);
    case "annual_commitment_discount_above_10_percent":
      return (
        "Annual commitment with a discount above " +
        formatPercent(rules.annual_commitment_discount_above_pct)
      );
  }
}
