import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // "Iris" — obsidian + electric violet-indigo.
        bg: "#0A0B10",
        surface: "#12131B",
        surface2: "#1A1C27",
        border: "#262A38",
        muted: "#8A90A6",
        brand: {
          DEFAULT: "#7C5CFF",
          dark: "#6A47F5",
          light: "#9E86FF",
        },
        // Market direction — never used for branding.
        up: "#00E39A",
        down: "#FF4D6D",
        gold: "#FFB020",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 60px -12px rgba(124, 92, 255, 0.55)",
        card: "0 12px 40px -16px rgba(0,0,0,0.7)",
        lift: "0 20px 50px -20px rgba(124, 92, 255, 0.35)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.16,1,0.3,1) both",
        pulseSoft: "pulseSoft 1.5s ease-in-out infinite",
        shimmer: "shimmer 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
