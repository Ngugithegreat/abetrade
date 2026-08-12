import { db, ensureSchema } from "@/lib/db";

// Runtime, admin-tunable settings kept in the abetrade_settings key/value table.

export const DEFAULT_HOUSE_EDGE = 0.05; // 5%
// Edge is uncapped for testing (0–100%). A separate payout floor (MIN_PAYOUT_MULT
// in markets.ts) still guarantees a winner is paid more than the stake, so even a
// 100% margin never shows a broken $0 win — payouts just hit that floor.
export const MAX_HOUSE_EDGE = 1;
const HOUSE_EDGE_KEY = "house_edge";

/** The current house edge as a fraction (0.05 = 5%). Falls back to the default. */
export async function getHouseEdge(): Promise<number> {
  await ensureSchema();
  const sql = db();
  const rows = (await sql`
    SELECT value FROM abetrade_settings WHERE key = ${HOUSE_EDGE_KEY} LIMIT 1
  `) as Array<{ value: string }>;
  const v = rows.length ? Number(rows[0].value) : NaN;
  return Number.isFinite(v) && v >= 0 && v <= MAX_HOUSE_EDGE ? v : DEFAULT_HOUSE_EDGE;
}

/** Set the house edge (fraction). Clamped to a sane 0–15% range. */
export async function setHouseEdge(edge: number): Promise<number> {
  await ensureSchema();
  const sql = db();
  const clamped = Math.min(MAX_HOUSE_EDGE, Math.max(0, Number(edge) || 0));
  await sql`
    INSERT INTO abetrade_settings (key, value, updated_at)
    VALUES (${HOUSE_EDGE_KEY}, ${String(clamped)}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${String(clamped)}, updated_at = now()
  `;
  return clamped;
}

// ---- Risk / exposure limits (protect the house bankroll from variance) ----
export const DEFAULT_MAX_STAKE_CENTS = 50000; // $500 max per trade
export const DEFAULT_MAX_PAYOUT_CENTS = 200000; // $2,000 max win per trade

async function getIntSetting(key: string, def: number, min: number, max: number): Promise<number> {
  await ensureSchema();
  const sql = db();
  const rows = (await sql`SELECT value FROM abetrade_settings WHERE key = ${key} LIMIT 1`) as Array<{ value: string }>;
  const v = rows.length ? Math.round(Number(rows[0].value)) : NaN;
  return Number.isFinite(v) && v >= min && v <= max ? v : def;
}
async function setIntSetting(key: string, val: number, min: number, max: number): Promise<number> {
  await ensureSchema();
  const sql = db();
  const clamped = Math.min(max, Math.max(min, Math.round(Number(val) || 0)));
  await sql`
    INSERT INTO abetrade_settings (key, value, updated_at)
    VALUES (${key}, ${String(clamped)}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${String(clamped)}, updated_at = now()
  `;
  return clamped;
}

/** Max stake allowed on a single trade, in cents. */
export const getMaxStakeCents = () => getIntSetting("max_stake_cents", DEFAULT_MAX_STAKE_CENTS, 100, 10_000_00);
export const setMaxStakeCents = (v: number) => setIntSetting("max_stake_cents", v, 100, 10_000_00);
/** Max payout (total returned) on a single trade, in cents — caps the house's per-trade loss. */
export const getMaxPayoutCents = () => getIntSetting("max_payout_cents", DEFAULT_MAX_PAYOUT_CENTS, 200, 50_000_00);
export const setMaxPayoutCents = (v: number) => setIntSetting("max_payout_cents", v, 200, 50_000_00);

export const DEFAULT_REFERRAL_PCT = 0.1; // 10% of the referral's first deposit
export const REFERRAL_CAP_CENTS = 10000; // never pay more than $100 per referral
const REFERRAL_PCT_KEY = "referral_pct";

/** Referral reward rate as a fraction of the referred user's first deposit. */
export async function getReferralPct(): Promise<number> {
  await ensureSchema();
  const sql = db();
  const rows = (await sql`
    SELECT value FROM abetrade_settings WHERE key = ${REFERRAL_PCT_KEY} LIMIT 1
  `) as Array<{ value: string }>;
  const v = rows.length ? Number(rows[0].value) : NaN;
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_REFERRAL_PCT;
}

/** Set the referral reward rate (fraction). Clamped to 0–50%. */
export async function setReferralPct(pct: number): Promise<number> {
  await ensureSchema();
  const sql = db();
  const clamped = Math.min(0.5, Math.max(0, Number(pct) || 0));
  await sql`
    INSERT INTO abetrade_settings (key, value, updated_at)
    VALUES (${REFERRAL_PCT_KEY}, ${String(clamped)}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${String(clamped)}, updated_at = now()
  `;
  return clamped;
}

/** True if the account is blocked/suspended and must not trade or withdraw. */
export async function isBlocked(userId: number): Promise<boolean> {
  const sql = db();
  const rows = (await sql`
    SELECT status FROM abetrade_users WHERE id = ${userId} LIMIT 1
  `) as Array<{ status: string | null }>;
  return rows.length ? rows[0].status === "blocked" : false;
}
