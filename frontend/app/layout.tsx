import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Instrument Serif isn't in next/font/google, load via CSS
// (kept in globals.css as single @import — only this one font)

export const metadata: Metadata = {
  title: "ShipOrSkip — Validate your ideas before you build",
  description:
    "AI-powered idea validation. Get competitive intelligence, pros/cons, and a build plan in seconds.",
  openGraph: {
    title: "ShipOrSkip",
    description: "Should you ship it or skip it? AI-powered idea validation.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}