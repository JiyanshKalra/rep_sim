// Saved quotes list page. Server component; QuotesList fetches data client-side.
import Link from "next/link";
import QuotesList from "../../components/QuotesList";

export default function QuotesPage() {
  return (
    <main className="page-wrapper">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Saved Quotes</h1>
            <p className="page-subtitle">Review and manage all saved deal desk quotes.</p>
          </div>
          <div className="page-actions">
            <Link href="/" className="btn btn-primary btn-sm">
              + New Quote
            </Link>
          </div>
        </div>
      </div>
      <QuotesList />
    </main>
  );
}
