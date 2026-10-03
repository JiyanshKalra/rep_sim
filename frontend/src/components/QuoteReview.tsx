// Quote review page showing customer info, quoted snapshot, catalog drift banner, and status buttons.
// Manages quote lifecycle transitions and server conflict errors (R6).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Catalog, QuoteStatus, SavedQuote } from "../types";
import { changeQuoteStatus, getCatalog, getQuote } from "../api";
import { describeStatus, formatMoney, formatPercent, formatTimestamp } from "../display";
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
  const currency = quote.result.currency;

  return (
    <div className="review-layout">
      {/* Top Identity Hero: WHO, HOW MUCH, WHAT STATUS, DOES IT NEED APPROVAL */}
      <div className="review-identity">
        <div className="review-identity-header">
          <div>
            <h1 className="review-customer-name">{quote.customer_name}</h1>
            <p className="page-subtitle">Quote Reference: {quote.id}</p>
          </div>
          <div className="review-identity-meta">
            <span className={"badge badge-status-" + quote.status.toLowerCase()}>
              {describeStatus(quote.status)}
            </span>
            <span className={"badge badge-tier-" + quote.result.tier.toLowerCase()}>
              {quote.result.tier} Tier
            </span>
          </div>
        </div>
        <div className="review-identity-body">
          <div className="review-stat">
            <div className="review-stat-label">Total Payable</div>
            <div className="review-stat-value-total">{formatMoney(quote.result.total, currency)}</div>
          </div>
          <div className="review-stat">
            <div className="review-stat-label">Seats &amp; Tier</div>
            <div className="review-stat-value">
              {quote.seats} seats &bull; {quote.result.tier}
            </div>
          </div>
          <div className="review-stat">
            <div className="review-stat-label">Discount &amp; Terms</div>
            <div className="review-stat-value">
              {formatPercent(quote.result.discount_pct)} discount &bull;{" "}
              {quote.annual_commitment ? "Annual commitment" : "No commitment"}
            </div>
          </div>
          <div className="review-stat">
            <div className="review-stat-label">Quoted On</div>
            <div className="review-stat-value">{formatTimestamp(quote.created_at)}</div>
          </div>
        </div>
      </div>

      {alertMessage && (
        <div role="alert" className="problems-box">
          <p>{alertMessage}</p>
        </div>
      )}

      {hasDrift && (
        <div role="status" className="alert alert-warning">
          <span>
            <strong>Catalog Drift:</strong> Some products changed in the catalog after this quote was
            saved. The prices below reflect the original quoted snapshot.
          </span>
        </div>
      )}

      <QuoteResult
        quote={quote}
        currency={quote.result.currency}
        approvalRules={catalog.approval_rules}
      />

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
  if (state.kind === "loading") {
    return <div className="state-loading">Loading quote details...</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="state-error" role="alert">
        <p>{state.message}</p>
        <Link href="/quotes" className="btn btn-secondary btn-sm" style={{ marginTop: "var(--space-2)" }}>
          Back to saved quotes
        </Link>
      </div>
    );
  }
  return <QuoteReviewReady quote={state.quote} catalog={state.catalog} onQuoteUpdate={setQuote} />;
}
