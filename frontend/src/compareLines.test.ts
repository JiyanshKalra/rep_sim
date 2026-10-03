// Tests for the pure product comparison helper in compareLines.ts.
// Verifies status classification, quantity tracking, and strict ordering rules (rule 7).

import { describe, it, expect } from "vitest";
import { compareLines, type LineKey } from "./compareLines";

describe("compareLines", () => {
  const lineA1: LineKey = { sku: "PLATFORM", name: "Platform Access", quantity: 5 };
  const lineA2: LineKey = { sku: "SUPPORT", name: "Premium Support", quantity: 2 };
  const lineB1: LineKey = { sku: "PLATFORM", name: "Platform Access", quantity: 5 };
  const lineB2Diff: LineKey = { sku: "SUPPORT", name: "Premium Support", quantity: 4 };
  const lineB3Only: LineKey = { sku: "ONBOARDING", name: "Implementation Services", quantity: 1 };

  it("identifies identical lines in both scenarios as same", () => {
    const diffs = compareLines([lineA1], [lineB1]);
    expect(diffs).toEqual([
      {
        sku: "PLATFORM",
        name: "Platform Access",
        quantityA: 5,
        quantityB: 5,
        status: "same",
      },
    ]);
  });

  it("identifies a line present in Abut missing from B as only_in_a", () => {
    const diffs = compareLines([lineA1, lineA2], [lineB1]);
    expect(diffs).toEqual([
      {
        sku: "PLATFORM",
        name: "Platform Access",
        quantityA: 5,
        quantityB: 5,
        status: "same",
      },
      {
        sku: "SUPPORT",
        name: "Premium Support",
        quantityA: 2,
        quantityB: null,
        status: "only_in_a",
      },
    ]);
  });

  it("identifies a line present in B but missing from A as only_in_b", () => {
    const diffs = compareLines([lineA1], [lineB1, lineB3Only]);
    expect(diffs).toEqual([
      {
        sku: "PLATFORM",
        name: "Platform Access",
        quantityA: 5,
        quantityB: 5,
        status: "same",
      },
      {
        sku: "ONBOARDING",
        name: "Implementation Services",
        quantityA: null,
        quantityB: 1,
        status: "only_in_b",
      },
    ]);
  });

  it("identifies matching SKUs with different quantities as quantity_differs", () => {
    const diffs = compareLines([lineA2], [lineB2Diff]);
    expect(diffs).toEqual([
      {
        sku: "SUPPORT", name: "Premium Support",
        quantityA: 2,
        quantityB: 4,
        status: "quantity_differs",
      },
    ]);
  });

  it("handles empty A scenario with all lines labeled as only_in_b", () => {
    const diffs = compareLines([], [lineB1, lineB3Only]);
    expect(diffs).toEqual([
      {
        sku: "PLATFORM",
        name: "Platform Access",
        quantityA: null,
        quantityB: 5,
        status: "only_in_b",
       },
      {
        sku: "ONBOARDING",
        name: "Implementation Services",
        quantityA: null,
        quantityB: 1,
        status: "only_in_b",
      },
    ]);
  });

  it("handles empty B scenario with all lines labeled as only_in_a", () => {
    const diffs = compareLines([lineA1, lineA2], []);
    expect(diffs).toEqual([
      {
        sku: "PLATFORM",
        name: "Platform Access",
        quantityA: 5,
        quantityB: null,
        status: "only_in_a",
      },
      {
        sku: "SUPPORT",
        name: "Premium Support",
        quantityA: 2,
        quantityB: null,
        status: "only_in_a",
      },
    ]);
  });

  it("orders lines with A in A order first, then B-only lines in B order", () => {
    const aList: LineKey[] = [
      { sku: "SKU_2", name: "Second", quantity: 1 },
      { sku: "SKU_1", name: "First", quantity: 2 },
    ];
    const bList: LineKey[] = [
      { sku: "SKU_3", name: "Third", quantity: 3 },
      { sku: "SKU_1", name: "First", quantity: 2 },
      { sku: "SKU_4", name: "Fourth", quantity: 4 },
    ];
    const diffs = compareLines(aList, bList);
    expect(diffs.map((d) => d.sku)).toEqual(["SKU_2", "SKU_1", "SKU_3", "SKU_4"]);
    expect(diffs[0]?.status).toBe("only_in_a");
    expect(diffs[1]?.status).toBe("same");
    expect(diffs[2]?.status).toBe("only_in_b");
    expect(diffs[3]?.status).toBe("only_in_b");
  });

  it("produces duplicate-free output with one entry per unique SKU", () => {
    const aList: LineKey[] = [
      { sku: "SKU_1", name: "First", quantity: 10 },
      { sku: "SKU_2", name: "Second", quantity: 20 },
    ];
    const bList: LineKey[] = [
      { sku: "SKU_2", name: "Second", quantity: 30 },
      { sku: "SKU_1", name: "First", quantity: 10 },
    ];
    const diffs = compareLines(aList, bList);
    const skus = diffs.map((d) => d.sku);
    expect(skus).toEqual(["SKU_1", "SKU_2"]);
    expect(new Set(skus).size).toBe(diffs.length);
  });
});
