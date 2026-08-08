// All money values in the app are integer cents.

export function cents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function toDollars(c: number): number {
  return c / 100;
}

export function money(c: number, opts: { sign?: boolean } = {}): string {
  const v = c / 100;
  const s = v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (opts.sign && c > 0) return "+" + s;
  return s;
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
