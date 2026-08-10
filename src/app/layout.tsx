import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.sintrades.com"),
  title: "SinTrades — Trade Volatility Indices",
  description:
    "Trade Volatility Indices live with instant deposits and withdrawals. Simple, fast, and built for everyone.",
  openGraph: {
    title: "SinTrades — Trade Volatility Indices",
    description:
      "Trade Volatility Indices live with instant deposits and withdrawals. Simple, fast, and built for everyone.",
    url: "https://www.sintrades.com",
    siteName: "SinTrades",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
