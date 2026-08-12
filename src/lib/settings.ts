import { db, ensureSchema } from "@/lib/db";

// Runtime, admin-tunable settings kept in the abetrade_settings key/value table.

export const DEFAULT_HOUSE_EDGE = 0.05; // 5%
// Cap the edge well below the point where even-money payouts collapse to 1.0x
// (which would make a "win" pay back only the stake). 15% keeps them >= 1.7x.
export const MAX_HOUSE_EDGE = 0.15;
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
