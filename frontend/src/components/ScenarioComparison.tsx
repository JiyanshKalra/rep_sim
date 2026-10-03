// Side-by-side scenario comparison panel highlighting pricing and line differences.
// Compares string values directly from API responses without browser arithmetic (rule 6).

import type { ApprovalRules, Calculation } from "../types";
import type { CalculationView } from "../useCalculate";
import { compareLines, type LineDiff } from "../compareLines";
import { describeApproval, describeReason, formatMoney, formatPercent } from "../display";

interface Props {
  viewA: CalculationView;
  viewB: CalculationView;
  seatsA: string;
  seatsB: string;
  approvalRules: ApprovalRules;
  customerName: string;
}

function isScenarioReady(view: CalculationView): view is CalculationView & { calculation: Calculation } {
  return (
    view.calculation !== null &&
    !view.isUpdating &&
    view.errors.length === 0 &&
    view.failureMessage === null
  );
}

function ComparisonRow({
  label,
  valueA,
  valueB,
  isDiff,
}: {
  label: string;
  valueA: string;
  valueB: string;
  isDiff: boolean;
}) {
  return (
    <tr className={isDiff ? "comparison-row comparison-row-diff" : "comparison-row"}>
      <td className="comparison-label">{label}</td>
      <td className="comparison-val-a">{valueA}</td>
      <td className="comparison-val-b">{valueB}</td>
    </tr>
  );
}

function statusBadgeText(status: LineDiff["status"]): string {
  switch (status) {
    case "same":
      return "same";
    case "only_in_a":
      return "only in A";
    case "only_in_b":
      return "only in B";
    case "quantity_differs":
      return "quantity differs";
  }
}

function ProductDiffsBlock({ diffs }: { diffs: LineDiff[] }) {
  return (
    <div className="comparison-section">
      <h3 className="comparison-section-title">Products Comparison</h3>
      <table className="comparison-table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="num">Scenario A Qty</th>
            <th className="num">Scenario B Qty</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((diff) => (
            <tr key={diff.sku} className={diff.status !== "same" ? "comparison-row-diff" : ""}>
              <td>{diff.name} ({diff.sku})</td>
              <td className="num">{diff.quantityA !== null ? diff.quantityA : "—"}</td>
              <td className="num">{diff.quantityB !== null ? diff.quantityB : "—"}</td>
              <td>
                <span className={"badge badge-diff-" + diff.status.replace(/_/g, "-")}>
                  {statusBadgeText(diff.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalSummary({
  calc,
  rules,
  currency,
}: {
  calc: Calculation;
  rules: ApprovalRules;
  currency: string;
}) {
  return (
    <div className="approval-summary-col">
      <span className={calc.approval_required ? "approval-tag is-required" : "approval-tag is-ok"}>
        {describeApproval(calc.approval_required)}
      </span>
      {calc.approval_reasons.length > 0 && (
        <ul className="approval-reasons-list">
          {calc.approval_reasons.map((r) => (
            <li key={r}>{describeReason(r, rules, currency)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ScenarioComparison({
  viewA,
  viewB,
  seatsA,
  seatsB,
  approvalRules,
  customerName,
}: Props) {
  if (!isScenarioReady(viewA) || !isScenarioReady(viewB)) {
    return (
      <div className="card comparison-card" style={{ marginTop: "var(--space-6)" }}>
        <div className="card-header">
          <h2 className="card-title">Scenario Comparison</h2>
        </div>
        <div className="comparison-not-ready" role="status">
          <p className="comparison-not-ready-msg">Fix both scenarios to compare.</p>
        </div>
    </div>
  );
  }

  const calcA = viewA.calculation;
  const calcB = viewB.calculation;
  const currency = calcA.currency;
  const diffs = compareLines(calcA.lines, calcB.lines);

  return (
    <div className="card comparison-card" style={{ marginTop: "var(--space-6)" }}>
      <div className="card-header">
        <h2 className="card-title">Scenario Comparison</h2>
        {customerName.trim() !== "" && (
          <p className="card-subtitle">Customer: {customerName.trim()}</p>
        )}
      </div>

      <div className="comparison-body">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Scenario A</th>
              <th>Scenario B</th>
            </tr>
          </thead>
          <tbody>
            <ComparisonRow
              label="Seats"
              valueA={seatsA}
              valueB={seatsB}
              isDiff={seatsA !== seatsB}
            />
            <ComparisonRow
              label="Tier"
              valueA={calcA.tier}
              valueB={calcB.tier}
              isDiff={calcA.tier !== calcB.tier}
            />
            <ComparisonRow
              label="Discount %"
              valueA={formatPercent(calcA.discount_pct)}
              valueB={formatPercent(calcB.discount_pct)}
              isDiff={calcA.discount_pct !== calcB.discount_pct}
            />
            <ComparisonRow
              label="Discount Amount"
              valueA={formatMoney(calcA.discount_amount, currency)}
              valueB={formatMoney(calcB.discount_amount, currency)}
              isDiff={calcA.discount_amount !== calcB.discount_amount}
            />
            <ComparisonRow
              label="Subtotal"
              valueA={formatMoney(calcA.subtotal, currency)}
              valueB={formatMoney(calcB.subtotal, currency)}
              isDiff={calcA.subtotal !== calcB.subtotal}
            />
            <ComparisonRow
              label="Total"
              valueA={formatMoney(calcA.total, currency)}
              valueB={formatMoney(calcB.total, currency)}
              isDiff={calcA.total !== calcB.total}
            />
            <tr className={calcA.approval_required !== calcB.approval_required ? "comparison-row comparison-row-diff" : "comparison-row"}>
              <td className="comparison-label">Approval</td>
              <td>
                <ApprovalSummary calc={calcA} rules={approvalRules} currency={currency} />
              </td>
              <td>
                <ApprovalSummary calc={calcB} rules={approvalRules} currency={currency} />
              </td>
            </tr>
          </tbody>
        </table>

        <ProductDiffsBlock diffs={diffs} />
      </div>
    </div>
  );
}
