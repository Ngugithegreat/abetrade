import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";

// Professional edge rate limiting. Sensitive POST endpoints (login, register,
// OTP send, deposit, withdraw) are throttled per client IP using a fixed window
// backed by Postgres, so limits hold across all serverless instances. It runs at
// the edge before the route, and FAILS OPEN — any limiter error lets the request
// through, so real users are never blocked by an infra hiccup.
export const config = {
  matcher: ["/api/auth/:path*", "/api/deposit", "/api/withdraw"],
};

const DB_URL_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
];
function dbUrl(): string | undefined {
  for (const v of DB_URL_VARS) {
    const val = process.env[v];
    if (val) return val;
  }
  return undefined;
}

// max requests / window(seconds) per IP for each path. Unlisted matched paths
// (e.g. logout, forgot-password) get the lenient default.
const LIMITS: Record<string, { max: number; win: number }> = {
  "/api/auth/login": { max: 12, win: 300 },
  "/api/auth/register": { max: 6, win: 900 },
  "/api/auth/otp/send": { max: 6, win: 900 },
  "/api/deposit": { max: 25, win: 300 },
  "/api/withdraw": { max: 25, win: 300 },
};
const DEFAULT_LIMIT = { max: 40, win: 60 };

let ensured = false;

export async function middleware(req: NextRequest) {
  // Only throttle state-changing POSTs; reads (GET, status polls) pass through.
  if (req.method !== "POST") return NextResponse.next();

  const url = dbUrl();
  if (!url) return NextResponse.next(); // no DB configured yet → fail open

  const path = req.nextUrl.pathname;
  const cfg = LIMITS[path] || DEFAULT_LIMIT;
  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  try {
    const sql = neon(url);
    if (!ensured) {
      await sql`CREATE TABLE IF NOT EXISTS app_ratelimit (rkey TEXT PRIMARY KEY, count INT NOT NULL DEFAULT 0, reset_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      ensured = true;
    }
    const key = `${path}:${ip}`;
    const rows = (await sql`
      INSERT INTO app_ratelimit (rkey, count, reset_at)
      VALUES (${key}, 1, now() + ${cfg.win} * interval '1 second')
      ON CONFLICT (rkey) DO UPDATE SET
        count = CASE WHEN app_ratelimit.reset_at < now() THEN 1 ELSE app_ratelimit.count + 1 END,
        reset_at = CASE WHEN app_ratelimit.reset_at < now() THEN now() + ${cfg.win} * interval '1 second' ELSE app_ratelimit.reset_at END
      RETURNING count, reset_at
    `) as Array<{ count: number; reset_at: string }>;
    const count = Number(rows[0]?.count ?? 1);
    if (count > cfg.max) {
      const retry = Math.max(1, Math.ceil((new Date(rows[0].reset_at).getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many attempts. Please wait a moment and try again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retry),
            "X-RateLimit-Limit": String(cfg.max),
          },
        }
      );
    }
  } catch {
    // Fail open — never block real traffic on a limiter error.
  }
  return NextResponse.next();
}
