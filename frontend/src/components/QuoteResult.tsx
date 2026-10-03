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

function ProductsTable({ quote, currency }: { quote: SavedQuote; currency: string }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Quoted Products</h2>
      </div>
      <table className="products-table">
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col" className="num">
              Qty
            </th>
            <th scope="col" className="num">
              Unit Price
            </th>
            <th scope="col" className="num">
              Line Total
            </th>
            <th scope="col">Catalog Status</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((line) => (
            <tr key={line.sku}>
              <td>
                <div style={{ fontWeight: 600 }}>{line.name}</div>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                  SKU: {line.sku}
                </div>
              </td>
              <td className="num">{line.quantity}</td>
              <td className="num">{formatMoney(line.unit_price, currency)}</td>
              <td className="num" style={{ fontWeight: 600 }}>
                {formatMoney(line.line_total, currency)}
              </td>
              <td>
                <span
                  className={line.catalog_status !== "ok" ? "catalog-drift-cell" : "col-muted"}
                >
                  {describeCatalogStatus(line.catalog_status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuoteDetailsBlock({ quote }: { quote: SavedQuote }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Configuration Details</h2>
      </div>
      <div className="detail-pairs">
        <span className="detail-term">Customer</span>
        <span className="detail-value">{quote.customer_name}</span>

        <span className="detail-term">Seats</span>
        <span className="detail-value">{quote.seats}</span>

        <span className="detail-term">Pricing Tier</span>
        <span className="detail-value">
          <span className={"badge badge-tier-" + quote.result.tier.toLowerCase()}>
            {quote.result.tier} Tier
          </span>
        </span>

        <span className="detail-term">Commitment</span>
        <span className="detail-value">{quote.annual_commitment ? "Annual (12-month)" : "None"}</span>

        <span className="detail-term">Created</span>
        <span className="detail-value">{formatTimestamp(quote.created_at)}</span>

        <span className="detail-term">Last Updated</span>
        <span className="detail-value">{formatTimestamp(quote.updated_at)}</span>
      </div>
    </div>
  );
}

function PricingBlock({ quote, currency }: { quote: SavedQuote; currency: string }) {
  const calc = quote.result;
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Pricing Breakdown</h2>
      </div>
      <div className="review-totals">
        <div className="review-total-row">
          <span className="review-total-label">Subtotal</span>
          <span className="review-total-value">{formatMoney(calc.subtotal, currency)}</span>
        </div>
        <div className="review-total-row review-total-row-discount">
          <span className="review-total-label">Discount ({formatPercent(calc.discount_pct)})</span>
          <span className="review-total-value">-{formatMoney(calc.discount_amount, currency)}</span>
        </div>
        <hr className="review-total-divider" />
        <div className="review-total-row review-total-row-grand">
          <span className="review-total-label">Total Payable</span>
          <span className="review-total-value">{formatMoney(calc.total, currency)}</span>
        </div>
      </div>
    </div>
  );
}

function ApprovalCard({
  quote,
  rules,
  currency,
}: {
  quote: SavedQuote;
  rules: ApprovalRules;
  currency: string;
}) {
  const calc = quote.result;
  const isReq = calc.approval_required;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Approval Requirement</h2>
      </div>
      <div className={"approval-block " + (isReq ? "approval-block-required" : "approval-block-ok")}>
        <div
          className={"approval-heading " + (isReq ? "approval-heading-required" : "approval-heading-ok")}
        >
          {quote.status === "approved" || quote.status === "rejected" ? (isReq ? "Approval was required for this quote." : "No approval was required for this quote.") : describeApproval(isReq)}
        </div>
        {calc.approval_reasons.length > 0 && (
          <ul className="approval-reasons">
            {calc.approval_reasons.map((reason) => (
              <li key={reason}>{describeReason(reason, rules, currency)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function QuoteResult({ quote, currency, approvalRules }: Props) {
  return (
    <div className="review-grid">
      <div className="review-main">
        <ProductsTable quote={quote} currency={currency} />
        <QuoteDetailsBlock quote={quote} />
      </div>
      <div className="review-aside">
        <PricingBlock quote={quote} currency={currency} />
        <ApprovalCard quote={quote} rules={approvalRules} currency={currency} />
      </div>
    </div>
  );
}
