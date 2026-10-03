// Top-level "use client" component: loads the catalog, holds form state, wires preview and save.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiErrorItem, Catalog, QuoteFormState } from "../types";
import { getCatalog, saveQuote } from "../api";
import { toSavePayload } from "../payload";
import { placedFieldNames, unplacedMessages } from "../fieldErrors";
import { useCalculate } from "../useCalculate";
import { clearDraft, initialForm, loadDraft, saveDraft } from "../draftStorage";
import QuoteForm from "./QuoteForm";
import QuotePreview from "./QuotePreview";
import ScenarioSection from "./ScenarioSection";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; catalog: Catalog };

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
      clearDraft();
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
  const [draftChecked, setDraftChecked] = useState(false);
  const [restoredNote, setRestoredNote] = useState(false);

  const { saveErrors, isSaving, handleSubmit, clearErrors } = useQuoteSave(form);
  const view = useCalculate({
    seats: form.seats,
    lines: form.lines,
    discountPct: form.discountPct,
    annualCommitment: form.annualCommitment,
  });

  // Restore draft once after mount. Initial render uses initialForm() to prevent hydration mismatches.
  useEffect(() => {
    const saved = loadDraft();
    if (saved !== null) {
      // Synchronizing from browser localStorage after mount avoids SSR hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(saved);
      setRestoredNote(true);
    }
    setDraftChecked(true);
  }, []);

  // The save effect must do nothing until draftChecked is true;
  // otherwise the first render would erase the stored draft before it is restored.
  useEffect(() => {
    if (!draftChecked) return;
    saveDraft(form);
  }, [form, draftChecked]);

  function handleFormChange(next: QuoteFormState) {
    if (next.customerName !== form.customerName) clearErrors();
    setForm(next);
  }

  function handleStartOver() {
    setForm(initialForm());
    clearDraft();
    setRestoredNote(false);
    clearErrors();
  }

  const placed = placedFieldNames(form.lines.length);
  const problems = unplacedMessages(view.errors, placed).concat(unplacedMessages(saveErrors, placed));

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-4)",
          gap: "var(--space-3)",
        }}
      >
        <div>
          {restoredNote && (
            <p role="status" style={{ margin: 0, color: "var(--color-text-muted)" }}>
              Restored your unsaved draft.
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleStartOver}
        >
          Start over
        </button>
      </div>

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
      <ScenarioSection
        formA={form}
        viewA={view}
        catalog={catalog}
        approvalRules={catalog.approval_rules}
      />
    </div>
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
