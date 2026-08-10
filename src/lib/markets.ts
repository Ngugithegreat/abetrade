// Volatility Index markets. `decimals` and `tickSeconds` are verified against
// the live Deriv feed and are used for last-digit (digit contracts) and for
// mapping tick-duration to expiry time.

export type Market = {
  symbol: string;
  name: string;
  short: string;
  volatility: string;
  decimals: number;
  tickSeconds: number; // seconds between ticks (1 for the (1s) indices, 2 otherwise)
  oneSecond: boolean;
};

export const MARKETS: Market[] = [
  // Classic 2-second indices
  { symbol: "R_10", name: "Volatility 10 Index", short: "V10", volatility: "Low", decimals: 3, tickSeconds: 2, oneSecond: false },
  { symbol: "R_25", name: "Volatility 25 Index", short: "V25", volatility: "Moderate", decimals: 3, tickSeconds: 2, oneSecond: false },
  { symbol: "R_50", name: "Volatility 50 Index", short: "V50", volatility: "Medium", decimals: 4, tickSeconds: 2, oneSecond: false },
  { symbol: "R_75", name: "Volatility 75 Index", short: "V75", volatility: "High", decimals: 4, tickSeconds: 2, oneSecond: false },
  { symbol: "R_100", name: "Volatility 100 Index", short: "V100", volatility: "Very High", decimals: 2, tickSeconds: 2, oneSecond: false },
  // 1-second indices (faster ticks — best for digit trading)
  { symbol: "1HZ10V", name: "Volatility 10 (1s) Index", short: "V10 1s", volatility: "Low", decimals: 2, tickSeconds: 1, oneSecond: true },
  { symbol: "1HZ25V", name: "Volatility 25 (1s) Index", short: "V25 1s", volatility: "Moderate", decimals: 2, tickSeconds: 1, oneSecond: true },
  { symbol: "1HZ50V", name: "Volatility 50 (1s) Index", short: "V50 1s", volatility: "Medium", decimals: 2, tickSeconds: 1, oneSecond: true },
  { symbol: "1HZ75V", name: "Volatility 75 (1s) Index", short: "V75 1s", volatility: "High", decimals: 2, tickSeconds: 1, oneSecond: true },
  { symbol: "1HZ100V", name: "Volatility 100 (1s) Index", short: "V100 1s", volatility: "Very High", decimals: 2, tickSeconds: 1, oneSecond: true },
];

export function marketBySymbol(symbol: string): Market | undefined {
  return MARKETS.find((m) => m.symbol === symbol);
}

export function decimalsFor(symbol: string): number {
  return marketBySymbol(symbol)?.decimals ?? 2;
}

/** The trailing digit of a price at the symbol's precision (0-9). */
export function lastDigit(price: number, decimals: number): number {
  const scaled = Math.round(price * Math.pow(10, decimals));
  return ((scaled % 10) + 10) % 10;
}

// ---- Rise / Fall ----
export const PAYOUT_MULTIPLIER = 1.9;
export const DURATIONS = [
  { seconds: 15, label: "15s" },
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 120, label: "2m" },
  { seconds: 300, label: "5m" },
];

// ---- Multipliers ----
export const MULTIPLIERS = [100, 200, 400, 1000];
export const DEFAULT_MULTIPLIER = 100;

export function stopOutPrice(
  direction: "up" | "down",
  entry: number,
  multiplier: number
): number {
  const frac = 1 / multiplier;
  return direction === "up" ? entry * (1 - frac) : entry * (1 + frac);
}

export function multiplierPnl(opts: {
  direction: "up" | "down";
  entry: number;
  current: number;
  stakeCents: number;
  multiplier: number;
}): number {
  const change = (opts.current - opts.entry) / opts.entry;
  const dirChange = opts.direction === "up" ? change : -change;
  const pnl = Math.round(opts.stakeCents * opts.multiplier * dirChange);
  return Math.max(-opts.stakeCents, pnl);
}

// ---- Digits ----
// Contract on the last digit of the exit tick. Payout scales with the odds so
// rarer predictions pay more (like Deriv). A small house edge is baked in.
export const DIGIT_HOUSE_EDGE = 0.05;

// Tick durations for digit contracts.
export const DIGIT_TICKS = [1, 2, 3, 4, 5];
export const DEFAULT_DIGIT_TICKS = 1;

export type DigitSubtype = "even_odd" | "over_under" | "matches_differs";

/** Fair multiplier for a given win probability, minus the house edge. */
export function payoutFromProb(prob: number, edge: number = DIGIT_HOUSE_EDGE): number {
  const m = (1 / prob) * (1 - edge);
  return Math.round(m * 100) / 100;
}

/** Rise/Fall (even-money) multiplier for a given house edge. 5% edge -> 1.9x. */
export function riseFallMult(edge: number = DIGIT_HOUSE_EDGE): number {
  return Math.round(2 * (1 - edge) * 100) / 100;
}

/**
 * Win probability for a digit prediction.
 * over_under: prediction "over"/"under", barrier 0-9.
 * matches_differs: prediction "matches"/"differs", target 0-9.
 * even_odd: prediction "even"/"odd".
 */
export function digitProb(
  subtype: DigitSubtype,
  prediction: string,
  barrier: number
): number {
  if (subtype === "even_odd") return 0.5;
  if (subtype === "matches_differs")
    return prediction === "matches" ? 0.1 : 0.9;
  // over_under
  if (prediction === "over") return (9 - barrier) / 10; // digit > barrier
  return barrier / 10; // under: digit < barrier
}

export function digitPayoutMult(
  subtype: DigitSubtype,
  prediction: string,
  barrier: number,
  edge: number = DIGIT_HOUSE_EDGE
): number {
  return payoutFromProb(digitProb(subtype, prediction, barrier), edge);
}

/** Did a digit prediction win, given the exit last digit? */
export function digitWins(
  subtype: DigitSubtype,
  prediction: string,
  barrier: number,
  digit: number
): boolean {
  if (subtype === "even_odd")
    return prediction === "even" ? digit % 2 === 0 : digit % 2 === 1;
  if (subtype === "matches_differs")
    return prediction === "matches" ? digit === barrier : digit !== barrier;
  return prediction === "over" ? digit > barrier : digit < barrier;
}

// Stake limits (cents)
export const MIN_STAKE = 50;
export const MAX_STAKE = 500000;
