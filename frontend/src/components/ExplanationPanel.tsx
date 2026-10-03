// Shared toggle panel that shows the backend plain-English explanation of a price.
// Imported into QuotePreview and QuoteResult; each passes its Calculation.explanation array.
// The frontend never builds or reformats these lines -- it renders them exactly as returned (rule R8).
"use client";

import { useState, useId } from "react";

interface Props {
  lines: string[];
}

// Returns null when list is empty so callers never need to guard (design: no button for empty arrays).
export default function ExplanationPanel({ lines }: Props): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  // useId gives the panel a unique id so the button aria-controls can point to it,
  // even when two ExplanationPanels are mounted on the same page simultaneously.
  const panelId = useId();

  if (lines.length === 0) {
    return null;
  }

  return (
    <div className="explanation-wrap">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? "Hide explanation" : "Explain pricing"}
      </button>
      {open && (
        <div id={panelId} className="explanation-panel">
          <h3 className="explanation-heading">How this price was calculated</h3>
          <ul className="explanation-lines">
            {lines.map((line, index) => (
              // Index key is acceptable: the list is read-only and always re-rendered whole.
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
