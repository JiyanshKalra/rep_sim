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
  hideCustomerName?: boolean;
  hideSaveButton?: boolean;
  idPrefix?: string;
}

let lineIdCounter = 0;
function newLineId(): string {
  lineIdCounter += 1;
  return "line-" + lineIdCounter;
}

function CustomerNameField({
  value,
  saveErrors,
  idPrefix = "",
  onChange,
}: {
  value: string;
  saveErrors: ApiErrorItem[];
  idPrefix?: string;
  onChange: (val: string) => void;
}) {
  const nameErrors = messagesFor(saveErrors, "customer_name");
  const inputId = idPrefix + "customer-name";
  const errId = idPrefix + "customer-name-error";

  return (
    <div className="form-field">
      <label htmlFor={inputId} className="form-label">
        Customer name
      </label>
      <input
        id={inputId}
        type="text"
        className="form-input"
        placeholder="e.g. Acme Corp"
        value={value}
        aria-invalid={nameErrors.length > 0 ? "true" : undefined}
        aria-describedby={nameErrors.length > 0 ? errId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldErrors id={errId} messages={nameErrors} />
    </div>
  );
}

function SeatsField({
  seats,
  tiers,
  errors,
  idPrefix = "",
  onChange,
}: {
  seats: string;
  tiers: Catalog["tiers"];
  errors: ApiErrorItem[];
  idPrefix?: string;
  onChange: (val: string) => void;
}) {
  const seatsErrors = messagesFor(errors, "seats");
  const inputId = idPrefix + "seats";
  const errId = idPrefix + "seats-error";

  return (
    <div className="form-field">
      <label htmlFor={inputId} className="form-label">
        Seats
      </label>
      {/* type="text" with inputMode so typed string reaches API unchanged (R5) */}
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        className="form-input"
        placeholder="e.g. 25"
        value={seats}
        aria-invalid={seatsErrors.length > 0 ? "true" : undefined}
        aria-describedby={seatsErrors.length > 0 ? errId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldErrors id={errId} messages={seatsErrors} />
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
  idPrefix = "",
  onChangeLines,
}: {
  lines: LineFormState[];
  catalog: Catalog;
  errors: ApiErrorItem[];
  idPrefix?: string;
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
  const errId = idPrefix + "lines-error";

  return (
    <div className="form-section">
      <div className="form-section-header">
        <h2 className="form-section-title">Products</h2>
      </div>
      <div className="form-section-body">
        <FieldErrors id={errId} messages={lineErrors} />
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
                idPrefix={idPrefix}
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
  idPrefix = "",
  onChange,
}: {
  discountPct: string;
  maxDiscountPct: Percent | null;
  errors: ApiErrorItem[];
  idPrefix?: string;
  onChange: (val: string) => void;
}) {
  const discountErrors = messagesFor(errors, "discount_pct");
  const inputId = idPrefix + "discount-pct";
  const errId = idPrefix + "discount-error";
  const helpText =
    maxDiscountPct !== null
      ? "Maximum allowed for this tier: " + maxDiscountPct + "%"
      : "Enter 0 for standard pricing";

  return (
    <div className="form-field">
      <label htmlFor={inputId} className="form-label">
        Discount (%)
      </label>
      {/* type="text" with inputMode="decimal" so typed string reaches API unchanged (R5) */}
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        className="form-input"
        placeholder="0"
        value={discountPct}
        aria-invalid={discountErrors.length > 0 ? "true" : undefined}
        aria-describedby={discountErrors.length > 0 ? errId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldErrors id={errId} messages={discountErrors} />
      <p className="form-help">{helpText}</p>
    </div>
  );
}

function CustomerRequestedDiscountField({
  value,
  errors,
  idPrefix = "",
  onChange,
}: {
  value: string;
  errors: ApiErrorItem[];
  idPrefix?: string;
  onChange: (val: string) => void;
}) {
  const reqErrors = messagesFor(errors, "customer_requested_discount_pct");
  const inputId = idPrefix + "requested-discount-pct";
  const errId = idPrefix + "requested-discount-error";

  return (
    <div className="form-field">
      <label htmlFor={inputId} className="form-label">
        Customer Requested Discount (%) <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(Optional)</span>
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        className="form-input"
        placeholder="e.g. 25"
        value={value}
        aria-invalid={reqErrors.length > 0 ? "true" : undefined}
        aria-describedby={reqErrors.length > 0 ? errId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldErrors id={errId} messages={reqErrors} />
      <p className="form-help">What the customer asked for (informational; does not affect pricing).</p>
    </div>
  );
}

function CommitmentField({
  checked,
  errors,
  idPrefix = "",
  onChange,
}: {
  checked: boolean;
  errors: ApiErrorItem[];
  idPrefix?: string;
  onChange: (val: boolean) => void;
}) {
  const inputId = idPrefix + "annual-commitment";
  const errId = idPrefix + "annual-commitment-error";

  return (
    <div className={"commitment-box" + (checked ? " is-selected" : "")}>
      <label className="form-check" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="form-check-label">Annual Commitment</span>
      </label>
      <p className="form-check-hint">12-month agreement. Influences approval rules.</p>
      <FieldErrors id={errId} messages={messagesFor(errors, "annual_commitment")} />
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
  hideCustomerName = false,
  hideSaveButton = false,
  idPrefix = "",
}: Props) {
  return (
    <div className="builder-form-col">
      <div className="form-section">
        <div className="form-section-header">
          <h2 className="form-section-title">
            {hideCustomerName ? "Seats" : "Customer & Seats"}
          </h2>
        </div>
        <div className="form-section-body">
          <div className={hideCustomerName ? "single-field-grid" : "customer-grid"}>
            {!hideCustomerName && (
              <CustomerNameField
                value={form.customerName}
                saveErrors={saveErrors}
                idPrefix={idPrefix}
                onChange={(customerName) => onChange({ ...form, customerName })}
              />
            )}
            <SeatsField
              seats={form.seats}
              tiers={catalog.tiers}
              errors={errors}
              idPrefix={idPrefix}
              onChange={(seats) => onChange({ ...form, seats })}
            />
          </div>
        </div>
      </div>

      <ProductsFieldset
        lines={form.lines}
        catalog={catalog}
        errors={errors}
        idPrefix={idPrefix}
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
              idPrefix={idPrefix}
              onChange={(discountPct) => onChange({ ...form, discountPct })}
            />
            <CustomerRequestedDiscountField
              value={form.customerRequestedDiscountPct ?? ""}
              errors={errors}
              idPrefix={idPrefix}
              onChange={(customerRequestedDiscountPct) =>
                onChange({ ...form, customerRequestedDiscountPct })
              }
            />
            <CommitmentField
              checked={form.annualCommitment}
              errors={errors}
              idPrefix={idPrefix}
              onChange={(annualCommitment) => onChange({ ...form, annualCommitment })}
            />
          </div>
        </div>
      </div>

    {!hideSaveButton && (
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
    )}
  </div>
  );
}
