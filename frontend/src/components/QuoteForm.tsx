// The left-column quote form: customer name, seats, product lines, discount, commitment, save.
// All numeric inputs are type="text" so the rep's keystrokes reach the API unchanged (R5).

import type { ApiErrorItem, Catalog, LineFormState, Percent, QuoteFormState } from "../types";
import { describeTier } from "../display";
import { messagesFor } from "../fieldErrors";
import FieldErrors from "./FieldErrors";
import LineRow from "./LineRow";

interface Props {
  form: QuoteFormState;
  catalog: Catalog;
  errors: ApiErrorItem[];
  saveErrors: ApiErrorItem[];
  isSaving: boolean;
  maxDiscountPct: Percent | null;
  onChange: (next: QuoteFormState) => void;
}

let lineIdCounter = 0;
function newLineId(): string {
  lineIdCounter += 1;
  return "line-" + lineIdCounter;
}

function CustomerNameField({
  value,
  saveErrors,
  onChange,
}: {
  value: string;
  saveErrors: ApiErrorItem[];
  onChange: (val: string) => void;
}) {
  const nameErrors = messagesFor(saveErrors, "customer_name");
  return (
    <div className="form-field">
      <label htmlFor="customer-name" className="form-label">
        Customer name
      </label>
      <input
        id="customer-name"
        type="text"
        className="form-input"
        placeholder="e.g. Acme Corp"
        value={value}
        aria-invalid={nameErrors.length > 0 ? "true" : undefined}
        aria-describedby={nameErrors.length > 0 ? "customer-name-error" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldErrors id="customer-name-error" messages={nameErrors} />
    </div>
  );
}

function SeatsField({
  seats,
  tiers,
  errors,
  onChange,
}: {
  seats: string;
  tiers: Catalog["tiers"];
  errors: ApiErrorItem[];
  onChange: (val: string) => void;
}) {
  const seatsErrors = messagesFor(errors, "seats");
  return (
    <div className="form-field">
      <label htmlFor="seats" className="form-label">
        Seats
      </label>
      {/* type="text" with inputMode so typed string reaches API unchanged (R5) */}
      <input
        id="seats"
        type="text"
        inputMode="numeric"
        className="form-input"
        placeholder="e.g. 25"
        value={seats}
        aria-invalid={seatsErrors.length > 0 ? "true" : undefined}
        aria-describedby={seatsErrors.length > 0 ? "seats-error" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldErrors id="seats-error" messages={seatsErrors} />
      <div className="tier-hint-list">
        {tiers.map((t) => (
          <span key={t.code} className="tier-hint-item">
            {describeTier(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProductsFieldset({
  lines,
  catalog,
  errors,
  onChangeLines,
}: {
  lines: LineFormState[];
  catalog: Catalog;
  errors: ApiErrorItem[];
  onChangeLines: (next: LineFormState[]) => void;
}) {
  const usedSkus = lines.map((l) => l.sku);
  const allUsed = usedSkus.length >= catalog.products.length;
  const firstUnused = catalog.products.find((p) => !usedSkus.includes(p.sku));

  function addLine() {
    if (!firstUnused) return;
    onChangeLines([...lines, { id: newLineId(), sku: firstUnused.sku, quantity: "1" }]);
  }

  const lineErrors = messagesFor(errors, "lines");

  return (
    <div className="form-section">
      <div className="form-section-header">
        <h2 className="form-section-title">Products</h2>
      </div>
      <div className="form-section-body">
        <FieldErrors id="lines-error" messages={lineErrors} />
        {lines.length === 0 ? (
          <p className="form-help" style={{ marginBottom: "var(--space-3)" }}>
            No products added yet. Click below to add a product line to this quote.
          </p>
        ) : (
          <div className="product-lines-list">
            {lines.map((line, i) => (
              <LineRow
                key={line.id}
                line={line}
                index={i}
                products={catalog.products}
                usedSkus={usedSkus}
                currency={catalog.currency}
                errors={errors}
                onChange={(next) => onChangeLines(lines.map((l, idx) => (idx === i ? next : l)))}
                onRemove={() => onChangeLines(lines.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        )}
        <div className="add-product-row">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={allUsed}
            onClick={addLine}
          >
            + Add Product
          </button>
        </div>
      </div>
    </div>
  );
}

function DiscountField({
  discountPct,
  maxDiscountPct,
  errors,
  onChange,
}: {
  discountPct: string;
  maxDiscountPct: Percent | null;
  errors: ApiErrorItem[];
  onChange: (val: string) => void;
}) {
  const discountErrors = messagesFor(errors, "discount_pct");
  const helpText =
    maxDiscountPct !== null
      ? "Maximum allowed for this tier: " + maxDiscountPct + "%"
      : "Enter 0 for standard pricing";

  return (
    <div className="form-field">
      <label htmlFor="discount-pct" className="form-label">
        Discount (%)
      </label>
      {/* type="text" with inputMode="decimal" so typed string reaches API unchanged (R5) */}
      <input
        id="discount-pct"
        type="text"
        inputMode="decimal"
        className="form-input"
        placeholder="0"
        value={discountPct}
        aria-invalid={discountErrors.length > 0 ? "true" : undefined}
        aria-describedby={discountErrors.length > 0 ? "discount-error" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldErrors id="discount-error" messages={discountErrors} />
      <p className="form-help">{helpText}</p>
    </div>
  );
}

function CommitmentField({
  checked,
  errors,
  onChange,
}: {
  checked: boolean;
  errors: ApiErrorItem[];
  onChange: (val: boolean) => void;
}) {
  return (
    <div className={"commitment-box" + (checked ? " is-selected" : "")}>
      <label className="form-check" htmlFor="annual-commitment">
        <input
          id="annual-commitment"
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="form-check-label">Annual Commitment</span>
      </label>
      <p className="form-check-hint">12-month agreement. Influences approval rules.</p>
      <FieldErrors
        id="annual-commitment-error"
        messages={messagesFor(errors, "annual_commitment")}
      />
    </div>
  );
}

export default function QuoteForm({
  form,
  catalog,
  errors,
  saveErrors,
  isSaving,
  maxDiscountPct,
  onChange,
}: Props) {
  return (
    <div className="builder-form-col">
      <div className="form-section">
        <div className="form-section-header">
          <h2 className="form-section-title">Customer &amp; Seats</h2>
        </div>
        <div className="form-section-body">
          <div className="customer-grid">
            <CustomerNameField
              value={form.customerName}
              saveErrors={saveErrors}
              onChange={(customerName) => onChange({ ...form, customerName })}
            />
            <SeatsField
              seats={form.seats}
              tiers={catalog.tiers}
              errors={errors}
              onChange={(seats) => onChange({ ...form, seats })}
            />
          </div>
        </div>
      </div>

      <ProductsFieldset
        lines={form.lines}
        catalog={catalog}
        errors={errors}
        onChangeLines={(lines) => onChange({ ...form, lines })}
      />

      <div className="form-section">
        <div className="form-section-header">
          <h2 className="form-section-title">Discount &amp; Terms</h2>
        </div>
        <div className="form-section-body">
          <div className="discount-commitment-grid">
            <DiscountField
              discountPct={form.discountPct}
              maxDiscountPct={maxDiscountPct}
              errors={errors}
              onChange={(discountPct) => onChange({ ...form, discountPct })}
            />
            <CommitmentField
              checked={form.annualCommitment}
              errors={errors}
              onChange={(annualCommitment) => onChange({ ...form, annualCommitment })}
            />
          </div>
        </div>
      </div>

      <div className="form-footer">
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", padding: "12px 20px", fontSize: "var(--font-size-md)" }}
          disabled={isSaving}
        >
          {isSaving ? "Saving Quote..." : "Save Quote"}
        </button>
      </div>
    </div>
  );
}
