// Saved quotes list view with customer links, status badges, and catalog currency.
// Pure client component that fetches quotes and catalog data on mount (R3).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { QuoteSummary } from "../types";
import { getCatalog, listQuotes } from "../api";
import { describeApproval, describeStatus, formatMoney, formatTimestamp } from "../display";

type ListState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; quotes: QuoteSummary[]; currency: string };

function useSavedQuotes(): ListState {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listQuotes(controller.signal), getCatalog(controller.signal)]).then(
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
        setState({ kind: "ready", quotes: qRes.data, currency: cRes.data.currency });
      },
    );
    return () => controller.abort();
  }, []);
  return state;
}

function QuotesTable({ quotes, currency }: { quotes: QuoteSummary[]; currency: string }) {
  return (
    <table className="preview-table">
      <caption>Saved quotes</caption>
      <thead>
        <tr>
          <th scope="col">Customer</th>
          <th scope="col" className="num-col">Seats</th>
          <th scope="col">Tier</th>
          <th scope="col" className="num-col">Total</th>
          <th scope="col">Approval</th>
          <th scope="col">Status</th>
          <th scope="col">Created</th>
        </tr>
      </thead>
      <tbody>
        {quotes.map((q) => (
          <tr key={q.id}>
            <td>
              <Link href={"/quotes/" + q.id}>{q.customer_name}</Link>
            </td>
            <td className="num-col">{q.seats}</td>
            <td>{q.tier}</td>
            <td className="num-col">{formatMoney(q.total, currency)}</td>
            <td>{describeApproval(q.approval_required)}</td>
            <td>{describeStatus(q.status)}</td>
            <td>{formatTimestamp(q.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function QuotesList() {
  const state = useSavedQuotes();
  if (state.kind === "loading") return <p>Loading quotes...</p>;
  if (state.kind === "error") return <p>{state.message} Refresh the page to try again.</p>;
  if (state.quotes.length === 0) {
    return (
      <p>
        No saved quotes yet. <Link href="/">Create the first quote</Link>
      </p>
    );
  }
  return <QuotesTable quotes={state.quotes} currency={state.currency} />;
}
