// Action buttons for moving a saved quote through its approval and submission lifecycle.
// Disables buttons during in-flight status transitions to prevent duplicate requests.
"use client";

import { useState } from "react";
import type { QuoteStatus } from "../types";
import { statusActionLabel } from "../display";

interface Props {
  allowed: QuoteStatus[];
  isChanging: boolean;
  onChange(next: QuoteStatus, reason?: string): void;
}

function getButtonClass(action: QuoteStatus): string {
  switch (action) {
    case "submitted":
      return "btn btn-primary";
    case "approved":
      return "btn btn-primary";
    case "rejected":
      return "btn btn-danger";
    case "draft":
      return "btn btn-secondary";
  }
}

export default function StatusActions({ allowed, isChanging, onChange }: Props) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  if (allowed.length === 0) {
    return (
      <div className="status-actions-panel">
        <div className="status-actions-header">Quote Actions</div>
        <div className="status-actions-body">
          <p className="status-final-note">
            This quote is final. No further status changes are possible.
          </p>
        </div>
      </div>
    );
  }

  function handleActionClick(action: QuoteStatus) {
    if (action === "rejected") {
      setShowRejectForm(true);
      setRejectReason("");
      setRejectError(null);
      return;
    }
    onChange(action);
  }

  function handleConfirmReject() {
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      setRejectError("A non-empty rejection reason is required.");
      return;
    }
    setRejectError(null);
    setShowRejectForm(false);
    onChange("rejected", trimmed);
  }

  return (
    <div className="status-actions-panel">
      <div className="status-actions-header">Actions</div>
      <div className="status-actions-body">
        {showRejectForm ? (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <label htmlFor="rejection-reason-input" className="form-label">
              Rejection Reason <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <input
              id="rejection-reason-input"
              type="text"
              className="form-input"
              placeholder="e.g. Discount exceeds target margin"
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (rejectError) setRejectError(null);
              }}
              autoFocus
            />
            {rejectError && (
              <p style={{ color: "var(--color-danger)", fontSize: "var(--font-size-xs)" }}>
                {rejectError}
              </p>
            )}
            <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isChanging}
                onClick={handleConfirmReject}
              >
                {isChanging ? "Rejecting..." : "Confirm Rejection"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isChanging}
                onClick={() => {
                  setShowRejectForm(false);
                  setRejectError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          allowed.map((action) => (
            <button
              key={action}
              type="button"
              className={getButtonClass(action)}
              disabled={isChanging}
              onClick={() => handleActionClick(action)}
            >
              {isChanging ? "Updating..." : statusActionLabel(action)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
