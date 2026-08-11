"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export type Txn = {
  id: number;
  type: string;
  amount: number;
  status: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  created_at: string;
};

export type Trade = {
  id: number;
  kind: "rise_fall" | "mult" | "digit";
  symbol: string;
  direction: string; // rise|fall, up|down, even/odd/over/under/matches/differs
  stake: number;
  payout: number;
  multiplier: number | null;
  entry_price: number;
  exit_price: number | null;
  entry_epoch: number;
  expiry_epoch: number;
  stop_out_price: number | null;
  subtype: "even_odd" | "over_under" | "matches_differs" | null;
  prediction: string | null;
  barrier: number | null;
  exit_digit: number | null;
  status: "open" | "won" | "lost";
  created_at: string;
  settled_at: string | null;
};

export type AppUser = {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  balance: number;
  country: string | null;
  account_no?: string;
  status?: string;
};

export type AppConfig = {
  mpesaDeposit: boolean;
  mpesaWithdraw: boolean;
  cardDeposit: boolean;
  cryptoDeposit: boolean;
  ugMobileDeposit: boolean;
  usdKesRate: number;
  usdUgxRate: number;
};

export type Referral = {
  code: string;
  referredCount: number;
  earnedCents: number;
};

type WalletData = {
  user: AppUser | null;
  transactions: Txn[];
  openTrades: Trade[];
  closedTrades: Trade[];
  config?: AppConfig;
  referral?: Referral | null;
};

type Ctx = {
  user: AppUser | null;
  balance: number;
  data: WalletData | null;
  config: AppConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setBalance: (b: number) => void;
  logout: () => Promise<void>;
};

export const AppCtx = createContext<Ctx | null>(null);
export type AppCtxValue = Ctx;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [data, setData] = useState<WalletData | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = await res.json();
      setData(json);
      if (json.user) setBalance(json.user.balance);
    } catch {
      /* ignore transient errors */
    } finally {
      setLoading(false);
    }
  }, [router]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AppCtx.Provider
      value={{
        user: data?.user ?? null,
        balance,
        data,
        config: data?.config ?? null,
        loading,
        refresh,
        setBalance,
        logout,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
