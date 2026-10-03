// Home page: quote builder. Server component rendering the page wrapper and QuoteBuilder.
import QuoteBuilder from "../components/QuoteBuilder";

export default function Home() {
  return (
    <main className="page-wrapper">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">New Quote</h1>
            <p className="page-subtitle">
              Configure products, apply a discount, and save a draft for review.
            </p>
          </div>
        </div>
      </div>
      <QuoteBuilder />
    </main>
  );
}
