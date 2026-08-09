"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { COUNTRIES } from "@/lib/countries";

type Mode = "signin" | "signup";

export function AuthCard({ initial }: { initial: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initial);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("KE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(kind: Mode, e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${kind === "signin" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "signup" ? { name, email, password, country } : { email, password }
        ),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Something went wrong.");
      else {
        router.replace("/trade");
        router.refresh();
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const shared = {
    email,
    setEmail,
    password,
    setPassword,
    busy,
    error,
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-[900px]">
        {/* Brand (mobile) */}
        <div className="mb-6 flex items-center justify-center gap-2 sm:hidden">
          <Logo className="h-9 w-9" />
          <span className="text-2xl font-bold tracking-tight">AbeTrade</span>
        </div>

        {/* ---------- Desktop: sliding two-panel ---------- */}
        <div className="relative hidden min-h-[560px] overflow-hidden rounded-3xl border border-border bg-surface shadow-card sm:block">
          {/* Sign-in form (left half) */}
          <div
            className={`absolute inset-y-0 left-0 flex w-1/2 items-center justify-center p-10 transition-all duration-500 ${
              mode === "signup" ? "z-0 opacity-0" : "z-10 opacity-100"
            }`}
          >
            <SignInForm {...shared} onSubmit={(e) => submit("signin", e)} />
          </div>

          {/* Sign-up form (right half) */}
          <div
            className={`absolute inset-y-0 left-0 flex w-1/2 translate-x-full items-center justify-center overflow-y-auto p-10 transition-all duration-500 ${
              mode === "signup" ? "z-10 opacity-100" : "z-0 opacity-0"
            }`}
          >
            <SignUpForm
              {...shared}
              name={name}
              setName={setName}
              country={country}
              setCountry={setCountry}
              onSubmit={(e) => submit("signup", e)}
            />
          </div>

          {/* Overlay brand panel */}
          <div
            className={`absolute inset-y-0 left-1/2 z-20 w-1/2 transition-transform duration-500 ${
              mode === "signup" ? "-translate-x-full" : "translate-x-0"
            }`}
          >
            <BrandPanel mode={mode} onToggle={() => setMode(mode === "signin" ? "signup" : "signin")} />
          </div>
        </div>

        {/* ---------- Mobile: stacked ---------- */}
        <div className="card overflow-hidden p-6 sm:hidden">
          {mode === "signin" ? (
            <SignInForm {...shared} onSubmit={(e) => submit("signin", e)} />
          ) : (
            <SignUpForm
              {...shared}
              name={name}
              setName={setName}
              country={country}
              setCountry={setCountry}
              onSubmit={(e) => submit("signup", e)}
            />
          )}
          <p className="mt-5 text-center text-sm text-muted">
            {mode === "signin" ? "New to AbeTrade? " : "Already have an account? "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-semibold text-brand"
            >
              {mode === "signin" ? "Create account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function BrandPanel({ mode, onToggle }: { mode: Mode; onToggle: () => void }) {
  const signup = mode === "signup";
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden p-10 text-center text-white">
      {/* animated diagonal gradient */}
      <div
        className="absolute -inset-1/3 opacity-90"
        style={{
          background:
            "conic-gradient(from 0deg at 50% 50%, #6A47F5, #5B8DEF, #9E86FF, #6A47F5)",
          animation: "spin 16s linear infinite",
        }}
      />
      <div className="absolute inset-0 bg-black/10" />
      <div className="relative z-10 flex flex-col items-center">
        <Logo className="h-12 w-12" />
        <div className="mt-3 text-2xl font-black tracking-tight">AbeTrade</div>
        <h3 className="mt-6 text-xl font-bold">
          {signup ? "Welcome back!" : "New here?"}
        </h3>
        <p className="mt-2 max-w-[240px] text-sm text-white/85">
          {signup
            ? "Already trading with us? Sign in to your account."
            : "Create an account and start trading volatility indices in minutes."}
        </p>
        <button
          onClick={onToggle}
          className="mt-6 rounded-full border-2 border-white/80 px-8 py-2.5 text-sm font-semibold transition hover:bg-white/15"
        >
          {signup ? "Sign in" : "Create account"}
        </button>
      </div>
    </div>
  );
}

type SharedProps = {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
};

function SignInForm(p: SharedProps) {
  return (
    <form onSubmit={p.onSubmit} className="w-full max-w-sm space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to your trading account.</p>
      </div>
      <input
        className="input"
        type="email"
        placeholder="Email"
        value={p.email}
        onChange={(e) => p.setEmail(e.target.value)}
        required
      />
      <input
        className="input"
        type="password"
        placeholder="Password"
        value={p.password}
        onChange={(e) => p.setPassword(e.target.value)}
        required
      />
      {p.error && <p className="text-sm text-down">{p.error}</p>}
      <button type="submit" disabled={p.busy} className="btn btn-brand w-full py-2.5">
        {p.busy ? "Please wait…" : "Sign in"}
      </button>
    </form>
  );
}

function SignUpForm(
  p: SharedProps & {
    name: string;
    setName: (v: string) => void;
    country: string;
    setCountry: (v: string) => void;
  }
) {
  return (
    <form onSubmit={p.onSubmit} className="w-full max-w-sm space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-1 text-sm text-muted">Start trading in minutes.</p>
      </div>
      <input
        className="input"
        placeholder="Full name"
        value={p.name}
        onChange={(e) => p.setName(e.target.value)}
        required
      />
      <input
        className="input"
        type="email"
        placeholder="Email"
        value={p.email}
        onChange={(e) => p.setEmail(e.target.value)}
        required
      />
      <input
        className="input"
        type="password"
        placeholder="Password"
        minLength={6}
        value={p.password}
        onChange={(e) => p.setPassword(e.target.value)}
        required
      />
      <div>
        <select
          className="input appearance-none"
          value={p.country}
          onChange={(e) => p.setCountry(e.target.value)}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 px-1 text-[11px] text-muted">
          This sets your deposit & withdrawal options.
        </p>
      </div>
      {p.error && <p className="text-sm text-down">{p.error}</p>}
      <button type="submit" disabled={p.busy} className="btn btn-brand w-full py-2.5">
        {p.busy ? "Please wait…" : "Create account"}
      </button>
    </form>
  );
}
