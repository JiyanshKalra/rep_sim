// Detailed snapshot view of a saved quote including customer details, lines, totals, and approval.
// Pure presentation component rendering frozen API values without arithmetic (R3).

import type { ApprovalRules, SavedQuote } from "../types";
import {
  describeApproval,
  describeCatalogStatus,
  describeReason,
  formatMoney,
  formatPercent,
  formatTimestamp,
} from "../display";

interface Props {
  quote: SavedQuote;
  currency: string;
  approvalRules: ApprovalRules;
}

function CustomerBlock({ quote }: { quote: SavedQuote }) {
  return (
    <dl className="customer-details">
      <dt>Customer</dt>
      <dd>{quote.customer_name}</dd>
      <dt>Seats</dt>
      <dd>{quote.seats}</dd>
      <dt>Pricing tier</dt>
      <dd>{quote.result.tier}</dd>
      <dt>Annual commitment</dt>
      <dd>{quote.annual_commitment ? "Yes" : "No"}</dd>
      <dt>Created</dt>
      <dd>{formatTimestamp(quote.created_at)}</dd>
      <dt>Updated</dt>
      <dd>{formatTimestamp(quote.updated_at)}</dd>
    </dl>
  );
}

function ProductsTable({ quote, currency }: { quote: SavedQuote; currency: string }) {
  return (
    <table className="preview-table">
      <caption>Products</caption>
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col" className="num-col">Quantity</th>
          <th scope="col" className="num-col">Unit price</th>
          <th scope="col" className="num-col">Line total</th>
          <th scope="col">Catalog</th>
        </tr>
      </thead>
      <tbody>
        {quote.lines.map((line) => (
          <tr key={line.sku}>
            <td>{line.name}</td>
            <td className="num-col">{line.quantity}</td>
            <td className="num-col">{formatMoney(line.unit_price, currency)}</td>
            <td className="num-col">{formatMoney(line.line_total, currency)}</td>
            <td>{describeCatalogStatus(line.catalog_status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsBlock({ quote, currency }: { quote: SavedQuote; currency: string }) {
  const calc = quote.result;
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

function ApprovalBox({ quote, rules, currency }: { quote: SavedQuote; rules: ApprovalRules; currency: string }) {
  const calc = quote.result;
  const isReq = calc.approval_required;
  return (
    <div className={isReq ? "approval-required" : "approval-ok"}>
      <h3>{describeApproval(isReq)}</h3>
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

export default function QuoteResult({ quote, currency, approvalRules }: Props) {
  return (
    <div className="quote-result">
      <CustomerBlock quote={quote} />
      <ProductsTable quote={quote} currency={currency} />
      <TotalsBlock quote={quote} currency={currency} />
      <ApprovalBox quote={quote} rules={approvalRules} currency={currency} />
    </div>
  );
}
