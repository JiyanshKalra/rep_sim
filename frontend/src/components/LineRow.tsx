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
}

function ProductSelect({
  index,
  sku,
  products,
  usedSkus,
  currency,
  errors,
  onChangeSku,
}: {
  index: number;
  sku: string;
  products: Product[];
  usedSkus: string[];
  currency: string;
  errors: ApiErrorItem[];
  onChangeSku: (sku: string) => void;
}) {
  const otherUsed = usedSkus.filter((s) => s !== sku);
  const available = products.filter((p) => !otherUsed.includes(p.sku));
  const errId = "line-sku-error-" + index;
  const skuErrors = messagesFor(errors, "lines[" + index + "].sku");

  return (
    <div className="form-field">
      <label htmlFor={"line-sku-" + index} className="form-label">
        Product
      </label>
      <select
        id={"line-sku-" + index}
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
  onChangeQty,
}: {
  index: number;
  quantity: string;
  errors: ApiErrorItem[];
  onChangeQty: (qty: string) => void;
}) {
  const errId = "line-qty-error-" + index;
  const qtyErrors = messagesFor(errors, "lines[" + index + "].quantity");

  return (
    <div className="form-field product-line-qty">
      <label htmlFor={"line-qty-" + index} className="form-label">
        Qty
      </label>
      {/* type="text" with inputMode so typed string reaches API unchanged (R5) */}
      <input
        id={"line-qty-" + index}
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
        onChangeSku={(sku) => onChange({ ...line, sku })}
      />
      <QuantityInput
        index={index}
        quantity={line.quantity}
        errors={errors}
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
