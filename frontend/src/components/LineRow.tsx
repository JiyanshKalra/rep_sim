// One product line in the quote form: product select, quantity input, remove button.
// The select excludes SKUs already used in other lines to prevent duplicates (R5).

import type { ApiErrorItem, LineFormState, Product } from "../types";
import { formatMoney } from "../display";
import { messagesFor } from "../fieldErrors";
import FieldErrors from "./FieldErrors";

interface LineRowProps {
  line: LineFormState;
  index: number;
  products: Product[];
  usedSkus: string[];
  currency: string;
  errors: ApiErrorItem[];
  onChange: (next: LineFormState) => void;
  onRemove: () => void;
  idPrefix?: string;
}

function ProductSelect({
  index,
  sku,
  products,
  usedSkus,
  currency,
  errors,
  idPrefix = "",
  onChangeSku,
}: {
  index: number;
  sku: string;
  products: Product[];
  usedSkus: string[];
  currency: string;
  errors: ApiErrorItem[];
  idPrefix?: string;
  onChangeSku: (sku: string) => void;
}) {
  const otherUsed = usedSkus.filter((s) => s !== sku);
  const available = products.filter((p) => !otherUsed.includes(p.sku));
  const errId = idPrefix + "line-sku-error-" + index;
  const selectId = idPrefix + "line-sku-" + index;
  const skuErrors = messagesFor(errors, "lines[" + index + "].sku");

  return (
    <div className="form-field">
      <label htmlFor={selectId} className="form-label">
        Product
      </label>
      <select
        id={selectId}
        className="form-select"
        value={sku}
        aria-invalid={skuErrors.length > 0 ? "true" : undefined}
        aria-describedby={skuErrors.length > 0 ? errId : undefined}
        onChange={(e) => onChangeSku(e.target.value)}
      >
        {available.map((p) => (
          <option key={p.sku} value={p.sku}>
            {p.name} — {formatMoney(p.unit_price, currency)}
          </option>
        ))}
      </select>
      <FieldErrors id={errId} messages={skuErrors} />
    </div>
  );
}

function QuantityInput({
  index,
  quantity,
  errors,
  idPrefix = "",
  onChangeQty,
}: {
  index: number;
  quantity: string;
  errors: ApiErrorItem[];
  idPrefix?: string;
  onChangeQty: (qty: string) => void;
}) {
  const errId = idPrefix + "line-qty-error-" + index;
  const inputId = idPrefix + "line-qty-" + index;
  const qtyErrors = messagesFor(errors, "lines[" + index + "].quantity");

  return (
    <div className="form-field product-line-qty">
      <label htmlFor={inputId} className="form-label">
        Qty
      </label>
      {/* type="text" with inputMode so typed string reaches API unchanged (R5) */}
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        className="form-input"
        value={quantity}
        aria-invalid={qtyErrors.length > 0 ? "true" : undefined}
        aria-describedby={qtyErrors.length > 0 ? errId : undefined}
        onChange={(e) => onChangeQty(e.target.value)}
      />
      <FieldErrors id={errId} messages={qtyErrors} />
    </div>
  );
}

export default function LineRow({
  line,
  index,
  products,
  usedSkus,
  currency,
  errors,
  onChange,
  onRemove,
  idPrefix = "",
}: LineRowProps) {
  const prod = products.find((p) => p.sku === line.sku);
  const removeLabel = "Remove line " + (index + 1) + (prod ? " (" + prod.name + ")" : "");

  return (
    <div className="product-line">
      <ProductSelect
        index={index}
        sku={line.sku}
        products={products}
        usedSkus={usedSkus}
        currency={currency}
        errors={errors}
        idPrefix={idPrefix}
        onChangeSku={(sku) => onChange({ ...line, sku })}
      />
      <QuantityInput
        index={index}
        quantity={line.quantity}
        errors={errors}
        idPrefix={idPrefix}
        onChangeQty={(quantity) => onChange({ ...line, quantity })}
      />
      <div className="product-line-remove-col">
        <button
          type="button"
          className="btn btn-danger btn-sm"
          aria-label={removeLabel}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
