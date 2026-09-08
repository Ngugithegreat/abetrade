import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SinTrades — Trade Volatility Indices",
    short_name: "SinTrades",
    description:
      "Trade Volatility Indices live with instant M-Pesa deposits and withdrawals.",
    start_url: "/trade",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0b10",
    theme_color: "#6A47F5",
    categories: ["finance"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icon-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
