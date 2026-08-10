"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LineChart,
  Wallet,
  History,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
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
  const [open, setOpen] = useState(false);

  const allLinks = links;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/trade" className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-lg font-bold tracking-tight">SinTrades</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {allLinks.map((l) => {
              const active = pathname === l.href;
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-surface2 text-fg"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user?.account_no && (
            <div className="hidden items-center gap-1.5 rounded-lg border border-up/30 bg-up/10 px-2.5 py-1.5 lg:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-up" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-up">
                Live account
              </span>
              <span className="tabular text-[10px] text-muted">{user.account_no}</span>
            </div>
          )}
          <div className="hidden text-right sm:block">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Balance
            </div>
            <div className="tabular text-sm font-bold text-brand">
              {loading ? "—" : money(balance)}
            </div>
          </div>
          <Link
            href="/wallet"
            className="btn btn-brand hidden px-4 py-2 text-sm sm:inline-flex"
          >
            Deposit
          </Link>
          <ThemeToggle className="hidden sm:inline-flex" />
          <button
            onClick={logout}
            title="Log out"
            className="btn btn-ghost hidden h-9 w-9 p-0 sm:inline-flex"
          >
            <LogOut className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="btn btn-ghost h-9 w-9 p-0 md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-surface md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            <div className="flex items-center justify-between px-2 py-2">
              <span className="text-xs uppercase text-muted">Balance</span>
              <span className="tabular font-bold text-brand">{money(balance)}</span>
            </div>
            {user?.account_no && (
              <div className="flex items-center justify-between px-2 pb-2">
                <span className="flex items-center gap-1.5 text-xs text-up">
                  <span className="h-1.5 w-1.5 rounded-full bg-up" /> Live account
                </span>
                <span className="tabular text-xs text-muted">{user.account_no}</span>
              </div>
            )}
            {allLinks.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface2 hover:text-fg"
                >
                  <Icon className="h-4 w-4" />
                  {l.label}
                </Link>
              );
            })}
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-down hover:bg-surface2"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
