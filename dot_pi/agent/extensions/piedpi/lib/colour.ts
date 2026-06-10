/**
 * Colour primitives.
 *
 *  - RGB / truecolor helpers used by the statusline to paint pre-resolved
 *    hex colours from omarchy-theme.
 *  - `percentColour` maps a percentage against warning/error thresholds
 *    onto one of pi's ThemeColor tokens for `theme.fg(token, text)`.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const m = hex.replace(/^#/, "").match(/^([0-9a-f]{6})$/i);
  if (!m) return [200, 200, 200];
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function paintRgb(rgb: Rgb, text: string): string {
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[39m`;
}

/** Convenience — paint `text` in the foreground of `hex` (a `#rrggbb`
 *  string). Returns `text` unchanged if `hex` doesn't parse. */
export function paintHex(hex: string | undefined, text: string): string {
  if (!hex || !hex.startsWith("#")) return text;
  return paintRgb(hexToRgb(hex), text);
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Lighten (positive delta) or darken (negative) a hex colour by the
 *  same byte offset across all channels. Out-of-range bytes clamp. */
export function shiftHex(hex: string, delta: number): string {
  const [r, g, b] = hexToRgb(hex);
  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${toHex(r + delta)}${toHex(g + delta)}${toHex(b + delta)}`;
}

/**
 * Return `"error"` when `usedPercent >= error`, `"warning"` when
 * `usedPercent >= warning`, otherwise the `fallback` token.
 */
export function percentColour(
  usedPercent: number | undefined,
  fallback: ThemeColor,
  warning: number,
  error: number,
): ThemeColor {
  if (usedPercent === undefined) return fallback;
  if (usedPercent >= error) return "error";
  if (usedPercent >= warning) return "warning";
  return fallback;
}

export type FillBasis = "usable" | "window";

/**
 * Display percentage for the context indicator. Caller picks whether
 * the denominator is the "usable" marker or the full context window —
 * the percent shown therefore reads naturally for either lens.
 *
 * Returns 0 when the denominator is unavailable. One decimal point of
 * resolution; callers can round further for display.
 */
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

/**
 * Single source of truth for context-indicator colouring across the
 * suite (statusline + /context). Colour is always evaluated against
 * the usable marker, regardless of which basis the display percent
 * uses:
 *
 *   - used ≥ usable                            → "error"
 *   - used ≥ usable * (1 - tolerance/100)      → "warning"
 *   - otherwise                                → fallback
 *
 * When `usable <= 0` the marker is disabled and we return `fallback`,
 * which the caller can pick to match the segment's normal palette.
 */
export function usableMarkerColour(
  used: number,
  usable: number,
  tolerancePercent: number,
  fallback: ThemeColor,
): ThemeColor {
  if (usable <= 0) return fallback;
  if (used >= usable) return "error";
  const yellowThreshold = usable * (1 - tolerancePercent / 100);
  if (used >= yellowThreshold) return "warning";
  return fallback;
}
