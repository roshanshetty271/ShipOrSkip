import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShipOrSkip — Validate your ideas before you build",
  description: "AI-powered idea validation. Get competitive intelligence, pros/cons, and a build plan in seconds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
