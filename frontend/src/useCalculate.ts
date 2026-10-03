// Debounced hook that calls the calculate endpoint whenever the draft fields change.
// Stale in-flight requests are cancelled via AbortController so only the latest response updates state.

import { useEffect, useState } from "react";
import type { ApiErrorItem, Calculation } from "./types";
import { type DraftFormFields, toDraftPayload } from "./payload";
import { calculateQuote } from "./api";

export interface CalculationView {
  calculation: Calculation | null;
  errors: ApiErrorItem[];
  failureMessage: string | null;
  isUpdating: boolean;
}

// How long (ms) to wait after the last keystroke before sending the request.
const DEBOUNCE_MS = 400;

// Shape stored in state so we know which key the last successful response belonged to.
interface Answer {
  key: string;
  calculation: Calculation | null;
  errors: ApiErrorItem[];
  failureMessage: string | null;
}

// "Blank" means no seats typed and no lines added — making a request would only return noise.
function isBlank(fields: DraftFormFields): boolean {
  return fields.seats.trim() === "" && fields.lines.length === 0;
}

export function useCalculate(fields: DraftFormFields): CalculationView {
  const { seats, lines, discountPct, annualCommitment } = fields;

  // currentKey represents the payload we would send right now — used to detect staleness.
  const currentKey = JSON.stringify(toDraftPayload({ seats, lines, discountPct, annualCommitment }));

  const [answer, setAnswer] = useState<Answer>({
    key: "",
    calculation: null,
    errors: [],
    failureMessage: null,
  });

  useEffect(() => {
    // When the fields are blank there is nothing useful to calculate; skip silently.
    if (isBlank({ seats, lines, discountPct, annualCommitment })) {
      return;
    }

    // key is computed inside the effect so it is always fresh for this particular run.
    // Each effect invocation closes over its own seats/lines/discountPct/annualCommitment values.
    const key = JSON.stringify(toDraftPayload({ seats, lines, discountPct, annualCommitment }));

    // Create a new controller for this round; cancelling it drops the timer AND the in-flight request.
    // This is the mechanism that prevents stale responses from overwriting fresh ones.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await calculateQuote(
        toDraftPayload({ seats, lines, discountPct, annualCommitment }),
        controller.signal,
      );

      // If the controller was aborted (component unmounted or fields changed again), discard the result.
      if (controller.signal.aborted) return;

      if (result.ok) {
        setAnswer({ key, calculation: result.data, errors: [], failureMessage: null });
      } else if (result.kind === "api") {
        // Keep the previous calculation visible (stale) so the rep can see what changed.
        setAnswer((prev) => ({
          key,
          calculation: prev.calculation,
          errors: result.errors,
          failureMessage: null,
        }));
      } else if (result.kind === "network") {
        // Keep the previous calculation visible (stale) and show the connectivity message.
        setAnswer((prev) => ({
          key,
          calculation: prev.calculation,
          errors: [],
          failureMessage: result.message,
        }));
      }
      // kind "aborted" is already handled by the controller.signal.aborted guard above.
    }, DEBOUNCE_MS);

    // Cleanup: clear the timer to debounce; abort to cancel an already-sent request.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Intentional: only the four draft fields are listed — customer name must not retrigger (UX).
  }, [seats, lines, discountPct, annualCommitment]);

  // Blank fields: return an empty view immediately without waiting for the effect.
  if (isBlank({ seats, lines, discountPct, annualCommitment })) {
    return { calculation: null, errors: [], failureMessage: null, isUpdating: false };
  }

  // isUpdating is true whenever the answer in state does not yet match what the user has typed.
  const isUpdating = answer.key !== currentKey;
  return {
    calculation: answer.calculation,
    errors: answer.errors,
    failureMessage: answer.failureMessage,
    isUpdating,
  };
}
