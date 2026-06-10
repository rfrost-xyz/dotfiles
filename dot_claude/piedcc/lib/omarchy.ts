// Map the current omarchy palette to the seven theme tokens segments use.
// Synchronous read at process start — statusline is short-lived.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { hexToRgb, paintRgb, type ThemeToken } from "./colour.ts";

const COLORS_FILE = join(homedir(), ".config", "omarchy", "current", "theme", "colors.toml");

type Palette = {
  accent: string;
  foreground: string;
  color1: string; // red
  color2: string; // green
  color8: string; // bright-black / dim
  color11: string; // bright yellow — more reliable than color3 across themes
};

const DEFAULTS: Palette = {
  accent: "#509475",
  foreground: "#C1C497",
  color1: "#FF5345",
  color2: "#549e6a",
  color8: "#53685B",
  color11: "#E5C736",
};

function loadPalette(): Palette {
  try {
    const raw = readFileSync(COLORS_FILE, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"([^"]+)"/);
      if (m) out[m[1]!] = m[2]!;
    }
    return { ...DEFAULTS, ...(out as Partial<Palette>) };
  } catch {
    return DEFAULTS;
  }
}

const palette = loadPalette();

const TOKEN_HEX: Record<ThemeToken, string> = {
  accent: palette.accent,
  fg: palette.foreground,
  dim: palette.foreground,
  muted: palette.color8,
  success: palette.color2,
  warning: palette.color11,
  error: palette.color1,
};

export const theme = {
  fg(token: ThemeToken, text: string): string {
    return paintRgb(hexToRgb(TOKEN_HEX[token] ?? palette.foreground), text);
  },
};
