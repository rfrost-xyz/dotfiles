// Truecolor primitives + indicator colour helpers. Mirrors piedpi/lib/colour.ts.

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace(/^#/, "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const m = full.match(/^([0-9a-f]{6})$/i);
  if (!m) return [200, 200, 200];
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function paintRgb(rgb: Rgb, text: string): string {
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[39m`;
}

export type ThemeToken =
  | "accent"
  | "fg"
  | "dim"
  | "muted"
  | "success"
  | "warning"
  | "error";

export function percentColour(
  pct: number | undefined,
  fallback: ThemeToken,
  warning: number,
  error: number,
): ThemeToken {
  if (pct === undefined) return fallback;
  if (pct >= error) return "error";
  if (pct >= warning) return "warning";
  return fallback;
}

export type FillBasis = "usable" | "window";

export function fillPercent(
  used: number,
  basis: FillBasis,
  usable: number,
  contextWindow: number,
): number {
  const denom = basis === "usable" ? usable : contextWindow;
  if (denom <= 0) return 0;
  return Math.round((used / denom) * 1000) / 10;
}

export function usableMarkerColour(
  used: number,
  usable: number,
  tolerancePercent: number,
  fallback: ThemeToken,
): ThemeToken {
  if (usable <= 0) return fallback;
  if (used >= usable) return "error";
  if (used >= usable * (1 - tolerancePercent / 100)) return "warning";
  return fallback;
}
