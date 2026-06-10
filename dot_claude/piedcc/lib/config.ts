// Layout + behaviour config. Edit ~/.claude/piedcc/statusline.json directly —
// the script reloads on every invocation.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ThemeToken } from "./colour.ts";

export type Segment =
  | "gitBranch"
  | "gitWorkDiff"
  | "gitAhead"
  | "gitBranchDiff"
  | "usage"
  | "context"
  | "model"
  | "effort"
  | "rate5h"
  | "rateWeekly";

export const SEGMENTS: Segment[] = [
  "gitBranch",
  "gitWorkDiff",
  "gitAhead",
  "gitBranchDiff",
  "usage",
  "context",
  "model",
  "effort",
  "rate5h",
  "rateWeekly",
];

type Line = { left: Segment[]; right: Segment[] };

export type Config = {
  lines: Line[];
  gitBase: string;
  gitDiffStyle: "numbers" | "symbols" | "symbolsNumbers";
  contextAmount: "used" | "remaining" | "window";
  showContextTotal: boolean;
  usageInput: boolean;
  usageOutput: boolean;
  usageCacheRead: boolean;
  usageCacheWrite: boolean;
  showRate5hReset: boolean;
  showRateWeeklyReset: boolean;
  modelDisplay: "id" | "displayName";
  /**
   * Strip " context" from model display names so "Opus 4.7 (1M context)"
   * renders as "Opus 4.7 (1M)" — saves ~10 characters on the right side
   * without losing information.
   */
  modelStripContext: boolean;
  pieContext: boolean;
  pieRate5h: boolean;
  pieRateWeekly: boolean;
  rate5hWarning: number;
  rate5hError: number;
  rateWeeklyWarning: number;
  rateWeeklyError: number;
  usableTokens: number;
  tolerancePercent: number;
  fillBasis: "usable" | "window";
  separator: string;
  /**
   * Hard-coded width to use when CC pipes the script and no live terminal
   * width can be detected (no TTY on stdout/stderr, no /dev/tty access,
   * no COLUMNS env). Set this to your terminal's column count to keep the
   * right side right-aligned. Set 0 to force the two-space fallback.
   */
  defaultColumns: number;
  colors: Partial<Record<Segment, ThemeToken>>;
};

const CONFIG_PATH = join(homedir(), ".claude", "piedcc", "statusline.json");

export const DEFAULT_CONFIG: Config = {
  lines: [
    {
      left: [
        "gitBranch",
        "gitWorkDiff",
        "gitAhead",
        "gitBranchDiff",
        "usage",
        "context",
        "rate5h",
        "rateWeekly",
      ],
      right: ["effort", "model"],
    },
  ],
  gitBase: "origin/main",
  gitDiffStyle: "symbolsNumbers",
  contextAmount: "used",
  showContextTotal: true,
  usageInput: true,
  usageOutput: true,
  usageCacheRead: true,
  usageCacheWrite: true,
  showRate5hReset: true,
  showRateWeeklyReset: true,
  modelDisplay: "displayName",
  modelStripContext: true,
  pieContext: true,
  pieRate5h: true,
  pieRateWeekly: true,
  rate5hWarning: 80,
  rate5hError: 90,
  rateWeeklyWarning: 80,
  rateWeeklyError: 90,
  usableTokens: 128000,
  tolerancePercent: 15,
  fillBasis: "usable",
  separator: " · ",
  defaultColumns: 200,
  colors: {
    gitBranch: "accent",
    gitWorkDiff: "accent",
    gitAhead: "accent",
    gitBranchDiff: "accent",
    usage: "dim",
    context: "dim",
    model: "dim",
    effort: "dim",
    rate5h: "muted",
    rateWeekly: "muted",
  },
};

function validSegments(arr: unknown): Segment[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((s): s is Segment => SEGMENTS.includes(s as Segment));
}

function merge(raw: unknown): Config {
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_CONFIG);
  const r = raw as Partial<Config>;
  const lines = (r.lines ?? DEFAULT_CONFIG.lines)
    .map((l) => ({ left: validSegments(l.left), right: validSegments(l.right) }))
    .filter((l) => l.left.length || l.right.length);
  if (!lines.length) lines.push({ left: [], right: [] });
  return {
    ...DEFAULT_CONFIG,
    ...r,
    lines,
    colors: { ...DEFAULT_CONFIG.colors, ...(r.colors ?? {}) },
  };
}

export function loadConfig(): Config {
  try {
    return merge(JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function ensureConfigOnDisk(): void {
  if (existsSync(CONFIG_PATH)) return;
  try {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  } catch {
    /* best-effort */
  }
}
