// Number + glyph formatters.

export function pieChar(percent: number): string {
  const p = Math.max(0, Math.min(100, percent));
  if (p < 13) return "○";
  if (p < 38) return "◔";
  if (p < 63) return "◑";
  if (p < 88) return "◕";
  return "●";
}

function fmtCompact(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? `${r}` : r.toFixed(1);
}

// Relative time-to-reset, mirroring piedpi's "5h0m" / "6d" idiom.
// Sub-hour spans render as Nm, sub-day as XhYm, beyond a day as Nd.
export function fmtResetRelative(resetAt: number | undefined, now = Date.now()): string | undefined {
  if (!resetAt) return undefined;
  const ms = resetAt * 1000 - now;
  if (ms <= 0) return "0m";
  const totalMin = Math.max(0, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin}m`;
  const totalHr = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (totalHr < 24) return `${totalHr}h${m}m`;
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `${days}d`;
}

export function fmtTokens(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "0";
  const v = Math.max(0, n);
  if (v < 1000) return `${Math.round(v)}`;
  if (v < 1_000_000) return `${fmtCompact(v / 1000)}k`;
  return `${fmtCompact(v / 1_000_000)}m`;
}
