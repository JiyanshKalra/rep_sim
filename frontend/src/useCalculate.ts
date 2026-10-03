// Debounced hook that asks the API to calculate the draft whenever the form fields change.
// The browser never calculates anything: it only keeps the latest answer the API sent.

import { useEffect, useState } from "react";
import type { ApiErrorItem, Calculation } from "./types";
import { type DraftFormFields, toDraftPayload } from "./payload";
import { type ApiResult, calculateQuote } from "./api";

export interface CalculationView {
  calculation: Calculation | null;
  errors: ApiErrorItem[];
  failureMessage: string | null;
  isUpdating: boolean;
}

const DEBOUNCE_MS = 400;

// The last API answer, plus the draft (as JSON text) it was calculated for.
interface Answer {
  key: string;
  calculation: Calculation | null;
  errors: ApiErrorItem[];
  failureMessage: string | null;
}

const EMPTY_ANSWER: Answer = { key: "", calculation: null, errors: [], failureMessage: null };

// Nothing to calculate until the rep has entered seats or added a product.
function isBlank(fields: DraftFormFields): boolean {
  return fields.seats.trim() === "" && fields.lines.length === 0;
}

// On an error we keep the previous calculation, so the rep still sees the last good preview (shown as out of date).
function nextAnswer(prev: Answer, key: string, result: ApiResult<Calculation>): Answer {
  if (result.ok) {
    return { key, calculation: result.data, errors: [], failureMessage: null };
  }
  if (result.kind === "api") {
    return { key, calculation: prev.calculation, errors: result.errors, failureMessage: null };
  }
  if (result.kind === "network") {
    return { key, calculation: prev.calculation, errors: [], failureMessage: result.message };
  }
  return prev;
}

export function useCalculate(fields: DraftFormFields): CalculationView {
  // Destructured because `fields` is a new object on every render; the effect must depend on the values only.
  const { seats, lines, discountPct, annualCommitment } = fields;
  const blank = isBlank(fields);
  const currentKey = JSON.stringify(toDraftPayload(fields));
  const [answer, setAnswer] = useState<Answer>(EMPTY_ANSWER);

  useEffect(() => {
    if (blank) return;
    const payload = toDraftPayload({ seats, lines, discountPct, annualCommitment });
    const key = JSON.stringify(payload);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await calculateQuote(payload, controller.signal);
      if (controller.signal.aborted) return;
      setAnswer((prev) => nextAnswer(prev, key, result));
    }, DEBOUNCE_MS);
    // Cleanup runs when the fields change again. It cancels the waiting timer and the request in flight,
    // so an old response can never overwrite a newer one.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [blank, seats, lines, discountPct, annualCommitment]);

  if (blank) {
    return { calculation: null, errors: [], failureMessage: null, isUpdating: false };
  }
  // isUpdating: the stored answer was calculated for an older draft than the one on screen.
  return {
    calculation: answer.calculation,
    errors: answer.errors,
    failureMessage: answer.failureMessage,
    isUpdating: answer.key !== currentKey,
  };
}
