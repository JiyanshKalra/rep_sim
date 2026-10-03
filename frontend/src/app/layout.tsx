// Root layout: sets the page title and wraps every route in a plain body.
// No next/font — we use system fonts defined in globals.css.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deal Desk Quote Simulator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
