// Manages Scenario B creation, state, calculation lifecycle, and side-by-side comparison.
// Scenario B is a temporary working scenario and is never persisted to localStorage (rule 3).
"use client";

import { useState } from "react";
import type { ApprovalRules, Catalog, QuoteFormState } from "../types";
import { useCalculate, type CalculationView } from "../useCalculate";
import QuoteForm from "./QuoteForm";
import ScenarioComparison from "./ScenarioComparison";

interface Props {
  formA: QuoteFormState;
  viewA: CalculationView;
  catalog: Catalog;
  approvalRules: ApprovalRules;
}

// Fixed empty fallback passed when Scenario B is inactive; hook returns immediately on blank (rule 2).
const EMPTY_FIELDS = { seats: "", lines: [], discountPct: "0", annualCommitment: false };

export default function ScenarioSection({
  formA,
  viewA,
  catalog,
  approvalRules,
}: Props) {
  const [formB, setFormB] = useState<QuoteFormState | null>(null);

  const viewB = useCalculate(
    formB
      ? {
          seats: formB.seats,
          lines: formB.lines,
          discountPct: formB.discountPct,
          annualCommitment: formB.annualCommitment,
        }
      : EMPTY_FIELDS,
  );

  function handleAddScenarioB() {
    // Copies A's current configuration into B; line IDs prefixed with "b-" to prevent key collisions (rule 1).
    setFormB({
      customerName: "",
      seats: formA.seats,
      lines: formA.lines.map((l) => ({ ...l, id: "b-" + l.id })),
      discountPct: formA.discountPct,
      annualCommitment: formA.annualCommitment,
    });
  }

  function handleRemoveScenarioB() {
    setFormB(null);
  }

  if (formB === null) {
    return (
      <div className="add-scenario-b-row" style={{ marginTop: "var(--space-6)" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleAddScenarioB}
        >
          + Add scenario B
        </button>
      </div>
    );
  }

  return (
    <div className="scenario-b-section" style={{ marginTop: "var(--space-8)" }}>
      <div className="scenario-b-header">
        <div>
          <h2 className="scenario-b-title">Scenario B</h2>
          <p className="scenario-b-subtitle">
            Experiment with alternative seat counts, lines, or discounts. Customer is shared with Scenario A.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={handleRemoveScenarioB}
        >
          Remove scenario B
        </button>
      </div>

      <div className="scenario-b-form-wrap" style={{ marginTop: "var(--space-4)" }}>
        <QuoteForm
          form={formB}
          catalog={catalog}
          errors={viewB.errors}
          saveErrors={[]}
          isSaving={false}
          maxDiscountPct={viewB.calculation?.max_discount_pct ?? null}
          onChange={setFormB}
          hideCustomerName={true}
          hideSaveButton={true}
          idPrefix="b-"
        />
      </div>

      <ScenarioComparison
        viewA={viewA}
        viewB={viewB}
        seatsA={formA.seats}
        seatsB={formB.seats}
        approvalRules={approvalRules}
        customerName={formA.customerName}
      />
    </div>
  );
}
