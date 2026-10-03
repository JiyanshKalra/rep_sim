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

function CustomerNameField({ value, saveErrors, onChange }: { value: string; saveErrors: ApiErrorItem[]; onChange: (val: string) => void }) {
  const nameErrors = messagesFor(saveErrors, "customer_name");
  return (
    <div className="field">
      <label htmlFor="customer-name">Customer name</label>
      <input
        id="customer-name"
        type="text"
        value={value}
        aria-invalid={nameErrors.length > 0 ? "true" : undefined}
        aria-describedby={nameErrors.length > 0 ? "customer-name-error" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldErrors id="customer-name-error" messages={nameErrors} />
    </div>
  );
}

function SeatsField({ seats, tiers, errors, onChange }: { seats: string; tiers: Catalog["tiers"]; errors: ApiErrorItem[]; onChange: (val: string) => void }) {
  const seatsErrors = messagesFor(errors, "seats");
  return (
    <div className="field">
      <label htmlFor="seats">Seats</label>
      {/* type="text" with inputMode so typed string reaches API unchanged (R5) */}
      <input
        id="seats"
        type="text"
        inputMode="numeric"
        value={seats}
        aria-invalid={seatsErrors.length > 0 ? "true" : undefined}
        aria-describedby={seatsErrors.length > 0 ? "seats-error" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldErrors id="seats-error" messages={seatsErrors} />
      <ul className="help-list">
        {tiers.map((t) => (
          <li key={t.code}>{describeTier(t)}</li>
        ))}
      </ul>
    </div>
  );
}

function ProductsFieldset({ lines, catalog, errors, onChangeLines }: { lines: LineFormState[]; catalog: Catalog; errors: ApiErrorItem[]; onChangeLines: (next: LineFormState[]) => void }) {
  const usedSkus = lines.map((l) => l.sku);
  const allUsed = usedSkus.length >= catalog.products.length;
  const firstUnused = catalog.products.find((p) => !usedSkus.includes(p.sku));

  function addLine() {
    if (!firstUnused) return;
    onChangeLines([...lines, { id: newLineId(), sku: firstUnused.sku, quantity: "1" }]);
  }

  return (
    <fieldset className="products-fieldset">
      <legend>Products</legend>
      <FieldErrors id="lines-error" messages={messagesFor(errors, "lines")} />
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
      <button type="button" className="btn-plain" disabled={allUsed} onClick={addLine}>
        Add product
      </button>
    </fieldset>
  );
}

function DiscountField({ discountPct, maxDiscountPct, errors, onChange }: { discountPct: string; maxDiscountPct: Percent | null; errors: ApiErrorItem[]; onChange: (val: string) => void }) {
  const discountErrors = messagesFor(errors, "discount_pct");
  const helpText = maxDiscountPct !== null ? "Maximum for this quote: " + maxDiscountPct + "%" : "Enter 0 for no discount";
  return (
    <div className="field">
      <label htmlFor="discount-pct">Discount (%)</label>
      {/* type="text" with inputMode="decimal" so typed string reaches API unchanged (R5) */}
      <input
        id="discount-pct"
        type="text"
        inputMode="decimal"
        value={discountPct}
        aria-invalid={discountErrors.length > 0 ? "true" : undefined}
        aria-describedby={discountErrors.length > 0 ? "discount-error" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldErrors id="discount-error" messages={discountErrors} />
      <p className="field-help">{helpText}</p>
    </div>
  );
}

function CommitmentField({ checked, errors, onChange }: { checked: boolean; errors: ApiErrorItem[]; onChange: (val: boolean) => void }) {
  return (
    <div className="field field-inline">
      <input id="annual-commitment" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor="annual-commitment">Annual commitment</label>
      <FieldErrors id="annual-commitment-error" messages={messagesFor(errors, "annual_commitment")} />
    </div>
  );
}

export default function QuoteForm({ form, catalog, errors, saveErrors, isSaving, maxDiscountPct, onChange }: Props) {
  return (
    <div className="quote-form">
      <CustomerNameField value={form.customerName} saveErrors={saveErrors} onChange={(customerName) => onChange({ ...form, customerName })} />
      <SeatsField seats={form.seats} tiers={catalog.tiers} errors={errors} onChange={(seats) => onChange({ ...form, seats })} />
      <ProductsFieldset lines={form.lines} catalog={catalog} errors={errors} onChangeLines={(lines) => onChange({ ...form, lines })} />
      <DiscountField discountPct={form.discountPct} maxDiscountPct={maxDiscountPct} errors={errors} onChange={(discountPct) => onChange({ ...form, discountPct })} />
      <CommitmentField checked={form.annualCommitment} errors={errors} onChange={(annualCommitment) => onChange({ ...form, annualCommitment })} />
      <button type="submit" className="btn-primary" disabled={isSaving}>
        {isSaving ? "Saving..." : "Save quote"}
      </button>
    </div>
  );
}
