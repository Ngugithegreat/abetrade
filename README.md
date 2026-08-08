# AbeTrade — Volatility Indices Trading Platform

A professional, simple trading platform where users deposit funds, trade **Volatility Indices** live against Deriv's real price feed, and withdraw their winnings.

- **Live prices** — real Deriv WebSocket feed (Volatility 10/25/50/75/100 Index).
- **Live trading** — Rise/Fall contracts, **settled server-side against the real Deriv ticks** so outcomes can't be faked from the browser.
- **Real wallet** — Postgres-backed ledger. Every stake, payout, deposit and withdrawal is a recorded transaction.
- **Deposits & withdrawals** — users submit requests; an admin approves them (same model as manual mobile-money payouts). A clean adapter is ready for automating M-Pesa/crypto later.
- **Admin panel** — approve/reject deposits and withdrawals, see every user's balance.

## Tech
Next.js 14 (App Router) · TypeScript · Tailwind · Recharts · Neon Postgres · `jose` JWT cookies.

## Setup

1. Create a free Postgres DB at [neon.tech](https://neon.tech) and copy its connection string.
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — your Neon connection string
   - `AUTH_SECRET` — run `openssl rand -base64 32`
   - `ADMIN_EMAIL` — the email that should become admin on first signup
   - `NEXT_PUBLIC_DERIV_APP_ID` — leave as `1089` (Deriv's shared test id) or use your own
3. Install & run:
   ```bash
   npm install
   npm run dev
   ```
4. Open http://localhost:3000 , register with your `ADMIN_EMAIL` to get the admin account.

The database tables are created automatically on first API call — no manual migration needed.

## Deploy to Vercel
Push to GitHub and import the repo in Vercel. Add the same four environment variables in
**Project → Settings → Environment Variables**, then redeploy.

## Going fully automated (next step)
Deposits/withdrawals currently settle by admin approval. To automate payouts, implement the
`PaymentProvider` interface in `src/lib/payments.ts` with your M-Pesa / crypto keys (added as
Vercel env vars) — the wallet ledger and UI already support it.

> ⚠️ Trading real money involves financial and regulatory risk. Make sure you are licensed/authorised
> to operate this in your jurisdiction before taking real deposits.
