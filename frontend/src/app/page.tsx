// Home page — the quote builder. Server component: just renders the layout shell and QuoteBuilder.
import Link from "next/link";
import QuoteBuilder from "../components/QuoteBuilder";

export default function Home() {
  return (
    <main className="page">
      <div className="page-header">
        <h1>New quote</h1>
        <Link href="/quotes">Saved quotes</Link>
      </div>
      <QuoteBuilder />
    </main>
  );
}
