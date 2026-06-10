/**
 * Shared colour primitives.
 *
 * - HighlightColor type + values for menu highlights.
 * - highlightTheme() builds a SettingsListTheme from a colour token.
 * - hex/RGB helpers for truecolor ANSI painting.
 * - readOmarchyAccent() + isOmarchyLightMode() read the active Omarchy theme.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import type { SettingsListTheme } from "@earendil-works/pi-tui";

export type HighlightColor =
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "muted"
  | "text";

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  "accent",
  "success",
  "warning",
  "error",
  "muted",
  "text",
];

export type ThemeFg = { fg(color: ThemeColor, text: string): string };

export function highlightTheme(theme: ThemeFg, color: ThemeColor): SettingsListTheme {
  return {
    label: (text, selected) => (selected ? theme.fg(color, text) : text),
    value: (text, selected) =>
      selected ? theme.fg(color, text) : theme.fg("muted", text),
    description: (text) => theme.fg("dim", text),
    cursor: theme.fg(color, "→ "),
    hint: (text) => theme.fg("dim", text),
  };
}

// ── RGB / truecolor ─────────────────────────────────────────────────────────

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const m = hex.replace(/^#/, "").match(/^([0-9a-f]{6})$/i);
  if (!m) return [200, 200, 200];
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function blendRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

export function darken(rgb: Rgb, factor: number): Rgb {
  const k = Math.max(0, Math.min(1, factor));
  return [
    Math.round(rgb[0] * k),
    Math.round(rgb[1] * k),
    Math.round(rgb[2] * k),
  ];
}

export function lighten(rgb: Rgb, factor: number): Rgb {
  const k = Math.max(0, Math.min(1, factor));
  return [
    Math.round(rgb[0] + (255 - rgb[0]) * k),
    Math.round(rgb[1] + (255 - rgb[1]) * k),
    Math.round(rgb[2] + (255 - rgb[2]) * k),
  ];
}

export function paintRgb(rgb: Rgb, text: string): string {
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[39m`;
}

// ── Omarchy integration ─────────────────────────────────────────────────────

const OMARCHY_DIR = join(homedir(), ".config", "omarchy", "current", "theme");
const OMARCHY_COLORS = join(OMARCHY_DIR, "colors.toml");
const OMARCHY_LIGHT_MARKER = join(OMARCHY_DIR, "light.mode");

let cachedAccent: string | null | undefined;

export function readOmarchyAccent(): string | undefined {
  if (cachedAccent !== undefined) return cachedAccent ?? undefined;
  try {
    if (!existsSync(OMARCHY_COLORS)) {
      cachedAccent = null;
      return undefined;
    }
    const raw = readFileSync(OMARCHY_COLORS, "utf-8");
    const match = raw.match(/^\s*accent\s*=\s*"(#?[0-9a-fA-F]{6})"/m);
    cachedAccent = match ? match[1] : null;
    return cachedAccent ?? undefined;
  } catch {
    cachedAccent = null;
    return undefined;
  }
}

let cachedLightMode: { value: boolean; at: number } | undefined;

/**
 * Whether Omarchy is currently in light mode. Cached for 1s so shimmer
 * animations (12+ fps) don't burn a syscall per frame. Theme-sync polls
 * every 2s; cache TTL is below the polling interval so it still flips
 * promptly when Omarchy switches.
 */
export function isOmarchyLightMode(): boolean {
  const now = Date.now();
  if (cachedLightMode && now - cachedLightMode.at < 1000)
    return cachedLightMode.value;
  const value = existsSync(OMARCHY_LIGHT_MARKER);
  cachedLightMode = { value, at: now };
  return value;
}
