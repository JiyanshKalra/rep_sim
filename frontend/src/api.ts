// Typed HTTP client for the quote-service API.
// All expected failures (validation errors, 4xx) are returned as values, never thrown.

import type {
  ApiErrorItem,
  Calculation,
  Catalog,
  QuoteDraftPayload,
  QuoteSummary,
  SavedQuote,
  SaveQuotePayload,
  QuoteStatus,
  StatusChangePayload,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Every call resolves to one of these three shapes; callers switch on `ok` and then `kind`.
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "api"; status: number; errors: ApiErrorItem[] }
  | { ok: false; kind: "network"; message: string }
  | { ok: false; kind: "aborted" };

// Attempts to parse the response body as JSON; returns undefined on failure.
// Used instead of response.json() so parse errors never throw unexpectedly.
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

// Returns the API's errors array when the body has a non-empty one; otherwise one fallback item so callers always get ApiErrorItem[].
// Only the array itself is checked. Its items are trusted to match the API error format.
function toErrorItems(json: unknown): ApiErrorItem[] {
  if (typeof json === "object" && json !== null && "errors" in json && Array.isArray(json.errors) && json.errors.length > 0) {
    return json.errors;
  }
  return [
    {
      code: "unexpected_response",
      field: null,
      message:
        "The server sent a reply this page could not read. Please try again.",
    },
  ];
}

// Runs fetch and maps network/abort exceptions to ApiResult failure shapes.
// Kept separate so `request` stays under 25 lines.
async function fetchOrFail<T>(
  input: string,
  init: RequestInit,
): Promise<ApiResult<T> | Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, kind: "aborted" };
    }
    return {
      ok: false,
      kind: "network",
      message:
        "Could not reach the quote service. Check that the backend is running and try again.",
    };
  }
}

// Core fetch wrapper. Adds a JSON body only when `body` is defined so that
// GET requests without custom headers avoid a CORS preflight.
async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  const init: RequestInit = { method, signal, cache: "no-store" };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  const result = await fetchOrFail<T>(API_URL + path, init);
  if (!(result instanceof Response)) return result;
  const json = await readJson(result);
  if (result.ok && json !== undefined) {
    // Success body is trusted to match the API contract; the backend tests cover this.
    return { ok: true, data: json as T };
  }
  return { ok: false, kind: "api", status: result.status, errors: toErrorItems(json) };
}

// ---- Public API functions ----

export function getCatalog(signal?: AbortSignal): Promise<ApiResult<Catalog>> {
  return request<Catalog>("GET", "/api/catalog", undefined, signal);
}

export function calculateQuote(
  payload: QuoteDraftPayload,
  signal?: AbortSignal,
): Promise<ApiResult<Calculation>> {
  return request<Calculation>("POST", "/api/quotes/calculate", payload, signal);
}

export function saveQuote(
  payload: SaveQuotePayload,
): Promise<ApiResult<SavedQuote>> {
  return request<SavedQuote>("POST", "/api/quotes", payload);
}

export function listQuotes(
  signal?: AbortSignal,
): Promise<ApiResult<QuoteSummary[]>> {
  return request<QuoteSummary[]>("GET", "/api/quotes", undefined, signal);
}

export function getQuote(
  id: string,
  signal?: AbortSignal,
): Promise<ApiResult<SavedQuote>> {
  return request<SavedQuote>(
    "GET",
    "/api/quotes/" + encodeURIComponent(id),
    undefined,
    signal,
  );
}

export function changeQuoteStatus(
  id: string,
  status: QuoteStatus,
  reason?: string,
): Promise<ApiResult<SavedQuote>> {
  const body: StatusChangePayload = { status };
  if (reason !== undefined && reason.trim() !== "") {
    body.reason = reason.trim();
  }
  return request<SavedQuote>(
    "PATCH",
    `/api/quotes/${encodeURIComponent(id)}/status`,
    body,
  );
}
