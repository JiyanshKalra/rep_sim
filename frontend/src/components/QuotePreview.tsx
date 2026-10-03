// Right-column preview that shows the API's calculated result in real time.
// All displayed values come from the API; no arithmetic happens here (R3).

import type { ApprovalRules, Calculation } from "../types";
import type { CalculationView } from "../useCalculate";
import { describeReason, formatMoney, formatPercent } from "../display";

interface Props {
  view: CalculationView;
  approvalRules: ApprovalRules;
  isBlank: boolean;
}

function StatusLine({ view }: { view: CalculationView }) {
  if (view.isUpdating) return <p role="status">Updating...</p>;
  if (view.errors.length > 0) return <p role="status">Out of date: fix the highlighted fields</p>;
  if (view.failureMessage !== null) return <p role="status">{view.failureMessage}</p>;
  if (view.calculation !== null) return <p role="status">Up to date</p>;
  return null;
}

function EmptyState({ view, isBlank }: { view: CalculationView; isBlank: boolean }) {
  if (isBlank) return <p>Enter the seats and add a product to see the live preview.</p>;
  if (view.errors.length > 0) return <p>Fix the highlighted fields to see the preview.</p>;
  return <p>Calculating...</p>;
}

function LineTable({ calc, currency }: { calc: Calculation; currency: string }) {
  return (
    <table className="preview-table">
      <caption>Products</caption>
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col" className="num-col">Quantity</th>
          <th scope="col" className="num-col">Unit price</th>
          <th scope="col" className="num-col">Line total</th>
        </tr>
      </thead>
      <tbody>
        {calc.lines.map((line) => (
          <tr key={line.sku}>
            <td>{line.name}</td>
            <td className="num-col">{line.quantity}</td>
            <td className="num-col">{formatMoney(line.unit_price, currency)}</td>
            <td className="num-col">{formatMoney(line.line_total, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsBlock({ calc, currency }: { calc: Calculation; currency: string }) {
  const discountLabel =
    formatPercent(calc.discount_pct) + " (-" + formatMoney(calc.discount_amount, currency) + ")";
  return (
    <dl className="totals">
      <dt>Subtotal</dt>
      <dd>{formatMoney(calc.subtotal, currency)}</dd>
      <dt>Discount</dt>
      <dd>{discountLabel}</dd>
      <dt>Total</dt>
      <dd>{formatMoney(calc.total, currency)}</dd>
    </dl>
  );
}

function ApprovalBox({ calc, rules, currency }: { calc: Calculation; rules: ApprovalRules; currency: string }) {
  return (
    <div className={calc.approval_required ? "approval-required" : "approval-ok"}>
      <h3>{calc.approval_required ? "Approval required" : "No approval required"}</h3>
      {calc.approval_reasons.length > 0 && (
        <ul>
          {calc.approval_reasons.map((reason) => (
            <li key={reason}>{describeReason(reason, rules, currency)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function QuotePreview({ view, approvalRules, isBlank }: Props) {
  const { calculation } = view;
  const isStale =
    calculation !== null &&
    (view.isUpdating || view.errors.length > 0 || view.failureMessage !== null);
  const currency = calculation?.currency ?? "USD";

  return (
    <section aria-labelledby="preview-heading" className="quote-preview">
      <h2 id="preview-heading">Quote preview</h2>
      <StatusLine view={view} />
      {calculation === null ? (
        <EmptyState view={view} isBlank={isBlank} />
      ) : (
        <div className={isStale ? "stale" : ""}>
          <p className="tier-info">
            {calculation.tier} &mdash; max discount {formatPercent(calculation.max_discount_pct)}
          </p>
          <LineTable calc={calculation} currency={currency} />
          <TotalsBlock calc={calculation} currency={currency} />
          <ApprovalBox calc={calculation} rules={approvalRules} currency={currency} />
        </div>
      )}
    </section>
  );
}
