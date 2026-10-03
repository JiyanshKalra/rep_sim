// Tests for the pure string-formatting helpers in display.ts.
// Each test proves one behaviour; field names match types.ts exactly.

import { describe, it, expect } from "vitest";
import {
  formatMoney,
  formatPercent,
  describeTier,
  describeReason,
  formatTimestamp,
  describeApproval,
  describeStatus,
  statusActionLabel,
  describeCatalogStatus,
} from "./display";
import type { ApprovalRules, Tier } from "./types";

describe("formatMoney", () => {
  it("formats USD amounts above 1000 with a dollar sign and comma", () => {
    expect(formatMoney("20000.00", "USD")).toBe("$20,000.00");
  });

  it("formats USD amounts below 1000 with a dollar sign and no comma", () => {
    expect(formatMoney("999.50", "USD")).toBe("$999.50");
  });

  it("formats USD amounts in the millions with two commas", () => {
    expect(formatMoney("1000000.00", "USD")).toBe("$1,000,000.00");
  });

  it("formats zero dollars as $0.00", () => {
    expect(formatMoney("0.00", "USD")).toBe("$0.00");
  });

  it("formats non-USD currencies with the currency code and a space prefix", () => {
    expect(formatMoney("1000.00", "EUR")).toBe("EUR 1,000.00");
  });
});

describe("formatPercent", () => {
  it("appends a percent sign to a whole-number string", () => {
    expect(formatPercent("20")).toBe("20%");
  });

  it("appends a percent sign to a decimal string as the API sent it", () => {
    expect(formatPercent("10.01")).toBe("10.01%");
  });
});

describe("describeTier", () => {
  it("describes a bounded tier with a seat range and max discount", () => {
    // min_seats and max_seats are the field names in types.ts (not min/max)
    const tier: Tier = {
      code: "GROWTH",
      min_seats: 10,
      max_seats: 49,
      max_discount_pct: "20",
    };
    expect(describeTier(tier)).toBe("GROWTH: 10-49 seats, up to 20% discount");
  });

  it("describes a top tier with null max_seats using a plus sign", () => {
    const tier: Tier = {
      code: "ENTERPRISE",
      min_seats: 50,
      max_seats: null,
      max_discount_pct: "30",
    };
    expect(describeTier(tier)).toBe("ENTERPRISE: 50+ seats, up to 30% discount");
  });
});

describe("describeReason", () => {
  const rules: ApprovalRules = {
    discount_above_pct: "15",
    total_above: "25000.00",
    annual_commitment_discount_above_pct: "10",
  };
  const currency = "USD";

  it("describes discount_above_15_percent using the threshold from rules", () => {
    expect(describeReason("discount_above_15_percent", rules, currency)).toBe(
      "Discount is above 15%",
    );
  });

  it("describes total_above_25000 using the formatted money threshold from rules", () => {
    expect(describeReason("total_above_25000", rules, currency)).toBe(
      "Total is above $25,000.00",
    );
  });

  it("describes annual_commitment_discount_above_10_percent using the threshold from rules", () => {
    expect(
      describeReason("annual_commitment_discount_above_10_percent", rules, currency),
    ).toBe("Annual commitment with a discount above 10%");
  });

  it("uses the discount_above_pct value from the rules object, not a hardcoded number", () => {
    // proves the browser repeats no business rule: the label changes when rules change
    const customRules: ApprovalRules = {
      ...rules,
      discount_above_pct: "12",
    };
    expect(describeReason("discount_above_15_percent", customRules, currency)).toBe(
      "Discount is above 12%",
    );
  });
});

describe("formatTimestamp", () => {
  it("converts an ISO timestamp to a readable UTC string without sub-minute parts", () => {
    expect(formatTimestamp("2026-10-03T14:05:09.123456+00:00")).toBe(
      "2026-10-03 14:05 UTC",
    );
  });
});

describe("describeApproval", () => {
  it("returns Approval required when approval is needed", () => {
    expect(describeApproval(true)).toBe("Approval required");
  });

  it("returns No approval required when approval is not needed", () => {
    expect(describeApproval(false)).toBe("No approval required");
  });
});

describe("describeStatus", () => {
  it("describes draft status as Draft", () => {
    expect(describeStatus("draft")).toBe("Draft");
  });

  it("describes approved status as Approved", () => {
    expect(describeStatus("approved")).toBe("Approved");
  });
});

describe("statusActionLabel", () => {
  it("labels the submitted transition as Submit for approval", () => {
    expect(statusActionLabel("submitted")).toBe("Submit for approval");
  });

  it("labels the approved transition as Approve", () => {
    expect(statusActionLabel("approved")).toBe("Approve");
  });

  it("labels the rejected transition as Reject", () => {
    expect(statusActionLabel("rejected")).toBe("Reject");
  });
});

describe("describeCatalogStatus", () => {
  it("returns an empty string for a product still in the catalog", () => {
    expect(describeCatalogStatus("ok")).toBe("");
  });

  it("returns a plain-English message for a removed product", () => {
    expect(describeCatalogStatus("removed")).toBe("No longer in the catalog");
  });
});
