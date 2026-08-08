import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }
    const cleanEmail = String(email).trim().toLowerCase();

    await ensureSchema();
    const sql = db();

    const existing = (await sql`SELECT id FROM users WHERE email = ${cleanEmail} LIMIT 1`) as any[];
    if (existing.length) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const role =
      process.env.ADMIN_EMAIL &&
      cleanEmail === process.env.ADMIN_EMAIL.trim().toLowerCase()
        ? "admin"
        : "user";

    const hash = await hashPassword(String(password));

    const rows = (await sql`
      INSERT INTO users (name, email, password_hash, role, balance)
      VALUES (${String(name).trim()}, ${cleanEmail}, ${hash}, ${role}, 0)
      RETURNING id, email, name, role
    `) as any[];

    const user = rows[0];
    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return NextResponse.json({ ok: true, user: { ...user, balance: 0 } });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Something went wrong." },
      { status: 500 }
    );
  }
}
