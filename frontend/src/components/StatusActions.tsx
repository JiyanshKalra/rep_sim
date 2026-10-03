// Action buttons for moving a saved quote through its approval and submission lifecycle.
// Disables buttons during in-flight status transitions to prevent duplicate requests.

import type { QuoteStatus } from "../types";
import { statusActionLabel } from "../display";

interface Props {
  allowed: QuoteStatus[];
  isChanging: boolean;
  onChange(next: QuoteStatus): void;
}

export default function StatusActions({ allowed, isChanging, onChange }: Props) {
  if (allowed.length === 0) {
    return <p className="status-text">This quote is final. No further status changes are possible.</p>;
  }

  return (
    <div className="status-actions">
      {allowed.map((status) => (
        <button
          key={status}
          type="button"
          className="btn-primary"
          disabled={isChanging}
          onClick={() => onChange(status)}
        >
          {statusActionLabel(status)}
        </button>
      ))}
    </div>
  );
}
