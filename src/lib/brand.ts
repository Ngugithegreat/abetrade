// Brand name for the whole app. Defaults to "SinTrades" but can be overridden
// per deployment with NEXT_PUBLIC_BRAND_NAME — e.g. a second Vercel project on
// a different domain sets NEXT_PUBLIC_BRAND_NAME=Cryptonichub.tech, and the same
// codebase renders that brand everywhere. NEXT_PUBLIC_ vars are inlined at build
// so this works in both client and server code.
export const BRAND_NAME = (process.env.NEXT_PUBLIC_BRAND_NAME || "SinTrades").trim();
