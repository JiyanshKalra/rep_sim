// Home page — the quote builder. Server component: just renders the layout shell and QuoteBuilder.
import QuoteBuilder from "../components/QuoteBuilder";

export default function Home() {
  return (
    <main className="page">
      <h1>New quote</h1>
      <QuoteBuilder />
    </main>
  );
}
