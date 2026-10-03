// Top-level "use client" component: loads the catalog, holds form state, wires preview and save.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiErrorItem, Catalog, QuoteFormState } from "../types";
import { getCatalog, saveQuote } from "../api";
import { toSavePayload } from "../payload";
import { placedFieldNames, unplacedMessages } from "../fieldErrors";
import { useCalculate } from "../useCalculate";
import QuoteForm from "./QuoteForm";
import QuotePreview from "./QuotePreview";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; catalog: Catalog };

function initialForm(): QuoteFormState {
  return { customerName: "", seats: "", lines: [], discountPct: "0", annualCommitment: false };
}

function useCatalog(): LoadState {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    getCatalog(controller.signal).then((res) => {
      if (!res.ok) {
        if (res.kind === "aborted") return;
        const msg = res.kind === "network" ? res.message : (res.errors[0]?.message ?? "Unknown error");
        setLoad({ kind: "error", message: msg });
        return;
      }
      setLoad({ kind: "ready", catalog: res.data });
    });
    return () => controller.abort();
  }, []);
  return load;
}

function useQuoteSave(form: QuoteFormState) {
  const router = useRouter();
  const [saveErrors, setSaveErrors] = useState<ApiErrorItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveErrors([]);
    setIsSaving(true);
    const res = await saveQuote(toSavePayload(form));
    setIsSaving(false);
    if (res.ok) {
      router.push("/quotes/" + res.data.id);
      return;
    }
    if (res.kind === "api") setSaveErrors(res.errors);
    else if (res.kind === "network") setSaveErrors([{ code: "network", field: null, message: res.message }]);
  }

  function clearErrors() {
    if (saveErrors.length > 0) setSaveErrors([]);
  }

  return { saveErrors, isSaving, handleSubmit, clearErrors };
}

function ProblemsBox({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <div role="alert" className="problems-box" style={{ marginTop: "var(--space-4)" }}>
      <ul>
        {problems.map((msg) => (
          <li key={msg}>{msg}</li>
        ))}
      </ul>
    </div>
  );
}

function QuoteBuilderReady({ catalog }: { catalog: Catalog }) {
  const [form, setForm] = useState<QuoteFormState>(initialForm);
  const { saveErrors, isSaving, handleSubmit, clearErrors } = useQuoteSave(form);
  const view = useCalculate({
    seats: form.seats,
    lines: form.lines,
    discountPct: form.discountPct,
    annualCommitment: form.annualCommitment,
  });

  function handleFormChange(next: QuoteFormState) {
    if (next.customerName !== form.customerName) clearErrors();
    setForm(next);
  }

  const placed = placedFieldNames(form.lines.length);
  const problems = unplacedMessages(view.errors, placed).concat(unplacedMessages(saveErrors, placed));

  return (
    <form className="builder" onSubmit={handleSubmit} noValidate>
      <div>
        <QuoteForm
          form={form}
          catalog={catalog}
          errors={view.errors}
          saveErrors={saveErrors}
          isSaving={isSaving}
          maxDiscountPct={view.calculation?.max_discount_pct ?? null}
          onChange={handleFormChange}
        />
        <ProblemsBox problems={problems} />
      </div>
      <QuotePreview
        view={view}
        approvalRules={catalog.approval_rules}
        isBlank={form.seats.trim() === "" && form.lines.length === 0}
      />
    </form>
  );
}

export default function QuoteBuilder() {
  const load = useCatalog();
  if (load.kind === "loading") {
    return <div className="state-loading">Loading catalog configuration...</div>;
  }
  if (load.kind === "error") {
    return (
      <div className="state-error" role="alert">
        <p>{load.message}</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => window.location.reload()}
          style={{ marginTop: "var(--space-2)" }}
        >
          Refresh Page
        </button>
      </div>
    );
  }
  return <QuoteBuilderReady catalog={load.catalog} />;
}
