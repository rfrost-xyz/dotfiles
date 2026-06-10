/**
 * Shared formatting primitives.
 *
 * Token counts, durations, and costs in the same shapes used by both
 * statusline and metrics extensions.
 */

export type TokenUsage = {
  input?: number;
  output?: number;
  outputEstimate?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
};

export type UsageStyle = "terse" | "verbose";

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

export function fmtTokensRich(n: number | undefined): string | undefined {
  if (n === undefined || !Number.isFinite(n)) return undefined;
  const value = Math.max(0, Math.round(n));
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000)
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return `${value}`;
}

export function fmtDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h${rem ? `${rem}m` : ""}`;
}

export function fmtDurationShort(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? `${minutes % 60}m` : ""}`;
}

export function fmtCost(cost: number | undefined): string | undefined {
  if (cost === undefined || !Number.isFinite(cost) || cost <= 0) return undefined;
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

export function fmtCostCurrency(
  usd: number,
  currency: "USD" | "GBP",
  usdToGbp: number,
): string {
  if (currency === "GBP") return `£${(usd * usdToGbp).toFixed(3)}`;
  return `$${usd.toFixed(3)}`;
}

export function formatUsage(
  usage: TokenUsage | undefined,
  style: UsageStyle = "terse",
): string | undefined {
  if (!usage) return undefined;
  const verbose = style === "verbose";
  const outputSym =
    usage.output === undefined && usage.outputEstimate !== undefined ? "≈↓" : "↓";
  const entries: Array<[string, number | undefined]> = [
    ["↑", usage.input],
    [outputSym, usage.output ?? usage.outputEstimate],
    ["R", usage.cacheRead],
    ["W", usage.cacheWrite],
  ];
  const parts = entries
    .map(([sym, value]) => {
      if (!value || value <= 0) return undefined;
      const num = fmtTokensRich(value);
      if (!num) return undefined;
      return verbose ? `${sym} ${num} tokens` : `${sym}${num}`;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : undefined;
}

export function formatTokensPerSecond(
  usage: TokenUsage | undefined,
  modelDurationMs: number,
): string | undefined {
  const tokens = usage?.output ?? usage?.outputEstimate;
  if (!tokens || modelDurationMs < 500) return undefined;
  const rate = tokens / (modelDurationMs / 1000);
  if (!Number.isFinite(rate) || rate <= 0) return undefined;
  return rate >= 100 ? `${rate.toFixed(0)} t/s` : `${rate.toFixed(1)} t/s`;
}
