// Tests for draft persistence and shape validation in draftStorage.ts.
// Verifies round-trip saving, shape guards against corrupted storage, and safe failure handling.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DRAFT_STORAGE_KEY,
  initialForm,
  loadDraft,
  saveDraft,
  clearDraft,
} from "./draftStorage";
import type { QuoteFormState } from "./types";

function createInMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, String(value));
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
  };
}

const sampleForm: QuoteFormState = {
  customerName: "Acme Corp",
  seats: "25",
  lines: [
    {
      id: "line-1",
      sku: "PLATFORM_CORE",
      quantity: "25",
    },
  ],
  discountPct: "10",
  annualCommitment: true,
};

describe("draftStorage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createInMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an equal form when saving and then loading a non-empty form", () => {
    saveDraft(sampleForm);
    const restored = loadDraft();
    expect(restored).toEqual(sampleForm);
  });

  describe("loadDraft corruption and shape validation", () => {
    it("returns null when no draft is stored", () => {
      expect(loadDraft()).toBeNull();
    });

    it("returns null and does not throw for invalid JSON", () => {
      localStorage.setItem(DRAFT_STORAGE_KEY, "not json");
      expect(loadDraft()).toBeNull();
    });

    it("returns null and does not throw for JSON null", () => {
      localStorage.setItem(DRAFT_STORAGE_KEY, "null");
      expect(loadDraft()).toBeNull();
    });

    it("returns null and does not throw for a JSON array", () => {
      localStorage.setItem(DRAFT_STORAGE_KEY, "[]");
      expect(loadDraft()).toBeNull();
    });

    it("returns null when a field has a wrong type (seats stored as a number)", () => {
      const invalid = { ...sampleForm, seats: 25 };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(invalid));
      expect(loadDraft()).toBeNull();
    });

    it("returns null when an object is missing a required field", () => {
      const invalid: Record<string, unknown> = { ...sampleForm };
      delete invalid.customerName;
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(invalid));
      expect(loadDraft()).toBeNull();
    });

    it("returns null when lines is not an array", () => {
      const invalid = { ...sampleForm, lines: "not-an-array" };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(invalid));
      expect(loadDraft()).toBeNull();
    });

    it("returns null when a line is missing its sku", () => {
      const invalid = {
        ...sampleForm,
        lines: [{ id: "line-1", quantity: "25" }],
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(invalid));
      expect(loadDraft()).toBeNull();
    });

    it("returns null when annual commitment is stored as a string", () => {
      const invalid = { ...sampleForm, annualCommitment: "true" };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(invalid));
      expect(loadDraft()).toBeNull();
    });
  });

  it("removes the draft key when saving the empty initial form", () => {
    saveDraft(sampleForm);
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();

    saveDraft(initialForm());
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("removes the draft key when calling clearDraft", () => {
    saveDraft(sampleForm);
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();

    clearDraft();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("returns null on loadDraft and does not throw on saveDraft or clearDraft when storage throws", () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error("SecurityError: Access is denied");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError: Access is denied");
      },
    };
    vi.stubGlobal("localStorage", throwingStorage);

    expect(loadDraft()).toBeNull();
    expect(() => saveDraft(sampleForm)).not.toThrow();
    expect(() => clearDraft()).not.toThrow();
  });
});
