// Volatility Index markets available on the platform. Symbols are Deriv's
// synthetic-index tickers, streamed from the public Deriv feed.

export type Market = {
  symbol: string;
  name: string;
  short: string;
  // rough per-tick volatility, only used for display copy
  volatility: string;
};

export const MARKETS: Market[] = [
  { symbol: "R_10", name: "Volatility 10 Index", short: "V10", volatility: "Low" },
  { symbol: "R_25", name: "Volatility 25 Index", short: "V25", volatility: "Moderate" },
  { symbol: "R_50", name: "Volatility 50 Index", short: "V50", volatility: "Medium" },
  { symbol: "R_75", name: "Volatility 75 Index", short: "V75", volatility: "High" },
  { symbol: "R_100", name: "Volatility 100 Index", short: "V100", volatility: "Very High" },
];

export function marketBySymbol(symbol: string): Market | undefined {
  return MARKETS.find((m) => m.symbol === symbol);
}

// Payout on a winning Rise/Fall contract = stake * PAYOUT_MULTIPLIER.
// (~5% platform margin baked in.)
export const PAYOUT_MULTIPLIER = 1.9;

// Allowed contract durations, in whole seconds.
export const DURATIONS = [
  { seconds: 15, label: "15s" },
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 120, label: "2m" },
  { seconds: 300, label: "5m" },
];

// Stake limits in cents.
export const MIN_STAKE = 50; // $0.50
export const MAX_STAKE = 500000; // $5,000
