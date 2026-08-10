import Link from "next/link";
import {
  Zap,
  ShieldCheck,
  Wallet,
  TrendingUp,
  Clock,
  LineChart,
  ArrowRight,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { LandingChart } from "@/components/LandingChart";
import { MARKETS, PAYOUT_MULTIPLIER } from "@/lib/markets";

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="text-xl font-bold tracking-tight">SinTrades</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost px-4 py-2 text-sm">
            Sign in
          </Link>
          <Link href="/register" className="btn btn-brand px-4 py-2 text-sm">
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 lg:grid-cols-2 lg:pt-16">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
            <Zap className="h-3.5 w-3.5" /> Live volatility index trading
          </span>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Trade the markets.
            <br />
            <span className="text-gradient">Simple. Fast. Live.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted">
            Predict whether a Volatility Index will rise or fall. Win up to{" "}
            <span className="font-semibold text-brand">{PAYOUT_MULTIPLIER}×</span> your
            stake. Deposit and withdraw with ease — built for everyone.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-brand px-6 py-3 text-base">
              Start trading <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="btn btn-ghost px-6 py-3 text-base">
              I have an account
            </Link>
          </div>
          <div className="mt-6 flex items-center gap-5 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand" /> Real live prices
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-brand" /> Trades from 15 seconds
            </span>
          </div>
        </div>

        <div className="animate-fade-up [animation-delay:120ms]">
          <LandingChart />
        </div>
      </section>

      {/* Markets strip */}
      <section className="border-y border-border bg-surface/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 px-4 py-6">
          <span className="text-xs uppercase tracking-wider text-muted">
            Available markets
          </span>
          {MARKETS.map((m) => (
            <span
              key={m.symbol}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold"
            >
              {m.short}
              <span className="ml-1 text-[11px] font-normal text-muted">
                {m.name.replace(" Index", "")}
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold">Everything you need to trade</h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-muted">
          A professional trading experience without the complexity.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon={LineChart}
            title="Real live prices"
            desc="Volatility indices streamed live. Your trades settle on the genuine market feed — no games."
          />
          <Feature
            icon={Zap}
            title="Trade in one tap"
            desc="Pick a market, set your stake and time, then tap Rise or Fall. That’s it."
          />
          <Feature
            icon={Wallet}
            title="Easy deposits & withdrawals"
            desc="Fund your account and cash out your winnings via M-Pesa, crypto or bank."
          />
          <Feature
            icon={ShieldCheck}
            title="Secure by design"
            desc="Every stake and payout is recorded to a tamper-proof ledger tied to your account."
          />
          <Feature
            icon={Clock}
            title="Fast contracts"
            desc="Durations from 15 seconds to 5 minutes. Know your outcome quickly."
          />
          <Feature
            icon={TrendingUp}
            title="Track performance"
            desc="See your win rate, net P&L and full trade history at a glance."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold">Start in 3 steps</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <Step n={1} title="Create an account" desc="Sign up free in under a minute." />
            <Step n={2} title="Deposit funds" desc="Add money with your preferred method." />
            <Step
              n={3}
              title="Trade & withdraw"
              desc="Predict Rise or Fall, win, and cash out."
            />
          </div>
          <div className="mt-10 text-center">
            <Link href="/register" className="btn btn-brand px-8 py-3 text-base">
              Create free account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-muted">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Logo className="h-5 w-5" />
            <span className="font-semibold text-white">SinTrades</span>
          </div>
          <p className="mx-auto max-w-2xl">
            Trading volatility indices involves risk and may not be suitable for
            everyone. Only trade with money you can afford to lose. Prices are
            provided by the Deriv synthetic-index feed.
          </p>
          <p className="mt-3">© {new Date().getFullYear()} SinTrades. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <div className="card p-5 transition hover:border-brand/40">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="card p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand font-bold text-white shadow-glow">
        {n}
      </div>
      <h3 className="mt-3 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </div>
  );
}
