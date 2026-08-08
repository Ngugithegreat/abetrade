import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db, ensureSchema } from "./db";

const COOKIE = "abetrade_session";
const DAY = 60 * 60 * 24;

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
};

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(s);
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());

  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * DAY,
  });
}

export function clearSession(): void {
  cookies().set(COOKIE, "", { path: "/", maxAge: 0 });
}

/** Returns the logged-in user from the signed cookie, or null. */
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: Number(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      role: (payload.role as "user" | "admin") ?? "user",
    };
  } catch {
    return null;
  }
}

/**
 * Loads the freshest user row (balance etc.) straight from the DB for the
 * currently logged-in session. Returns null if not authenticated.
 */
export async function currentUser(): Promise<{
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
  balance: number;
} | null> {
  const s = await getSession();
  if (!s) return null;
  await ensureSchema();
  const sql = db();
  const rows = (await sql`
    SELECT id, email, name, role, balance FROM users WHERE id = ${s.id} LIMIT 1
  `) as Array<{
    id: number;
    email: string;
    name: string;
    role: "user" | "admin";
    balance: string | number;
  }>;
  if (!rows.length) return null;
  const u = rows[0];
  return { ...u, balance: Number(u.balance) };
}
