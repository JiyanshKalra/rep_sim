// Types for everything that crosses the browser/API boundary.
// Money and Percent are strings so JSON never turns them into floats; the UI never does arithmetic on them (R3).

export type Money = string; // "12000.00"
export type Percent = string; // "20", "10.01", "0"

export type QuoteStatus = "draft" | "submitted" | "approved" | "rejected";
export type CatalogStatus = "ok" | "removed" | "price_changed";
export type ApprovalReason =
  | "discount_above_15_percent"
  | "total_above_25000"
  | "annual_commitment_discount_above_10_percent";

// ---- Responses from the API ----

export interface Product {
  sku: string;
  name: string;
  unit_price: Money;
}

export interface Tier {
  code: string;
  min_seats: number;
  max_seats: number | null; // null = open-ended top tier
  max_discount_pct: Percent;
}

export interface ApprovalRules {
  discount_above_pct: Percent;
  total_above: Money;
  annual_commitment_discount_above_pct: Percent;
}

export interface Catalog {
  currency: string;
  products: Product[];
  tiers: Tier[];
  approval_rules: ApprovalRules;
}

export interface CalculatedLine {
  sku: string;
  name: string;
  unit_price: Money;
  quantity: number;
  line_total: Money;
}

export interface Calculation {
  tier: string;
  max_discount_pct: Percent;
  currency: string;
  lines: CalculatedLine[];
  subtotal: Money;
  discount_pct: Percent;
  discount_amount: Money;
  total: Money;
  approval_required: boolean;
  approval_reasons: ApprovalReason[];
  // Lines of plain English written by the backend (rule R8); the UI shows them as returned.
  explanation: string[];
}

export interface AuditEntry {
  action: string;
  timestamp: string;
  details: string;
}

export interface SavedLine extends CalculatedLine {
  catalog_status: CatalogStatus; // computed by the API at read time (R6)
}

export interface SavedQuote {
  id: string;
  customer_name: string;
  seats: number;
  annual_commitment: boolean;
  status: QuoteStatus;
  rejection_reason?: string | null;
  customer_requested_discount_pct?: Percent | null;
  created_at: string;
  updated_at: string;
  allowed_next_statuses: QuoteStatus[];
  lines: SavedLine[];
  result: Calculation;
  history?: AuditEntry[];
}

export interface QuoteSummary {
  id: string;
  customer_name: string;
  seats: number;
  tier: string;
  total: Money;
  approval_required: boolean;
  status: QuoteStatus;
  created_at: string;
}

// ---- Error envelope: every non-2xx response has this body ----

export interface ApiErrorItem {
  code: string;
  field: string | null; // for example "seats" or "lines[0].quantity"; null when not tied to a field
  message: string;
}

// ---- Request payloads: what we send ----
// Numbers are sent exactly as the rep typed them. The API accepts digit strings for integers and numeric strings for the discount, and it is the only place that validates them (R5).

export interface DraftLinePayload {
  sku: string;
  quantity: string;
}

export interface QuoteDraftPayload {
  seats: string;
  lines: DraftLinePayload[];
  discount_pct: string;
  annual_commitment: boolean;
  customer_requested_discount_pct?: string;
}

export interface SaveQuotePayload extends QuoteDraftPayload {
  customer_name: string;
}

export interface StatusChangePayload {
  status: QuoteStatus;
  reason?: string;
}

// ---- Form state: what the inputs hold (always strings for typed values) ----

export interface LineFormState {
  id: string; // only a React key; never sent to the API
  sku: string;
  quantity: string;
}

export interface QuoteFormState {
  customerName: string;
  seats: string;
  lines: LineFormState[];
  discountPct: string;
  annualCommitment: boolean;
  customerRequestedDiscountPct?: string;
}
