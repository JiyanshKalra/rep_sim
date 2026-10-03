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

// If the body has a non-empty errors array, return it; otherwise wrap in a
// single fallback so callers always get an ApiErrorItem[].
function toErrorItems(json: unknown): ApiErrorItem[] {
  if (
    json !== null &&
    typeof json === "object" &&
    "errors" in json &&
    Array.isArray((json as Record<string, unknown>)["errors"]) &&
    ((json as Record<string, unknown>)["errors"] as unknown[]).length > 0
  ) {
    // Shape already validated above; cast is safe (error body matches API contract).
    return (json as { errors: ApiErrorItem[] }).errors;
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
  let response: Response;
  try {
    response = await fetch(API_URL + path, init);
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
  const json = await readJson(response);
  if (response.ok && json !== undefined) {
    // Success body is trusted to match the API contract; the backend tests cover this.
    return { ok: true, data: json as T };
  }
  return { ok: false, kind: "api", status: response.status, errors: toErrorItems(json) };
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
): Promise<ApiResult<SavedQuote>> {
  const body: StatusChangePayload = { status };
  return request<SavedQuote>(
    "PATCH",
    `/api/quotes/${encodeURIComponent(id)}/status`,
    body,
  );
}
