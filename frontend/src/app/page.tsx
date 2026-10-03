// Placeholder home page — proves the frontend can reach the backend catalog endpoint.
// A later task replaces this with the full quote-builder form.
"use client";

import { useEffect, useState } from "react";
import { getCatalog } from "../api";

type State =
  | { kind: "loading" }
  | { kind: "ready"; products: number; tiers: number }
  | { kind: "error"; message: string };

export default function Home() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    getCatalog(controller.signal).then((result) => {
      if (!result.ok) {
        // "aborted" means the component unmounted; ignore it so state stays clean.
        if (result.kind === "aborted") return;
        const message =
          result.kind === "network"
            ? result.message
            : result.errors[0]?.message ?? "Unknown error";
        setState({ kind: "error", message });
        return;
      }
      setState({
        kind: "ready",
        products: result.data.products.length,
        tiers: result.data.tiers.length,
      });
    });

    // Abort the in-flight fetch when the component unmounts.
    return () => controller.abort();
  }, []);

  const text =
    state.kind === "loading"
      ? "Connecting to the quote service..."
      : state.kind === "ready"
        ? `Connected to the quote service: ${state.products} products, ${state.tiers} tiers.`
        : state.message;

  return (
    <main>
      <h1>Deal Desk Quote Simulator</h1>
      <p>{text}</p>
    </main>
  );
}
