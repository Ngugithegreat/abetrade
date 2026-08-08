import WebSocket from "ws";

// Server-side helpers that talk to Deriv's public WebSocket API to get REAL
// prices. Used to (a) stamp a trade's entry price and (b) settle it against the
// tick at/after expiry — so the win/lose outcome is authoritative and can't be
// forged by the browser.

// Deriv app_ids are numeric; fall back to the shared test id if misconfigured
// (a non-numeric value would break entry-price and settlement fetches).
const RAW_APP_ID = process.env.NEXT_PUBLIC_DERIV_APP_ID;
const APP_ID =
  RAW_APP_ID && /^\d+$/.test(RAW_APP_ID.trim()) ? RAW_APP_ID.trim() : "1089";
const ENDPOINT = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

export type Tick = { price: number; epoch: number };

/**
 * Opens a short-lived connection, sends one request, resolves with the first
 * matching response, then closes. Rejects on timeout or API error.
 */
function request<T>(
  payload: Record<string, unknown>,
  pick: (msg: any) => T | undefined,
  timeoutMs = 8000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(ENDPOINT);
    let done = false;

    const finish = (err: Error | null, val?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      if (err) reject(err);
      else resolve(val as T);
    };

    const timer = setTimeout(
      () => finish(new Error("Deriv request timed out")),
      timeoutMs
    );

    ws.on("open", () => ws.send(JSON.stringify(payload)));
    ws.on("error", (e) => finish(e as Error));
    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.error) {
        finish(new Error(msg.error.message || "Deriv API error"));
        return;
      }
      const val = pick(msg);
      if (val !== undefined) finish(null, val);
    });
  });
}

/** Latest tick for a symbol, right now. */
export async function getLatestTick(symbol: string): Promise<Tick> {
  return request<Tick>(
    {
      ticks_history: symbol,
      end: "latest",
      count: 1,
      style: "ticks",
    },
    (msg) => {
      if (msg.msg_type === "history" && msg.history?.prices?.length) {
        const i = msg.history.prices.length - 1;
        return {
          price: Number(msg.history.prices[i]),
          epoch: Number(msg.history.times[i]),
        };
      }
      return undefined;
    }
  );
}

/**
 * The first tick whose epoch is >= `epoch`. Returns null if the feed has no
 * tick at/after that time yet (i.e. the contract hasn't actually expired).
 */
export async function getTickAtOrAfter(
  symbol: string,
  epoch: number
): Promise<Tick | null> {
  return request<Tick | null>(
    {
      ticks_history: symbol,
      start: epoch,
      end: epoch + 120,
      count: 30,
      style: "ticks",
    },
    (msg) => {
      if (msg.msg_type !== "history") return undefined;
      const prices: number[] = msg.history?.prices || [];
      const times: number[] = msg.history?.times || [];
      for (let i = 0; i < times.length; i++) {
        if (Number(times[i]) >= epoch) {
          return { price: Number(prices[i]), epoch: Number(times[i]) };
        }
      }
      // No tick at/after expiry yet -> null (caller keeps the trade open).
      return null;
    }
  );
}
