// Saved quotes list view with customer links, status badges, and catalog currency.
// Pure client component that fetches quotes and catalog data on mount (R3).
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  return (
    <div className="quotes-table-wrap">
      <table className="quotes-table">
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col" className="col-num">Seats</th>
            <th scope="col">Tier</th>
            <th scope="col" className="col-num">Total</th>
            <th scope="col">Approval</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr
              key={q.id}
              className="quotes-table-row"
              onClick={() => router.push("/quotes/" + q.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push("/quotes/" + q.id); }}
              tabIndex={0}
              aria-label={"View quote for " + q.customer_name}
            >
              <td className="quotes-table-customer">{q.customer_name}</td>
              <td className="col-num">{q.seats}</td>
              <td><span className={"badge badge-tier-" + q.tier.toLowerCase()}>{q.tier}</span></td>
              <td className="col-total">{formatMoney(q.total, currency)}</td>
              <td>
                <span className={"badge " + (q.approval_required ? "badge-approval-req" : "badge-approval-ok")}>
                  {describeApproval(q.approval_required)}
                </span>
              </td>
              <td><span className={"badge badge-status-" + q.status.toLowerCase()}>{describeStatus(q.status)}</span></td>
              <td className="col-muted">{formatTimestamp(q.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function QuotesList() {
  const state = useSavedQuotes();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  if (state.kind === "loading") {
    return <div className="state-loading">Loading saved quotes...</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="state-error" role="alert">
        <p>{state.message}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }
  if (state.quotes.length === 0) {
    return (
      <div className="state-empty card">
        <h3 className="state-empty-title">No saved quotes yet</h3>
        <p className="state-empty-body">Create your first quote to see authoritative pricing and manage approvals.</p>
        <Link href="/" className="btn btn-primary btn-sm">+ Create First Quote</Link>
      </div>
    );
  }

  const filteredQuotes = state.quotes.filter((q) => {
    const term = searchQuery.trim().toLowerCase();
    const matchesSearch =
      term === "" ||
      q.customer_name.toLowerCase().includes(term) ||
      q.id.toLowerCase().includes(term);
    const matchesStatus = statusFilter === "all" || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <div className="quotes-filter-row">
        <div className="quotes-filter-search">
          <input
            type="search"
            className="form-input"
            placeholder="Search by customer or quote ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search quotes"
          />
        </div>
        <div className="quotes-filter-status">
          <label htmlFor="status-filter-select" className="quotes-filter-label">Status</label>
          <select
            id="status-filter-select"
            className="form-input quotes-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        {(searchQuery.trim() !== "" || statusFilter !== "all") && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}
          >
            Clear
          </button>
        )}
      </div>

      {filteredQuotes.length === 0 ? (
        <div className="state-empty card">
          <p className="state-empty-title">No quotes match your search</p>
          <p className="state-empty-body">Try adjusting your search or filter.</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <QuotesTable quotes={filteredQuotes} currency={state.currency} />
      )}
    </div>
  );
}
