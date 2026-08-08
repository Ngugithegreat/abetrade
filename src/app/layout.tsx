import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AbeTrade — Trade Volatility Indices",
  description:
    "Trade Volatility Indices live with instant deposits and withdrawals. Simple, fast, and built for everyone.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
