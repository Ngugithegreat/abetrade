import { neon, NeonQueryFunction } from "@neondatabase/serverless";

// Money is stored everywhere as an INTEGER number of cents to avoid float drift.
// $10.50 -> 1050.

let _sql: NeonQueryFunction<false, false> | null = null;
let _migrated = false;

// Accept whatever a Postgres provider injects. Vercel's one-click Postgres
// (Neon) sets POSTGRES_URL automatically, so adding a database from the Vercel
// Storage tab wires this up with zero manual copying.
const DB_URL_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
];

export function dbUrl(): string | undefined {
  for (const v of DB_URL_VARS) {
    const val = process.env[v];
    if (val) return val;
  }
  return undefined;
}

export function hasDb(): boolean {
  return !!dbUrl();
}

function getSql(): NeonQueryFunction<false, false> {
  const url = dbUrl();
  if (!url) {
    throw new Error(
      "No Postgres connection string found. In Vercel open the Storage tab and create a Postgres database (it sets POSTGRES_URL automatically), or add DATABASE_URL yourself."
    );
  }
  if (!_sql) {
    _sql = neon(url);
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
    CREATE TABLE IF NOT EXISTS abetrade_users (
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
    CREATE TABLE IF NOT EXISTS abetrade_transactions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES abetrade_users(id) ON DELETE CASCADE,
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
    CREATE TABLE IF NOT EXISTS abetrade_trades (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES abetrade_users(id) ON DELETE CASCADE,
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
  // Country selected at signup — drives which deposit rails the user sees.
  await sql`ALTER TABLE abetrade_users ADD COLUMN IF NOT EXISTS country TEXT`;

  // Provider correlation columns for automated M-Pesa (added idempotently so
  // existing databases upgrade cleanly).
  await sql`ALTER TABLE abetrade_transactions ADD COLUMN IF NOT EXISTS provider_ref TEXT`;
  await sql`ALTER TABLE abetrade_transactions ADD COLUMN IF NOT EXISTS receipt TEXT`;

  // Multipliers contract support on trades.
  await sql`ALTER TABLE abetrade_trades ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'rise_fall'`;
  await sql`ALTER TABLE abetrade_trades ADD COLUMN IF NOT EXISTS multiplier INTEGER`;
  await sql`ALTER TABLE abetrade_trades ADD COLUMN IF NOT EXISTS stop_out_price DOUBLE PRECISION`;

  // Digit contract support (kind = 'digit').
  // subtype: even_odd | over_under | matches_differs; prediction: the chosen side;
  // barrier: barrier/target digit; exit_digit: settled last digit.
  await sql`ALTER TABLE abetrade_trades ADD COLUMN IF NOT EXISTS subtype TEXT`;
  await sql`ALTER TABLE abetrade_trades ADD COLUMN IF NOT EXISTS prediction TEXT`;
  await sql`ALTER TABLE abetrade_trades ADD COLUMN IF NOT EXISTS barrier INTEGER`;
  await sql`ALTER TABLE abetrade_trades ADD COLUMN IF NOT EXISTS exit_digit INTEGER`;

  // Account controls: status (active | blocked) + promotional flag (admin-only).
  await sql`ALTER TABLE abetrade_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`;
  await sql`ALTER TABLE abetrade_users ADD COLUMN IF NOT EXISTS promo BOOLEAN NOT NULL DEFAULT false`;

  // Referrals: who referred this user, and whether their first-deposit reward paid.
  await sql`ALTER TABLE abetrade_users ADD COLUMN IF NOT EXISTS referred_by INTEGER`;
  await sql`ALTER TABLE abetrade_users ADD COLUMN IF NOT EXISTS referral_rewarded BOOLEAN NOT NULL DEFAULT false`;

  // Key/value settings store (house edge %, etc.).
  await sql`
    CREATE TABLE IF NOT EXISTS abetrade_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Password-reset tokens (only the SHA-256 hash is stored; single-use, 1h TTL).
  await sql`
    CREATE TABLE IF NOT EXISTS abetrade_password_resets (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES abetrade_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pwreset_token ON abetrade_password_resets(token_hash)`;

  await sql`CREATE INDEX IF NOT EXISTS idx_tx_user ON abetrade_transactions(user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_trades_user ON abetrade_trades(user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tx_provider ON abetrade_transactions(provider_ref)`;
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
