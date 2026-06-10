/**
 * Statusline — single-file extension.
 *
 * Replaces pi's default footer with a configurable multi-line statusline.
 * Layout (which segments live on which row/side) is defined exclusively in
 * ~/.pi/agent/config/statusline.json. The /statusline page surfaces visibility
 * (on/off per segment) plus per-segment behaviour settings — never positions.
 *
 * Colours flow through pi theme tokens (accent, dim, muted, text,
 * success, warning, error). omarchy-theme owns those tokens; this extension
 * does not maintain its own colour palette.
 *
 * Codex quota segments read globalThis.__piCodexQuotas published by the
 * quotas extension; absent that, those segments silently render nothing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ThemeColor,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  fillPercent,
  paintHex,
  percentColour,
  usableMarkerColour,
} from "./lib/colour.ts";
import { libPrefs } from "./lib/prefs.ts";
import { Config } from "./lib/config.ts";
import { openConfigMenu } from "./lib/config-menu.ts";
import { type CycleRow, type MenuTheme } from "./lib/cycle-menu.ts";
import { Diagnostics } from "./lib/diagnostics.ts";
import { fmtCostCurrency, fmtTokens, pieChar } from "./lib/format.ts";

// Parse `git diff --numstat` output into total added/deleted line counts.
function parseNumstat(
  stdout: string | undefined,
): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const line of (stdout ?? "").trim().split("\n")) {
    if (!line) continue;
    const [a, d] = line.split("\t");
    const parsedAdded = Number.parseInt(a ?? "", 10);
    const parsedDeleted = Number.parseInt(d ?? "", 10);
    if (Number.isFinite(parsedAdded)) added += parsedAdded;
    if (Number.isFinite(parsedDeleted)) deleted += parsedDeleted;
  }
  return { added, deleted };
}

declare global {
  // Per-level hex colours published by omarchy-theme. Statusline reads here
  // so thinking-text colour stays per-level even when the editor-border
  // override is on.
  // eslint-disable-next-line no-var
  var __piOmarchyThinking: Record<string, string> | undefined;
}

// ── Config types ────────────────────────────────────────────────────────────

export type Segment =
  | "gitBranch"
  | "gitWorktree"
  | "gitUpstream"
  | "gitAhead"
  | "gitBranchDiff"
  | "gitWorkDiff"
  | "usage"
  | "cost"
  | "codex5h"
  | "codexWeekly"
  | "context"
  | "model"
  | "thinking"
  | "autoCompact"
  | "subagents"
  | "statuses";

const SEGMENTS: Segment[] = [
  "gitBranch",
  "gitWorktree",
  "gitUpstream",
  "gitAhead",
  "gitBranchDiff",
  "gitWorkDiff",
  "usage",
  "cost",
  "codex5h",
  "codexWeekly",
  "context",
  "model",
  "thinking",
  "autoCompact",
  "subagents",
  "statuses",
];

const SEGMENT_LABELS: Record<Segment, string> = {
  gitBranch: "Branch",
  gitWorktree: "Worktree",
  gitUpstream: "Upstream",
  gitAhead: "Ahead",
  gitBranchDiff: "Branch diff",
  gitWorkDiff: "Work diff",
  usage: "Tokens",
  cost: "Cost",
  codex5h: "Codex 5h",
  codexWeekly: "Codex week",
  context: "Context",
  model: "Model",
  thinking: "Thinking",
  autoCompact: "Auto-compact",
  subagents: "Subagents",
  statuses: "Statuses",
};

const GIT_SEGMENTS: Segment[] = [
  "gitBranch",
  "gitWorktree",
  "gitUpstream",
  "gitAhead",
  "gitBranchDiff",
  "gitWorkDiff",
];

type ToolbarLine = { left: Segment[]; right: Segment[] };

type ToolbarConfig = {
  lines: ToolbarLine[];
  /**
   * Segments parked out of view. Not rendered. Auto-populated with any
   * segment missing from `lines` so the JSON always shows the full set.
   * On conflict (a segment appears in both `lines` and `hidden`), `hidden`
   * wins — that lets you mute a segment by adding its name here without
   * having to delete it from a line.
   */
  hidden: Segment[];
  gitDiffStyle: "numbers" | "symbols" | "symbolsNumbers";
  gitBase: string;
  codexDisplay: "used" | "remaining";
  costCurrency: "USD" | "GBP";
  usdToGbp: number;
  codex5hWarning: number;
  codex5hError: number;
  codexWeeklyWarning: number;
  codexWeeklyError: number;
  showCodex5hReset: boolean;
  codex5hResetDisplay: "time" | "relative";
  showCodexWeeklyReset: boolean;
  codexWeeklyResetDisplay: "date" | "days";
  showCodexWeeklyResetTime: boolean;
  showContextTotal: boolean;
  contextAmount: "used" | "remaining" | "window";
  usageParts: { input: boolean; output: boolean; cacheRead: boolean; cacheWrite: boolean };
  modelDisplay: "id" | "providerId" | "provider";
  /** When true, replace the % text with a 5-stage Unicode pie glyph
   * (○ ◔ ◑ ◕ ●) that fills/empties to match the shown percentage. One flag
   * per percent-segment so they can be toggled independently. */
  pieContext: boolean;
  pieCodex5h: boolean;
  pieCodexWeekly: boolean;
  colors: Partial<Record<Segment, ThemeColor>>;
};

const HOME = process.env.HOME ?? "";
const CONFIG_PATH = join(HOME, ".pi", "agent", "config", "statusline.json");
const SETTINGS_PATH = join(HOME, ".pi", "agent", "settings.json");

const DEFAULT_CONFIG: ToolbarConfig = {
  lines: [
    {
      left: [
        "gitBranch",
        "gitUpstream",
        "gitAhead",
        "gitBranchDiff",
        "gitWorkDiff",
        "usage",
        "cost",
        "codex5h",
        "codexWeekly",
        "context",
      ],
      right: ["model", "autoCompact", "thinking", "statuses"],
    },
  ],
  hidden: ["gitWorktree", "subagents"],
  gitDiffStyle: "symbolsNumbers",
  gitBase: "origin/main",
  codexDisplay: "used",
  costCurrency: "USD",
  usdToGbp: 0.79,
  codex5hWarning: 80,
  codex5hError: 90,
  codexWeeklyWarning: 80,
  codexWeeklyError: 90,
  showCodex5hReset: true,
  codex5hResetDisplay: "time",
  showCodexWeeklyReset: true,
  codexWeeklyResetDisplay: "days",
  showCodexWeeklyResetTime: false,
  showContextTotal: false,
  contextAmount: "window",
  usageParts: { input: true, output: true, cacheRead: true, cacheWrite: true },
  modelDisplay: "id",
  pieContext: false,
  pieCodex5h: false,
  pieCodexWeekly: false,
  colors: {
    gitBranch: "accent",
    gitWorktree: "accent",
    gitUpstream: "accent",
    gitAhead: "accent",
    gitBranchDiff: "accent",
    gitWorkDiff: "accent",
    usage: "dim",
    cost: "dim",
    codex5h: "muted",
    codexWeekly: "muted",
    context: "dim",
    model: "dim",
    thinking: "dim",
    autoCompact: "dim",
    subagents: "dim",
    statuses: "dim",
  },
};

function parseToolbarConfig(raw: unknown): ToolbarConfig {
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_CONFIG);
  const parsed = raw as Partial<ToolbarConfig>;
  const filterValid = (items: Segment[] | undefined): Segment[] =>
    (items ?? []).filter((s) => SEGMENTS.includes(s));

  const lines = (parsed.lines ?? DEFAULT_CONFIG.lines)
    .map((line) => ({
      left: filterValid(line.left),
      right: filterValid(line.right),
    }))
    .filter((line) => line.left.length || line.right.length);
  if (!lines.length) lines.push({ left: [], right: [] });

  // Hidden wins over lines on conflict (lets you mute a segment by adding
  // its name to `hidden` without deleting it from a line). Sweep up any
  // unplaced segment so JSON always shows the full set.
  const hiddenSet = new Set<Segment>(filterValid(parsed.hidden));
  for (const line of lines) {
    line.left = line.left.filter((s) => !hiddenSet.has(s));
    line.right = line.right.filter((s) => !hiddenSet.has(s));
  }
  const placed = new Set(lines.flatMap((l) => [...l.left, ...l.right]));
  for (const s of SEGMENTS) if (!placed.has(s)) hiddenSet.add(s);

  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    lines,
    hidden: [...hiddenSet],
    colors: { ...DEFAULT_CONFIG.colors, ...(parsed.colors ?? {}) },
  };
}

function placedSegments(config: ToolbarConfig): Set<Segment> {
  return new Set(config.lines.flatMap((line) => [...line.left, ...line.right]));
}

function isVisible(config: ToolbarConfig, segment: Segment): boolean {
  return placedSegments(config).has(segment);
}

type SegmentPosition = {
  row: number;
  side: "left" | "right";
  beforeOnSide: Segment[];
};

function findSegmentPosition(
  lines: readonly ToolbarLine[],
  segment: Segment,
): SegmentPosition | undefined {
  for (let r = 0; r < lines.length; r++) {
    const line = lines[r]!;
    const leftIdx = line.left.indexOf(segment);
    if (leftIdx >= 0) {
      return { row: r, side: "left", beforeOnSide: line.left.slice(0, leftIdx) };
    }
    const rightIdx = line.right.indexOf(segment);
    if (rightIdx >= 0) {
      return {
        row: r,
        side: "right",
        beforeOnSide: line.right.slice(0, rightIdx),
      };
    }
  }
  return undefined;
}

/**
 * Toggle visibility for a segment.
 *  On → off: drop the segment from wherever it currently sits.
 *  Off → on: restore the segment to its line/side/index using, in order:
 *      1. `snapshot` (the config the user opened the menu with), so a
 *         off→on round-trip preserves a multi-line layout authored in
 *         statusline.json.
 *      2. DEFAULT_CONFIG, when the snapshot didn't have the segment.
 *      3. Last line, left side, as a final fallback.
 *  Multi-line layouts are honoured: missing rows are appended when the
 *  restored position is on a row that doesn't exist yet.
 */
function setVisible(
  config: ToolbarConfig,
  segment: Segment,
  visible: boolean,
  snapshot?: ToolbarConfig,
): void {
  // Remove from lines and from hidden — single source of truth either way.
  for (const line of config.lines) {
    line.left = line.left.filter((s) => s !== segment);
    line.right = line.right.filter((s) => s !== segment);
  }
  config.hidden = config.hidden.filter((s) => s !== segment);

  if (!visible) {
    config.hidden.push(segment);
    return;
  }

  const target =
    (snapshot && findSegmentPosition(snapshot.lines, segment)) ??
    findSegmentPosition(DEFAULT_CONFIG.lines, segment);
  if (!target) {
    const last = config.lines[config.lines.length - 1];
    if (last) last.left.push(segment);
    else config.lines.push({ left: [segment], right: [] });
    return;
  }
  while (config.lines.length <= target.row) {
    config.lines.push({ left: [], right: [] });
  }
  const lane = config.lines[target.row]![target.side];
  // Insert after the last surviving predecessor in the snapshot's order.
  let insertAt = 0;
  for (let i = target.beforeOnSide.length - 1; i >= 0; i--) {
    const idx = lane.indexOf(target.beforeOnSide[i]!);
    if (idx >= 0) {
      insertAt = idx + 1;
      break;
    }
  }
  lane.splice(insertAt, 0, segment);
}

// ── Segment painters ────────────────────────────────────────────────────────

type GitStats = {
  branch?: string;
  added: number;
  deleted: number;
  dirty: boolean;
  base?: string;
  ahead: number;
  behind: number;
  upstreamAhead: number;
  upstreamBehind: number;
  branchAdded: number;
  branchDeleted: number;
  worktree?: string;
  worktreeCount: number;
};

type UsageStats = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

type FooterData = {
  getExtensionStatuses(): ReadonlyMap<string, string>;
  getGitBranch(): string | null | undefined;
  onBranchChange(cb: () => void): () => void;
};

type PaintDeps = {
  config: ToolbarConfig;
  theme: { fg(color: ThemeColor, text: string): string };
  ctx: ExtensionContext;
  pi: ExtensionAPI;
  footerData: FooterData;
  git: GitStats;
  usage: UsageStats;
};

const initialGitStats = (): GitStats => ({
  added: 0,
  deleted: 0,
  dirty: false,
  ahead: 0,
  behind: 0,
  upstreamAhead: 0,
  upstreamBehind: 0,
  branchAdded: 0,
  branchDeleted: 0,
  worktreeCount: 0,
});

function segColor(deps: PaintDeps, segment: Segment): ThemeColor {
  return (deps.config.colors[segment] ?? "dim") as ThemeColor;
}

// Git
function gitDiffText(
  style: ToolbarConfig["gitDiffStyle"],
  kind: "branch" | "work",
  sign: "+" | "-",
  value: number,
): string {
  const prefix = kind === "branch" ? "^" : "@";
  if (style === "symbols") return `${prefix}${sign}`;
  if (style === "numbers") return `${prefix}${value}`;
  return `${prefix}${sign}${value}`;
}

function paintGitBranch(deps: PaintDeps): string | undefined {
  const { git, theme } = deps;
  if (!git.branch && !git.dirty) return undefined;
  return theme.fg(
    segColor(deps, "gitBranch"),
    `${git.branch ?? "git"}${git.dirty ? "*" : ""}`,
  );
}

function paintGitWorktree(deps: PaintDeps): string | undefined {
  const { git, theme } = deps;
  if (!git.worktree) return undefined;
  return theme.fg(
    segColor(deps, "gitWorktree"),
    `wt:${git.worktree}${git.worktreeCount > 1 ? `/${git.worktreeCount}` : ""}`,
  );
}

function paintGitAhead(deps: PaintDeps): string | undefined {
  const { git, theme } = deps;
  const parts: string[] = [];
  if (git.ahead) parts.push(theme.fg("success", `↑${git.ahead}`));
  if (git.behind) parts.push(theme.fg("warning", `↓${git.behind}`));
  return parts.length ? parts.join(" ") : undefined;
}

function paintGitUpstream(deps: PaintDeps): string | undefined {
  const { git, theme } = deps;
  const parts: string[] = [];
  if (git.upstreamAhead) parts.push(theme.fg("success", `⇡${git.upstreamAhead}`));
  if (git.upstreamBehind) parts.push(theme.fg("warning", `⇣${git.upstreamBehind}`));
  return parts.length ? parts.join(" ") : undefined;
}

function paintGitBranchDiff(deps: PaintDeps): string | undefined {
  const { git, theme, config } = deps;
  const parts: string[] = [];
  if (git.branchAdded)
    parts.push(theme.fg("success", gitDiffText(config.gitDiffStyle, "branch", "+", git.branchAdded)));
  if (git.branchDeleted)
    parts.push(theme.fg("error", gitDiffText(config.gitDiffStyle, "branch", "-", git.branchDeleted)));
  return parts.length ? parts.join(" ") : undefined;
}

function paintGitWorkDiff(deps: PaintDeps): string | undefined {
  const { git, theme, config } = deps;
  const parts: string[] = [];
  if (git.added)
    parts.push(theme.fg("success", gitDiffText(config.gitDiffStyle, "work", "+", git.added)));
  if (git.deleted)
    parts.push(theme.fg("error", gitDiffText(config.gitDiffStyle, "work", "-", git.deleted)));
  return parts.length ? parts.join(" ") : undefined;
}

// Usage (tokens)
function makeUsageMemo() {
  let cachedBranchLen = -1;
  let cachedLastId: unknown;
  let cached: UsageStats | undefined;
  return (ctx: { sessionManager: { getBranch(): unknown[] } }): UsageStats => {
    const branch = ctx.sessionManager.getBranch();
    const lastId = branch.length
      ? (branch[branch.length - 1] as { id?: unknown })?.id
      : undefined;
    if (cached && branch.length === cachedBranchLen && lastId === cachedLastId)
      return cached;
    let input = 0,
      output = 0,
      cacheRead = 0,
      cacheWrite = 0,
      cost = 0;
    for (const e of branch as Array<{
      type: string;
      message?: { role?: string };
      id?: unknown;
    }>) {
      if (e.type !== "message" || e.message?.role !== "assistant") continue;
      const m = (e as unknown as { message: AssistantMessage }).message;
      input += m.usage?.input ?? 0;
      output += m.usage?.output ?? 0;
      cacheRead += m.usage?.cacheRead ?? 0;
      cacheWrite += m.usage?.cacheWrite ?? 0;
      cost += m.usage?.cost?.total ?? 0;
    }
    cached = { input, output, cacheRead, cacheWrite, cost };
    cachedBranchLen = branch.length;
    cachedLastId = lastId;
    return cached;
  };
}

function paintUsage(deps: PaintDeps): string | undefined {
  const { theme, config, usage } = deps;
  const parts = config.usageParts;
  const text = [
    parts.input ? `↑${fmtTokens(usage.input)}` : undefined,
    parts.output ? `↓${fmtTokens(usage.output)}` : undefined,
    parts.cacheRead && usage.cacheRead ? `R${fmtTokens(usage.cacheRead)}` : undefined,
    parts.cacheWrite && usage.cacheWrite ? `W${fmtTokens(usage.cacheWrite)}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return text ? theme.fg(segColor(deps, "usage"), text) : undefined;
}

// Cost
function paintCost(deps: PaintDeps): string | undefined {
  const { theme, config, usage } = deps;
  return theme.fg(
    segColor(deps, "cost"),
    fmtCostCurrency(usage.cost, config.costCurrency, config.usdToGbp),
  );
}

// Codex (reads globalThis.__piCodexQuotas)
type QuotaWindow = {
  usedPercent: number;
  windowSeconds: number;
  resetAt?: number;
};
type CodexUsage = {
  fiveHour?: QuotaWindow;
  weekly?: QuotaWindow;
  fetchedAt?: number;
};
declare global {
  // eslint-disable-next-line no-var
  var __piCodexQuotas: CodexUsage | undefined;
}

function fmtCodexReset(
  resetAt: number | undefined,
  display: "date" | "days" | "time" | "relative",
  showTime: boolean,
): string | undefined {
  if (!resetAt) return undefined;
  const date = new Date(resetAt * 1000);
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (display === "time") return time;
  if (display === "relative") {
    const totalMin = Math.max(0, Math.round((resetAt * 1000 - Date.now()) / 60000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h${m}m` : `${m}m`;
  }
  if (display === "date") {
    const day = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return showTime ? `${day} ${time}` : day;
  }
  const days = Math.max(
    0,
    Math.ceil((resetAt * 1000 - Date.now()) / (24 * 60 * 60 * 1000)),
  );
  return showTime ? `${days}d ${time}` : `${days}d`;
}

function codexPart(
  label: string,
  window: QuotaWindow | undefined,
  display: ToolbarConfig["codexDisplay"],
  showReset: boolean,
  resetDisplay: "date" | "days" | "time" | "relative",
  showResetTime: boolean,
  usePie: boolean,
): string | undefined {
  if (!window) return undefined;
  const used = Math.round(Math.max(0, Math.min(100, window.usedPercent)));
  const shown = display === "remaining" ? 100 - used : used;
  const reset = showReset
    ? fmtCodexReset(window.resetAt, resetDisplay, showResetTime)
    : undefined;
  const main = usePie ? pieChar(shown) : `${shown}%`;
  return `${label} ${main}${reset ? ` ${reset}` : ""}`;
}

function paintCodex5h(deps: PaintDeps): string | undefined {
  const { theme, config } = deps;
  const codex = globalThis.__piCodexQuotas;
  const p = codexPart(
    "5h",
    codex?.fiveHour,
    config.codexDisplay,
    config.showCodex5hReset,
    config.codex5hResetDisplay,
    true,
    config.pieCodex5h,
  );
  if (!p) return undefined;
  const color = percentColour(
    codex?.fiveHour?.usedPercent,
    segColor(deps, "codex5h"),
    config.codex5hWarning,
    config.codex5hError,
  );
  return theme.fg(color, p);
}

function paintCodexWeekly(deps: PaintDeps): string | undefined {
  const { theme, config } = deps;
  const codex = globalThis.__piCodexQuotas;
  const p = codexPart(
    "wk",
    codex?.weekly,
    config.codexDisplay,
    config.showCodexWeeklyReset,
    config.codexWeeklyResetDisplay,
    config.showCodexWeeklyResetTime,
    config.pieCodexWeekly,
  );
  if (!p) return undefined;
  const color = percentColour(
    codex?.weekly?.usedPercent,
    segColor(deps, "codexWeekly"),
    config.codexWeeklyWarning,
    config.codexWeeklyError,
  );
  return theme.fg(color, p);
}

// Context
function paintContext(deps: PaintDeps): string | undefined {
  const { theme, config, ctx } = deps;
  const c = ctx as unknown as {
    getContextUsage?(): {
      percent?: number | null;
      contextWindow?: number;
      limit?: number;
      max?: number;
    } | undefined;
    model?: { contextWindow?: number };
  };
  const usage = c.getContextUsage?.();
  if (!usage || usage.percent === null || usage.percent === undefined)
    return undefined;
  const rawPercent = usage.percent;
  const contextWindow =
    typeof c.model?.contextWindow === "number"
      ? c.model.contextWindow
      : typeof usage.contextWindow === "number"
        ? usage.contextWindow
        : typeof usage.limit === "number"
          ? usage.limit
          : typeof usage.max === "number"
            ? usage.max
            : undefined;
  const used =
    contextWindow !== undefined ? contextWindow * (rawPercent / 100) : 0;
  // Pull the indicator parameters from shared prefs — colour always
  // follows the usable marker, percentage follows the chosen basis.
  const prefs = libPrefs().get().context;
  const displayPercent =
    contextWindow !== undefined
      ? fillPercent(used, prefs.fillBasis, prefs.usableTokens, contextWindow)
      : rawPercent;
  const amount =
    config.contextAmount === "used"
      ? used
      : config.contextAmount === "remaining" && contextWindow !== undefined
        ? contextWindow - used
        : contextWindow;
  const shown = Math.round(displayPercent);
  const main = config.pieContext ? pieChar(shown) : `${shown}%`;
  const text = `ctx ${main}${config.showContextTotal && amount !== undefined ? ` ${fmtTokens(amount)}` : ""}`;
  const color = usableMarkerColour(
    used,
    prefs.usableTokens,
    prefs.tolerancePercent,
    segColor(deps, "context"),
  );
  return theme.fg(color, text);
}

// Model
function paintModel(deps: PaintDeps): string | undefined {
  const { theme, config, ctx } = deps;
  const provider = ctx.model?.provider ?? "no-provider";
  const id = ctx.model?.id ?? "no-model";
  const text =
    config.modelDisplay === "provider"
      ? provider
      : config.modelDisplay === "providerId"
        ? `${provider}:${id}`
        : id;
  return theme.fg(segColor(deps, "model"), text);
}

// Status / auto-compact / thinking
let cachedAutoCompact: { value: boolean | undefined; at: number } | undefined;
function settingsAutoCompact(): boolean | undefined {
  const now = Date.now();
  if (cachedAutoCompact && now - cachedAutoCompact.at < 2000)
    return cachedAutoCompact.value;
  let value: boolean | undefined;
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    const raw = parsed?.compaction?.enabled ?? parsed?.autoCompact;
    if (typeof raw === "boolean") value = raw;
  } catch {
    /* settings file missing or unparseable — leave undefined */
  }
  cachedAutoCompact = { value, at: now };
  return value;
}

function paintAutoCompact(deps: PaintDeps): string | undefined {
  const { theme, ctx } = deps;
  const c = ctx as unknown as {
    getAutoCompactionEnabled?: () => boolean;
    autoCompactionEnabled?: boolean;
  };
  const enabled =
    c.getAutoCompactionEnabled?.() ??
    c.autoCompactionEnabled ??
    settingsAutoCompact() ??
    true;
  return theme.fg(segColor(deps, "autoCompact"), enabled ? "auto" : "manual");
}

const THINKING_LEVELS: ReadonlySet<string> = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

function paintThinking(deps: PaintDeps): string | undefined {
  const { theme, pi } = deps;
  const level = pi.getThinkingLevel();
  // Prefer the per-level hex map published by omarchy-theme — that stays
  // per-level even when the editor-border override is on. Fall back to the
  // matching pi theme token when omarchy-theme isn't loaded.
  const hex = globalThis.__piOmarchyThinking?.[level];
  if (hex) return paintHex(hex, level);
  if (THINKING_LEVELS.has(level)) {
    const token = `thinking${level[0].toUpperCase()}${level.slice(1)}`;
    return theme.fg(token as ThemeColor, level);
  }
  return theme.fg(segColor(deps, "thinking"), level);
}

function paintSubagents(deps: PaintDeps): string | undefined {
  const { theme, footerData } = deps;
  const entries = [...footerData.getExtensionStatuses().entries()] as Array<
    [string, string]
  >;
  const statuses = entries
    .filter(
      ([key, value]) =>
        /subagent|agent/i.test(key) || /subagent|agent/i.test(value),
    )
    .map(([, value]) => value);
  return statuses.length
    ? theme.fg(segColor(deps, "subagents"), statuses.join(" "))
    : undefined;
}

function paintStatuses(deps: PaintDeps): string | undefined {
  const { theme, footerData } = deps;
  const entries = [...footerData.getExtensionStatuses().entries()] as Array<
    [string, string]
  >;
  const statuses = entries
    .filter(
      ([key, value]) =>
        !/subagent|agent/i.test(key) && !/subagent|agent/i.test(value),
    )
    .map(([, value]) => value);
  return statuses.length
    ? theme.fg(segColor(deps, "statuses"), statuses.join(" "))
    : undefined;
}

const PAINTERS: Record<Segment, (deps: PaintDeps) => string | undefined> = {
  gitBranch: paintGitBranch,
  gitWorktree: paintGitWorktree,
  gitUpstream: paintGitUpstream,
  gitAhead: paintGitAhead,
  gitBranchDiff: paintGitBranchDiff,
  gitWorkDiff: paintGitWorkDiff,
  usage: paintUsage,
  cost: paintCost,
  codex5h: paintCodex5h,
  codexWeekly: paintCodexWeekly,
  context: paintContext,
  model: paintModel,
  thinking: paintThinking,
  autoCompact: paintAutoCompact,
  subagents: paintSubagents,
  statuses: paintStatuses,
};

// ── Settings UI — sectioned spec → CycleMenu ───────────────────────────────
//
// Layout (which segments sit on which row/side) is governed by JSON only.
// The menu groups the controls into sections (rendered as CycleMenu
// headings) and assigns a `read`/`write` pair to each row so we don't have
// to maintain parallel arrays for build- and apply-time.

const OFF_ON = ["off", "on"] as const;
const PERCENT_VALUES: readonly string[] = Array.from(
  { length: 21 },
  (_, i) => `${i * 5}`,
);

type Op = {
  label: string;
  values: readonly string[];
  read(cfg: ToolbarConfig): string;
  write(cfg: ToolbarConfig, value: string, snapshot?: ToolbarConfig): void;
};

type MenuEntry = { heading: string } | { op: Op };

// Helpers — keep MENU below short and readable. Each returns a MenuEntry.

function visOp(seg: Segment): MenuEntry {
  return {
    op: {
      label: SEGMENT_LABELS[seg],
      values: OFF_ON,
      read: (cfg) => (isVisible(cfg, seg) ? "on" : "off"),
      write: (cfg, v, snap) => setVisible(cfg, seg, v === "on", snap),
    },
  };
}

// Visibility row that bundles a sub-toggle into a 3-value cycle.
function visComboOp(args: {
  segment: Segment;
  values: readonly string[];
  read(cfg: ToolbarConfig): string;
  write(cfg: ToolbarConfig, value: string, snapshot?: ToolbarConfig): void;
}): MenuEntry {
  return {
    op: {
      label: SEGMENT_LABELS[args.segment],
      values: args.values,
      read: args.read,
      write: args.write,
    },
  };
}

type ToggleKey = "pieContext" | "pieCodex5h" | "pieCodexWeekly";
function toggleOp(key: ToggleKey, label: string): MenuEntry {
  return {
    op: {
      label,
      values: OFF_ON,
      read: (cfg) => (cfg[key] ? "on" : "off"),
      write: (cfg, v) => {
        cfg[key] = v === "on";
      },
    },
  };
}

function usageOp(
  key: keyof ToolbarConfig["usageParts"],
  label: string,
): MenuEntry {
  return {
    op: {
      label,
      values: OFF_ON,
      read: (cfg) => (cfg.usageParts[key] ? "on" : "off"),
      write: (cfg, v) => {
        cfg.usageParts[key] = v === "on";
      },
    },
  };
}

type CycleKey =
  | "gitDiffStyle"
  | "modelDisplay"
  | "contextAmount"
  | "costCurrency"
  | "codexDisplay"
  | "codex5hResetDisplay";

function cycleOp(
  key: CycleKey,
  label: string,
  values: readonly string[],
): MenuEntry {
  return {
    op: {
      label,
      values,
      read: (cfg) => String(cfg[key]),
      write: (cfg, v) => {
        (cfg[key] as string) = v;
      },
    },
  };
}

type PercentKey =
  | "codex5hWarning"
  | "codex5hError"
  | "codexWeeklyWarning"
  | "codexWeeklyError";

function percentOp(key: PercentKey, label: string): MenuEntry {
  return {
    op: {
      label,
      values: PERCENT_VALUES,
      read: (cfg) => String(cfg[key]),
      write: (cfg, v) => {
        cfg[key] = Number(v);
      },
    },
  };
}

// Sections are organised by concern (git, tokens, context, vendor quotas,
// cost, model, session). Everything you might want to tweak for a concern
// lives in that section: visibility, display, pie, thresholds, sub-toggles.
const MENU: readonly MenuEntry[] = [
  { heading: "Git" },
  visOp("gitBranch"),
  visOp("gitWorktree"),
  visOp("gitUpstream"),
  visOp("gitAhead"),
  visOp("gitBranchDiff"),
  visOp("gitWorkDiff"),
  cycleOp("gitDiffStyle", "Diff style", ["symbols", "symbolsNumbers", "numbers"]),

  { heading: "Tokens" },
  visOp("usage"),
  usageOp("input", "Input"),
  usageOp("output", "Output"),
  usageOp("cacheRead", "Cache read"),
  usageOp("cacheWrite", "Cache write"),

  { heading: "Context" },
  visComboOp({
    segment: "context",
    values: ["off", "%", "% + amount"],
    read: (cfg) =>
      !isVisible(cfg, "context")
        ? "off"
        : cfg.showContextTotal
          ? "% + amount"
          : "%",
    write: (cfg, v, snap) => {
      setVisible(cfg, "context", v !== "off", snap);
      cfg.showContextTotal = v === "% + amount";
    },
  }),
  cycleOp("contextAmount", "Amount unit", ["used", "remaining", "window"]),
  toggleOp("pieContext", "Pie"),

  { heading: "Codex (vendor)" },
  visComboOp({
    segment: "codex5h",
    values: ["off", "%", "% + reset"],
    read: (cfg) =>
      !isVisible(cfg, "codex5h")
        ? "off"
        : cfg.showCodex5hReset
          ? "% + reset"
          : "%",
    write: (cfg, v, snap) => {
      setVisible(cfg, "codex5h", v !== "off", snap);
      cfg.showCodex5hReset = v === "% + reset";
    },
  }),
  visComboOp({
    segment: "codexWeekly",
    values: ["off", "%", "% + reset"],
    read: (cfg) =>
      !isVisible(cfg, "codexWeekly")
        ? "off"
        : cfg.showCodexWeeklyReset
          ? "% + reset"
          : "%",
    write: (cfg, v, snap) => {
      setVisible(cfg, "codexWeekly", v !== "off", snap);
      cfg.showCodexWeeklyReset = v === "% + reset";
    },
  }),
  cycleOp("codexDisplay", "Unit", ["used", "remaining"]),
  cycleOp("codex5hResetDisplay", "5h reset format", ["time", "relative"]),
  toggleOp("pieCodex5h", "5h pie"),
  toggleOp("pieCodexWeekly", "Week pie"),
  percentOp("codex5hWarning", "5h warning %"),
  percentOp("codex5hError", "5h error %"),
  percentOp("codexWeeklyWarning", "Week warning %"),
  percentOp("codexWeeklyError", "Week error %"),

  { heading: "Cost" },
  visOp("cost"),
  cycleOp("costCurrency", "Currency", ["USD", "GBP"]),

  { heading: "Model" },
  visOp("model"),
  cycleOp("modelDisplay", "Format", ["id", "providerId", "provider"]),

  { heading: "Session" },
  visOp("thinking"),
  visOp("autoCompact"),
  visOp("subagents"),
  visOp("statuses"),
];

function buildRows(cfg: ToolbarConfig): CycleRow[] {
  return MENU.map((entry) => {
    if ("heading" in entry) {
      return { kind: "heading", name: entry.heading };
    }
    const op = entry.op;
    return {
      name: op.label,
      values: op.values,
      initialIndex: Math.max(0, op.values.indexOf(op.read(cfg))),
    };
  });
}

/**
 * Project a row-index vector back onto a ToolbarConfig, starting from `base`.
 *
 * `base` doubles as the snapshot used by setVisible() to restore a segment's
 * original line/side when an off→on cycle round-trips. That's how a manual
 * multi-line layout in statusline.json survives the menu.
 */
function applyRows(base: ToolbarConfig, idxs: readonly number[]): ToolbarConfig {
  const next = structuredClone(base);
  MENU.forEach((entry, i) => {
    if ("heading" in entry) return;
    entry.op.write(next, entry.op.values[idxs[i]!]!, base);
  });
  return next;
}

// ── Extension entry ─────────────────────────────────────────────────────────

export default function statusline(pi: ExtensionAPI) {
  const config = new Config<ToolbarConfig>({
    userPath: CONFIG_PATH,
    defaults: DEFAULT_CONFIG,
    parse: parseToolbarConfig,
  });

  let requestRender: (() => void) | undefined;
  let refreshGitForActive: (() => void) | undefined;
  const usageMemo = makeUsageMemo();
  const diag = new Diagnostics("statusline");
  const reportedSegmentErrors = new Set<string>();

  function paintSafe(seg: Segment, deps: PaintDeps): string | undefined {
    try {
      return PAINTERS[seg]?.(deps);
    } catch (err) {
      if (!reportedSegmentErrors.has(seg)) {
        reportedSegmentErrors.add(seg);
        diag.record(deps.ctx, "segment-error", {
          segment: seg,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return undefined;
    }
  }

  pi.registerCommand("statusline", {
    description:
      "Configure statusline visibility + options. Layout lives in statusline.json.",
    handler: async (_args, ctx) => {
      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        return openConfigMenu<ToolbarConfig>(
          tui,
          theme as MenuTheme,
          () => done(),
          {
            config,
            buildRows,
            applyRows,
            sideEffect: () => requestRender?.(),
            title: "Statusline",
          },
        );
      });
    },
  });

  config.watch();
  config.onChange(() => {
    requestRender?.();
  });

  pi.on("session_start", (_event, ctx) => {
    reportedSegmentErrors.clear();
    let git: GitStats = initialGitStats();

    const refreshGit = async () => {
      const c = config.get();
      const placed = placedSegments(c);
      if (!GIT_SEGMENTS.some((s) => placed.has(s))) {
        git = initialGitStats();
        requestRender?.();
        return;
      }
      const base = c.gitBase;
      const [
        branchResult,
        statusResult,
        workDiffResult,
        branchDiffResult,
        aheadBehindResult,
        upstreamResult,
        topLevelResult,
        worktreeResult,
      ] = await Promise.all([
        pi.exec("git", ["branch", "--show-current"], { cwd: ctx.cwd }).catch(() => undefined),
        pi.exec("git", ["status", "--porcelain"], { cwd: ctx.cwd }).catch(() => undefined),
        pi.exec("git", ["diff", "--numstat", "HEAD"], { cwd: ctx.cwd }).catch(() => undefined),
        pi.exec("git", ["diff", "--numstat", `${base}...HEAD`], { cwd: ctx.cwd }).catch(() => undefined),
        pi.exec("git", ["rev-list", "--left-right", "--count", `${base}...HEAD`], { cwd: ctx.cwd }).catch(() => undefined),
        pi.exec("git", ["rev-list", "--left-right", "--count", "@{u}...HEAD"], { cwd: ctx.cwd }).catch(() => undefined),
        pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd: ctx.cwd }).catch(() => undefined),
        pi.exec("git", ["worktree", "list", "--porcelain"], { cwd: ctx.cwd }).catch(() => undefined),
      ]);
      const workDiff = parseNumstat(workDiffResult?.stdout);
      const branchDiff = parseNumstat(branchDiffResult?.stdout);
      const [behindRaw, aheadRaw] = (aheadBehindResult?.stdout.trim() ?? "").split(/\s+/);
      const [upstreamBehindRaw, upstreamAheadRaw] = (upstreamResult?.stdout.trim() ?? "").split(/\s+/);
      const topLevel = topLevelResult?.stdout.trim();
      const worktreeCount = (worktreeResult?.stdout.match(/^worktree /gm) ?? []).length;
      git = {
        branch: branchResult?.stdout.trim() || undefined,
        added: workDiff.added,
        deleted: workDiff.deleted,
        dirty: Boolean(statusResult?.stdout.trim()),
        base: branchDiffResult ? base : undefined,
        ahead: Number.parseInt(aheadRaw ?? "", 10) || 0,
        behind: Number.parseInt(behindRaw ?? "", 10) || 0,
        upstreamAhead: Number.parseInt(upstreamAheadRaw ?? "", 10) || 0,
        upstreamBehind: Number.parseInt(upstreamBehindRaw ?? "", 10) || 0,
        branchAdded: branchDiff.added,
        branchDeleted: branchDiff.deleted,
        worktree: topLevel ? topLevel.split("/").filter(Boolean).pop() : undefined,
        worktreeCount,
      };
      requestRender?.();
    };

    refreshGitForActive = () => void refreshGit();

    // Explicit clear of any default/previous footer, then install ours.
    ctx.ui.setFooter(undefined);
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      const unsub = footerData.onBranchChange(() => {
        void refreshGit();
        tui.requestRender();
      });
      return {
        dispose: () => {
          unsub();
        },
        invalidate() {},
        render(width: number): string[] {
          const c = config.get();
          const sep = theme.fg("dim", " · ");
          const deps: PaintDeps = {
            config: c,
            theme: theme as { fg(color: ThemeColor, text: string): string },
            ctx,
            pi,
            footerData,
            git,
            usage: usageMemo(ctx),
          };
          return c.lines.map((line) => {
            const left = line.left
              .map((s) => paintSafe(s, deps))
              .filter(Boolean)
              .join(sep);
            const right = line.right
              .map((s) => paintSafe(s, deps))
              .filter(Boolean)
              .join(sep);
            const pad = " ".repeat(
              Math.max(1, width - visibleWidth(left) - visibleWidth(right)),
            );
            return truncateToWidth(left + pad + right, width);
          });
        },
      };
    });
    void refreshGit();
  });

  pi.on("tool_execution_end", () => refreshGitForActive?.());
  pi.on("tool_result", () => refreshGitForActive?.());
  pi.on("turn_end", () => {
    refreshGitForActive?.();
    requestRender?.();
  });
  pi.on("agent_end", () => {
    refreshGitForActive?.();
    requestRender?.();
  });
  pi.on("session_shutdown", () => {
    requestRender = undefined;
    refreshGitForActive = undefined;
  });
}
