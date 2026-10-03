// Quote review page route.
// Server component rendering the page container, back link, and client QuoteReview.
import Link from "next/link";
import QuoteReview from "../../../components/QuoteReview";

export default function QuoteDetailPage() {
  return (
    <main className="page">
      <Link href="/quotes">Back to saved quotes</Link>
      <QuoteReview />
    </main>
  );
}
