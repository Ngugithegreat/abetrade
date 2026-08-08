"use client";

import { useEffect, useState } from "react";

const APP_ID = process.env.NEXT_PUBLIC_DERIV_APP_ID || "1089";
const ENDPOINT = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

export type Point = { epoch: number; price: number };

export type FeedState = {
  points: Point[];
  last: Point | null;
  prev: Point | null;
  connected: boolean;
};

const MAX_POINTS = 240;
const POLL_MS = 1000;

/**
 * Live tick feed for `symbol` in the browser.
 *
 * The public Deriv app_id (1089) rejects tick *subscriptions*, but plain
 * `ticks_history` requests work fine — so we keep one socket open and poll the
 * latest ticks once a second, merging them into a rolling window. With your own
 * registered app_id you could switch this to a true `subscribe` stream.
 *
 * Each effect run owns its own socket + `closed` flag so React StrictMode's dev
 * double-mount can't cross wires between runs.
 */
export function useDerivFeed(symbol: string): FeedState {
  const [points, setPoints] = useState<Point[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let lastEpoch = 0;

    setPoints([]);
    setConnected(false);
    lastEpoch = 0;

    const requestLatest = (count: number) => {
      if (closed || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          end: "latest",
          count,
          style: "ticks",
        })
      );
    };

    const merge = (incoming: Point[]) => {
      if (!incoming.length) return;
      setPoints((prev) => {
        const map = new Map<number, number>();
        for (const p of prev) map.set(p.epoch, p.price);
        for (const p of incoming) map.set(p.epoch, p.price);
        const merged = Array.from(map.entries())
          .map(([epoch, price]) => ({ epoch, price }))
          .sort((a, b) => a.epoch - b.epoch);
        return merged.slice(-MAX_POINTS);
      });
      lastEpoch = Math.max(lastEpoch, incoming[incoming.length - 1].epoch);
    };

    const connect = () => {
      if (closed) return;
      const sock = new WebSocket(ENDPOINT);
      ws = sock;

      sock.onopen = () => {
        if (closed) return;
        requestLatest(MAX_POINTS); // seed
        poll = setInterval(() => requestLatest(3), POLL_MS);
      };

      sock.onmessage = (e) => {
        if (closed) return;
        let msg: any;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.error) return;
        if (msg.msg_type === "history" && msg.history) {
          const prices: number[] = msg.history.prices || [];
          const times: number[] = msg.history.times || [];
          const pts: Point[] = prices.map((p, i) => ({
            epoch: Number(times[i]),
            price: Number(p),
          }));
          setConnected(true);
          merge(pts);
        }
      };

      sock.onclose = () => {
        if (closed) return;
        setConnected(false);
        if (poll) clearInterval(poll);
        retry = setTimeout(connect, 1500);
      };

      sock.onerror = () => {
        try {
          sock.close();
        } catch {
          /* noop */
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (poll) clearInterval(poll);
      if (retry) clearTimeout(retry);
      if (ws) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    };
  }, [symbol]);

  const last = points.length ? points[points.length - 1] : null;
  const prev = points.length > 1 ? points[points.length - 2] : null;

  return { points, last, prev, connected };
}
