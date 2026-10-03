// Debounced hook that calls the calculate endpoint whenever the draft fields change.
// Stale in-flight requests are cancelled via AbortController so only the latest response updates state.

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

interface Answer {
  key: string;
  calculation: Calculation | null;
  errors: ApiErrorItem[];
  failureMessage: string | null;
}

function isBlank(f: DraftFormFields): boolean {
  return f.seats.trim() === "" && f.lines.length === 0;
}

function mapResultToAnswer(key: string, res: ApiResult<Calculation>): (prev: Answer) => Answer {
  return (prev) => {
    if (res.ok) return { key, calculation: res.data, errors: [], failureMessage: null };
    if (res.kind === "api") return { key, calculation: prev.calculation, errors: res.errors, failureMessage: null };
    if (res.kind === "network") return { key, calculation: prev.calculation, errors: [], failureMessage: res.message };
    return prev;
  };
}

export function useCalculate(fields: DraftFormFields): CalculationView {
  const { seats, lines, discountPct, annualCommitment } = fields;
  const currentKey = JSON.stringify(toDraftPayload({ seats, lines, discountPct, annualCommitment }));
  const [answer, setAnswer] = useState<Answer>({ key: "", calculation: null, errors: [], failureMessage: null });

  useEffect(() => {
    if (isBlank({ seats, lines, discountPct, annualCommitment })) return;
    const key = JSON.stringify(toDraftPayload({ seats, lines, discountPct, annualCommitment }));
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const res = await calculateQuote(toDraftPayload({ seats, lines, discountPct, annualCommitment }), controller.signal);
      if (controller.signal.aborted) return;
      setAnswer(mapResultToAnswer(key, res));
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [seats, lines, discountPct, annualCommitment]);

  if (isBlank({ seats, lines, discountPct, annualCommitment })) {
    return { calculation: null, errors: [], failureMessage: null, isUpdating: false };
  }
  return { calculation: answer.calculation, errors: answer.errors, failureMessage: answer.failureMessage, isUpdating: answer.key !== currentKey };
}
