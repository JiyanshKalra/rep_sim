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

function StatusIndicator({ view }: { view: CalculationView }) {
  if (view.isUpdating) {
    return (
      <span className="preview-calc-status is-updating" role="status">
        Updating...
      </span>
    );
  }
  if (view.errors.length > 0) {
    return (
      <span className="preview-calc-status is-error" role="status">
        Out of date
      </span>
    );
  }
  if (view.failureMessage !== null) {
    return (
      <span className="preview-calc-status is-error" role="status">
        {view.failureMessage}
      </span>
    );
  }
  if (view.calculation !== null) {
    return (
      <span className="preview-calc-status" role="status">
        Up to date
      </span>
    );
  }
  return null;
}

function EmptyState({ view, isBlank }: { view: CalculationView; isBlank: boolean }) {
  if (isBlank) {
    return (
      <div className="preview-empty">
        <p className="preview-empty-title">Live Pricing Summary</p>
        <p className="preview-empty-body">
          Enter seat count and add at least one product line to calculate pricing.
        </p>
      </div>
    );
  }
  if (view.errors.length > 0) {
    return (
      <div className="preview-empty">
        <p className="preview-empty-title">Action Required</p>
        <p className="preview-empty-body">
          Resolve the highlighted errors in the form to generate quote pricing.
        </p>
      </div>
    );
  }
  return (
    <div className="preview-empty">
      <p className="preview-empty-body">Calculating authoritative pricing...</p>
    </div>
  );
}

function LineItemsSummary({ calc, currency }: { calc: Calculation; currency: string }) {
  return (
    <div className="preview-lines" aria-label="Quoted products summary">
      {calc.lines.map((line) => (
        <div key={line.sku} className="preview-line">
          <span className="preview-line-name">{line.name}</span>
          <span className="preview-line-detail">
            {line.quantity} × {formatMoney(line.unit_price, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TotalsBlock({ calc, currency }: { calc: Calculation; currency: string }) {
  return (
    <div className="preview-totals">
      <div className="totals-row">
        <span className="totals-label">Subtotal</span>
        <span className="totals-value">{formatMoney(calc.subtotal, currency)}</span>
      </div>
      <div className="totals-row totals-row-discount">
        <span className="totals-label">Discount ({formatPercent(calc.discount_pct)})</span>
        <span className="totals-value">-{formatMoney(calc.discount_amount, currency)}</span>
      </div>
      <hr className="totals-divider" />
      <div className="totals-row totals-row-total">
        <span className="totals-label">Total</span>
        <span className="totals-value">{formatMoney(calc.total, currency)}</span>
      </div>
    </div>
  );
}

function ApprovalBox({
  calc,
  rules,
  currency,
}: {
  calc: Calculation;
  rules: ApprovalRules;
  currency: string;
}) {
  if (calc.approval_required) {
    return (
      <div className="approval-block approval-block-required">
        <div className="approval-heading approval-heading-required">Approval Required</div>
        <ul className="approval-reasons">
          {calc.approval_reasons.map((reason) => (
            <li key={reason}>{describeReason(reason, rules, currency)}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="approval-block approval-block-ok">
      <div className="approval-heading approval-heading-ok">Approval Not Required</div>
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
      <div className="preview-header">
        <h2 id="preview-heading" className="preview-heading">
          Quote Preview
        </h2>
        <StatusIndicator view={view} />
      </div>
      {calculation === null ? (
        <EmptyState view={view} isBlank={isBlank} />
      ) : (
        <div className={"preview-body" + (isStale ? " preview-stale" : "")}>
          <div className="preview-tier-row">
            <span className={"badge badge-tier-" + calculation.tier.toLowerCase()}>
              {calculation.tier} Tier
            </span>
            <span className="preview-tier-seats">
              max {formatPercent(calculation.max_discount_pct)} discount
            </span>
          </div>
          <LineItemsSummary calc={calculation} currency={currency} />
          <TotalsBlock calc={calculation} currency={currency} />
          <ApprovalBox calc={calculation} rules={approvalRules} currency={currency} />
        </div>
      )}
    </section>
  );
}
