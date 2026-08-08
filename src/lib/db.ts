import { neon, NeonQueryFunction } from "@neondatabase/serverless";

// Money is stored everywhere as an INTEGER number of cents to avoid float drift.
// $10.50 -> 1050.

let _sql: NeonQueryFunction<false, false> | null = null;
let _migrated = false;

export function hasDb(): boolean {
  return !!process.env.DATABASE_URL;
}

function getSql(): NeonQueryFunction<false, false> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add a Postgres connection string (e.g. from neon.tech) to your environment."
    );
  }
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

/**
 * Creates tables on first use. Safe to call on every request — it only runs the
 * DDL once per warm serverless instance and the statements are idempotent.
 */
export async function ensureSchema(): Promise<void> {
  if (_migrated) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      balance       BIGINT NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,           -- deposit | withdrawal | trade_stake | trade_payout | adjustment
      amount      BIGINT NOT NULL,         -- positive = credit to user, negative = debit
      status      TEXT NOT NULL DEFAULT 'completed', -- pending | completed | rejected
      method      TEXT,                    -- mpesa | crypto | bank | manual ...
      reference   TEXT,                    -- user-supplied ref / phone / address
      note        TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS trades (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol       TEXT NOT NULL,          -- R_10, R_25, R_50, R_75, R_100
      direction    TEXT NOT NULL,          -- rise | fall
      stake        BIGINT NOT NULL,        -- cents
      payout       BIGINT NOT NULL,        -- cents credited if won (stake * multiplier)
      entry_price  DOUBLE PRECISION NOT NULL,
      exit_price   DOUBLE PRECISION,
      entry_epoch  BIGINT NOT NULL,        -- unix seconds
      expiry_epoch BIGINT NOT NULL,        -- unix seconds
      status       TEXT NOT NULL DEFAULT 'open', -- open | won | lost
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      settled_at   TIMESTAMPTZ
    )
  `;
  // Provider correlation columns for automated M-Pesa (added idempotently so
  // existing databases upgrade cleanly).
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_ref TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt TEXT`;

  await sql`CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tx_provider ON transactions(provider_ref)`;
  _migrated = true;
}

export async function query<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...params: unknown[]
): Promise<T[]> {
  const sql = getSql();
  return (await sql(strings, ...params)) as T[];
}

// Re-export the raw tagged-template client for callers that want it.
export function db(): NeonQueryFunction<false, false> {
  return getSql();
}
