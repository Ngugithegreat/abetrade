import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { BRAND_NAME, IS_ALT_BRAND } from "@/lib/brand";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const DESC =
  "Trade Volatility Indices live with instant deposits and withdrawals. Simple, fast, and built for everyone.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL || "https://www.sintrades.com"),
  title: `${BRAND_NAME} — Trade Volatility Indices`,
  description: DESC,
  openGraph: {
    title: `${BRAND_NAME} — Trade Volatility Indices`,
    description: DESC,
    url: process.env.PUBLIC_BASE_URL || "https://www.sintrades.com",
    siteName: BRAND_NAME,
    type: "website",
  },
  appleWebApp: {
    capable: true,
    title: BRAND_NAME,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#6A47F5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable}${IS_ALT_BRAND ? " brand-alt" : ""}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
