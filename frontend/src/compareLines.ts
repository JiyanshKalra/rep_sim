// Pure helper to compare quoted product lines between two scenarios by SKU and quantity.
// Frontend never compares money: this tracks matching lines, quantity differences, and additions (rule 7).

export interface LineKey {
  sku: string;
  name: string;
  quantity: number;
}

export type LineDiffStatus = "same" | "only_in_a" | "only_in_b" | "quantity_differs";

export interface LineDiff {
  sku: string;
  name: string;
  quantityA: number | null;
  quantityB: number | null;
  status: LineDiffStatus;
}

// Determines the diff status when matching a line in A against the corresponding line in B.
function diffStatusFor(lineA: LineKey, lineB: LineKey | undefined): LineDiff {
  if (!lineB) {
    return {
      sku: lineA.sku,
      name: lineA.name,
      quantityA: lineA.quantity,
      quantityB: null,
      status: "only_in_a",
    };
  }
  if (lineA.quantity === lineB.quantity) {
    return {
      sku: lineA.sku,
      name: lineA.name,
      quantityA: lineA.quantity,
      quantityB: lineB.quantity,
      status: "same",
    };
  }
  return {
    sku: lineA.sku,
    name: lineA.name,
    quantityA: lineA.quantity,
    quantityB: lineB.quantity,
    status: "quantity_differs",
  };
}

// Compares line items across scenario A and scenario B.
// Preserves A order first, then appends lines unique to B in B order (rule 7).
export function compareLines(a: LineKey[], b: LineKey[]): LineDiff[] {
  const bMap = new Map<string, LineKey>();
  for (const line of b) {
    bMap.set(line.sku, line);
  }

  const result: LineDiff[] = a.map((lineA) => diffStatusFor(lineA, bMap.get(lineA.sku)));
  const aSkus = new Set(a.map((line) => line.sku));

  for (const lineB of b) {
    if (!aSkus.has(lineB.sku)) {
      result.push({
        sku: lineB.sku,
        name: lineB.name,
        quantityA: null,
        quantityB: lineB.quantity,
        status: "only_in_b",
      });
    }
  }

  return result;
}
