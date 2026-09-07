"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LineChart,
  Wallet,
  History,
  LogOut,
  Plus,
} from "lucide-react";
import { useApp } from "./app-context";
import { money } from "@/lib/format";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/trade", label: "Trade", icon: LineChart },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/history", label: "History", icon: History },
];

export function Nav() {
  const pathname = usePathname();
  const { balance, logout, loading, user } = useApp();

  return (
    <>
      {/* ---------------------------- Top header ---------------------------- */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/trade" className="flex items-center gap-2">
              <Logo className="h-7 w-7" />
              <span className="text-lg font-bold tracking-tight">SinTrades</span>
            </Link>
            {/* Desktop primary nav */}
            <nav className="hidden items-center gap-1 md:flex">
              {links.map((l) => {
                const active = pathname === l.href;
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active ? "bg-surface2 text-fg" : "text-muted hover:text-fg"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {l.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live-account chip — desktop only */}
            {user?.account_no && (
              <div className="hidden items-center gap-1.5 rounded-lg border border-up/30 bg-up/10 px-2.5 py-1.5 lg:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-up" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-up">
                  Live account
                </span>
                <span className="tabular text-[10px] text-muted">{user.account_no}</span>
              </div>
            )}

            {/* Balance pill — compact and consistent on every screen size */}
            <Link
              href="/wallet"
              className="flex items-center gap-2 rounded-full border border-border bg-surface2/60 py-1.5 pl-3 pr-1.5 transition hover:border-brand/40"
            >
              <span className="flex flex-col leading-none">
                <span className="text-[9px] uppercase tracking-wider text-muted">
                  Balance
                </span>
                <span className="tabular mt-0.5 text-sm font-bold text-brand">
                  {loading ? "—" : money(balance)}
                </span>
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white">
                <Plus className="h-4 w-4" />
              </span>
            </Link>

            <ThemeToggle />
            <button
              onClick={logout}
              title="Log out"
              className="btn btn-ghost hidden h-9 w-9 p-0 md:inline-flex"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------ Mobile bottom tab bar ------------------------ */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {links.map((l) => {
            const active = pathname === l.href;
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                {active && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" />
                )}
                <Icon className="h-5 w-5" />
                {l.label}
              </Link>
            );
          })}
          <button
            onClick={logout}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted transition active:text-down"
          >
            <LogOut className="h-5 w-5" />
            Log out
          </button>
        </div>
      </nav>
    </>
  );
}
