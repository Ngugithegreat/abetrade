// Brand name for the whole app. Defaults to "SinTrades" but can be overridden
// per deployment with NEXT_PUBLIC_BRAND_NAME — e.g. a second Vercel project on
// a different domain sets NEXT_PUBLIC_BRAND_NAME=Cryptonichub.tech, and the same
// codebase renders that brand everywhere. NEXT_PUBLIC_ vars are inlined at build
// so this works in both client and server code.
export const BRAND_NAME = (process.env.NEXT_PUBLIC_BRAND_NAME || "SinTrades").trim();

// Alternate brands get a distinct logo colour so the icon is easy to tell apart
// (SinTrades = violet, Cryptonichub = emerald→cyan). Only the mark's tile colour
// changes; the wave mark stays the same.
export const IS_ALT_BRAND = /cryptonic/i.test(BRAND_NAME);
export const LOGO_FROM = IS_ALT_BRAND ? "#2DE1A6" : "#A78BFF";
export const LOGO_TO = IS_ALT_BRAND ? "#0891B2" : "#6A47F5";
