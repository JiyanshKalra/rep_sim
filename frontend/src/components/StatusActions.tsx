// Action buttons for moving a saved quote through its approval and submission lifecycle.
// Disables buttons during in-flight status transitions to prevent duplicate requests.

import type { QuoteStatus } from "../types";
import { statusActionLabel } from "../display";

interface Props {
  allowed: QuoteStatus[];
  isChanging: boolean;
  onChange(next: QuoteStatus): void;
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

  return (
    <div className="status-actions-panel">
      <div className="status-actions-header">Actions</div>
      <div className="status-actions-body">
        {allowed.map((action) => (
          <button
            key={action}
            type="button"
            className={getButtonClass(action)}
            disabled={isChanging}
            onClick={() => onChange(action)}
          >
            {isChanging ? "Updating..." : statusActionLabel(action)}
          </button>
        ))}
      </div>
    </div>
  );
}
