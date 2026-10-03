// Tests for the error-routing helpers in fieldErrors.ts.
// Each test proves one behaviour of messagesFor, placedFieldNames, or unplacedMessages.

import { describe, it, expect } from "vitest";
import { messagesFor, placedFieldNames, unplacedMessages } from "./fieldErrors";
import type { ApiErrorItem } from "./types";

describe("messagesFor", () => {
  it("returns only the messages whose field exactly matches the given path", () => {
    const errors: ApiErrorItem[] = [
      { code: "required", field: "seats", message: "Seats is required." },
      { code: "required", field: "customer_name", message: "Customer name is required." },
    ];
    expect(messagesFor(errors, "seats")).toEqual(["Seats is required."]);
  });

  it("returns an empty array when no error matches the given field", () => {
    const errors: ApiErrorItem[] = [
      { code: "required", field: "seats", message: "Seats is required." },
    ];
    expect(messagesFor(errors, "discount_pct")).toEqual([]);
  });
});

describe("placedFieldNames", () => {
  it("contains all expected top-level and per-line field names for 2 lines", () => {
    const names = placedFieldNames(2);
    expect(names).toContain("customer_name");
    expect(names).toContain("seats");
    expect(names).toContain("lines");
    expect(names).toContain("discount_pct");
    expect(names).toContain("annual_commitment");
    expect(names).toContain("lines[0].sku");
    expect(names).toContain("lines[0].quantity");
    expect(names).toContain("lines[1].sku");
    expect(names).toContain("lines[1].quantity");
  });

  it("has exactly 9 entries for 2 lines (5 base fields + 4 line fields)", () => {
    expect(placedFieldNames(2)).toHaveLength(9);
  });
});

describe("unplacedMessages", () => {
  it("returns the message of an error whose field is null", () => {
    const errors: ApiErrorItem[] = [
      { code: "server_error", field: null, message: "An unexpected error occurred." },
    ];
    const placed = placedFieldNames(2);
    expect(unplacedMessages(errors, placed)).toEqual(["An unexpected error occurred."]);
  });

  it("returns the message of an error whose field is not in the placed list", () => {
    // lines[5].sku is beyond the 2-line form so it is not placed
    const errors: ApiErrorItem[] = [
      { code: "invalid", field: "lines[5].sku", message: "SKU is invalid." },
    ];
    const placed = placedFieldNames(2);
    expect(unplacedMessages(errors, placed)).toEqual(["SKU is invalid."]);
  });

  it("returns an empty array when the error field is in the placed list", () => {
    const errors: ApiErrorItem[] = [
      { code: "required", field: "seats", message: "Seats is required." },
    ];
    const placed = placedFieldNames(2);
    expect(unplacedMessages(errors, placed)).toEqual([]);
  });
});
