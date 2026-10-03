// Quote review page. Server component rendering the QuoteReview client component.
import Link from "next/link";
import QuoteReview from "../../../components/QuoteReview";

export default function QuoteDetailPage() {
  return (
    <main className="page-wrapper">
      <Link href="/quotes" className="back-link">
        {String.fromCharCode(8592)} Back to Saved Quotes
      </Link>
      <QuoteReview />
    </main>
  );
}