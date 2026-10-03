// Server component page displaying the saved quotes list.
// Renders the page title, new quote navigation link, and the QuotesList table.
import Link from "next/link";
import QuotesList from "../../components/QuotesList";

export default function QuotesPage() {
  return (
    <main className="page">
      <div className="page-header">
        <h1>Saved quotes</h1>
        <Link href="/">New quote</Link>
      </div>
      <QuotesList />
    </main>
  );
}
