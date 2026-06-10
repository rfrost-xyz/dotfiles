/**
 * Number / cost / glyph formatters used by the statusline segments.
 */

/**
 * Five-stage Unicode pie that mirrors a percentage. Buckets:
 * ≤12 = ○, ≤37 = ◔, ≤62 = ◑, ≤87 = ◕, else ●.
 */
export function pieChar(percent: number): string {
  const p = Math.max(0, Math.min(100, percent));
  if (p < 13) return "○";
  if (p < 38) return "◔";
  if (p < 63) return "◑";
  if (p < 88) return "◕";
  return "●";
}

function fmtCompact(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

export function fmtTokens(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "0";
  const value = Math.max(0, n);
  if (value < 1000) return `${Math.round(value)}`;
  if (value < 1_000_000) return `${fmtCompact(value / 1000)}k`;
  return `${fmtCompact(value / 1_000_000)}m`;
}

export function fmtCostCurrency(
  usd: number,
  currency: "USD" | "GBP",
  usdToGbp: number,
): string {
  if (currency === "GBP") return `£${(usd * usdToGbp).toFixed(3)}`;
  return `$${usd.toFixed(3)}`;
}
