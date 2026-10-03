// Root layout: app shell with sticky top navigation and Inter font.
// The nav renders on every route to give users consistent orientation.
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deal Desk — Quote Simulator",
  description: "Internal quote builder and approval simulator for the sales team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="app-nav" aria-label="Main navigation">
          <div className="app-nav-inner">
            <Link href="/" className="app-nav-brand">
              <span className="app-nav-brand-name">Deal Desk</span>
              <span className="app-nav-brand-badge">Internal</span>
            </Link>
            <div className="app-nav-links">
              <Link href="/" className="app-nav-link">
                New Quote
              </Link>
              <Link href="/quotes" className="app-nav-link">
                Saved Quotes
              </Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
