"use client";

import { AppProvider } from "@/components/app-context";
import { Nav } from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <div className="min-h-screen">
        <Nav />
        {/* Each page owns its own container so the trade dashboard can go
            full-width and fit the viewport while other pages stay centered. */}
        <main>{children}</main>
      </div>
    </AppProvider>
  );
}
