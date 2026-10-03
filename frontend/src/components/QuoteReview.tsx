// Quote review page showing customer info, quoted snapshot, catalog drift banner, and status buttons.
// Manages quote lifecycle transitions and server conflict errors (R6).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Catalog, QuoteStatus, SavedQuote } from "../types";
import { changeQuoteStatus, getCatalog, getQuote } from "../api";
import { describeStatus } from "../display";
import QuoteResult from "./QuoteResult";
import StatusActions from "./StatusActions";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; quote: SavedQuote; catalog: Catalog };

function useQuoteReviewData(id: string | undefined): [LoadState, (q: SavedQuote) => void] {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    Promise.all([getQuote(id, controller.signal), getCatalog(controller.signal)]).then(
      ([qRes, cRes]) => {
        if (!qRes.ok) {
          if (qRes.kind !== "aborted") {
            const msg = qRes.kind === "network" ? qRes.message : (qRes.errors[0]?.message ?? "Error");
            setState({ kind: "error", message: msg });
          }
          return;
        }
        if (!cRes.ok) {
          if (cRes.kind !== "aborted") {
            const msg = cRes.kind === "network" ? cRes.message : (cRes.errors[0]?.message ?? "Error");
            setState({ kind: "error", message: msg });
          }
          return;
        }
        setState({ kind: "ready", quote: qRes.data, catalog: cRes.data });
      },
    );
    return () => controller.abort();
  }, [id]);
  return [state, (quote: SavedQuote) => setState((prev) => (prev.kind === "ready" ? { ...prev, quote } : prev))];
}

function useStatusTransition(id: string, onSuccess: (q: SavedQuote) => void) {
  const [isChanging, setIsChanging] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  async function handleStatusChange(next: QuoteStatus) {
    setAlertMessage(null);
    setIsChanging(true);
    const res = await changeQuoteStatus(id, next);
    setIsChanging(false);
    if (res.ok) {
      onSuccess(res.data);
      return;
    }
    if (res.kind === "api") {
      setAlertMessage(res.errors.map((e) => e.message).join(" "));
    } else if (res.kind === "network") {
      setAlertMessage(res.message);
    }
  }

  return { isChanging, alertMessage, handleStatusChange };
}

function QuoteReviewReady({
  quote,
  catalog,
  onQuoteUpdate,
}: {
  quote: SavedQuote;
  catalog: Catalog;
  onQuoteUpdate: (q: SavedQuote) => void;
}) {
  const { isChanging, alertMessage, handleStatusChange } = useStatusTransition(
    quote.id,
    onQuoteUpdate,
  );
  const hasDrift = quote.lines.some((line) => line.catalog_status !== "ok");

  return (
    <div className="quote-review">
      <h1>{quote.customer_name}</h1>
      <p className="status-text">Status: {describeStatus(quote.status)}</p>
      {alertMessage && (
        <div role="alert" className="problems-box">
          <p>{alertMessage}</p>
        </div>
      )}
      {hasDrift && (
        <div role="status" className="banner">
          Some products changed in the catalog after this quote was saved. The prices below are the
          prices that were quoted.
        </div>
      )}
      <QuoteResult quote={quote} currency={quote.result.currency} approvalRules={catalog.approval_rules} />
      <StatusActions
        allowed={quote.allowed_next_statuses}
        isChanging={isChanging}
        onChange={handleStatusChange}
      />
    </div>
  );
}

export default function QuoteReview() {
  const params = useParams<{ id?: string }>();
  const id = typeof params?.id === "string" ? params.id : undefined;
  const [state, setQuote] = useQuoteReviewData(id);

  if (!id) return <p>Quote not found</p>;
  if (state.kind === "loading") return <p>Loading quote...</p>;
  if (state.kind === "error") {
    return (
      <div>
        <p>{state.message}</p>
        <Link href="/quotes">Back to saved quotes</Link>
      </div>
    );
  }
  return <QuoteReviewReady quote={state.quote} catalog={state.catalog} onQuoteUpdate={setQuote} />;
}
