/**
 * `/config` and `/stats` entry points.
 *
 *  - `/config` opens the settings hub: Statusline, Response metrics, plus
 *              an Advanced submenu (Hooks, Permissions, Highlight colour,
 *              Extensions).
 *
 *  - `/stats`  opens a tabbed dashboard:
 *              Session  – current-session cost, tokens, context, model
 *              Quotas   – vendor (Codex 5h + weekly) windows
 *              Stats    – 13-week heatmap + cumulative totals
 *              Models   – tokens-per-day chart + per-model breakdown
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ThemeColor,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type SettingItem,
  SettingsList,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { type ConfigPage, getConfigPages } from "./lib/config-pages.ts";
import { fmtCostCurrency, fmtTokens } from "./lib/format.ts";
import {
  HEATMAP_LEGEND,
  heatmap,
} from "./lib/heatmap.ts";
import { KNOWN_EXTENSIONS, manifestConfig } from "./lib/manifest.ts";
import {
  type Aggregates,
  getAggregates,
} from "./lib/sessions.ts";
import { wrapWithBorders } from "./lib/settings-list.ts";
import { barChart } from "./lib/sparkline.ts";
import { type Tab, TabsView } from "./lib/tabs.ts";
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  highlightTheme,
  type ThemeFg,
} from "./lib/theme.ts";
import { getHighlightColor, setHighlightColor } from "./lib/ui-config.ts";

const MAIN_PAGE_IDS = ["statusline", "metrics"];

// ── Shared session/quota readers ────────────────────────────────────────────

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

type SessionUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

function sessionUsage(ctx: ExtensionContext): SessionUsage {
  let input = 0,
    output = 0,
    cacheRead = 0,
    cacheWrite = 0,
    cost = 0;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type !== "message" || e.message.role !== "assistant") continue;
    const m = e.message as AssistantMessage;
    input += m.usage?.input ?? 0;
    output += m.usage?.output ?? 0;
    cacheRead += m.usage?.cacheRead ?? 0;
    cacheWrite += m.usage?.cacheWrite ?? 0;
    cost += m.usage?.cost?.total ?? 0;
  }
  return { input, output, cacheRead, cacheWrite, cost };
}

// ── Static-content tab body ─────────────────────────────────────────────────

class StaticView implements Component {
  constructor(private readonly renderFn: (width: number) => string[]) {}
  invalidate(): void {}
  render(width: number): string[] {
    return this.renderFn(width);
  }
}

// ── /stats: Session tab ─────────────────────────────────────────────────────

function fmtDurationMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) return secs ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  return `${hours}h ${remMin}m`;
}

function sessionWallMs(ctx: ExtensionContext): number {
  let first: number | undefined;
  let last: number | undefined;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type !== "message") continue;
    const ts = (e.message as { timestamp?: string }).timestamp;
    if (!ts) continue;
    const t = Date.parse(ts);
    if (Number.isNaN(t)) continue;
    if (first === undefined || t < first) first = t;
    if (last === undefined || t > last) last = t;
  }
  return first !== undefined && last !== undefined ? last - first : 0;
}

function renderSessionTab(
  ctx: ExtensionContext,
  theme: ThemeFg & { fg(color: ThemeColor, text: string): string },
  width: number,
): string[] {
  const usage = sessionUsage(ctx);
  const ctxUsage = ctx.getContextUsage?.();
  const ctxPercent =
    ctxUsage && typeof ctxUsage.percent === "number"
      ? Math.round(ctxUsage.percent)
      : undefined;
  const wallMs = sessionWallMs(ctx);
  const labelW = 22;
  const lines: string[] = [];

  const sectionTitle = (text: string) =>
    theme.fg(getHighlightColor(), text);
  const row = (label: string, value: string) =>
    `${theme.fg("dim", `${label}:`.padEnd(labelW))}${theme.fg("text", value)}`;

  lines.push(sectionTitle("Session"));
  lines.push(row("Total cost", fmtCostCurrency(usage.cost, "GBP", 0.79)));
  lines.push(row("Total duration (wall)", wallMs > 0 ? fmtDurationMs(wallMs) : "0s"));
  if (ctx.model?.id) lines.push(row("Model", ctx.model.id));
  if (ctxPercent !== undefined)
    lines.push(row("Context", `${ctxPercent}% used`));
  lines.push(
    row(
      "Usage",
      `${fmtTokens(usage.input)} input, ${fmtTokens(usage.output)} output, ${fmtTokens(usage.cacheRead)} cache read, ${fmtTokens(usage.cacheWrite)} cache write`,
    ),
  );

  return lines.map((l) => truncateToWidth(l, width));
}

// ── /stats: Quotas tab ──────────────────────────────────────────────────────

function quotaBar(
  percent: number,
  width: number,
  theme: ThemeFg & { fg(color: ThemeColor, text: string): string },
): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = Math.max(0, width - filled);
  return (
    theme.fg(getHighlightColor(), "█".repeat(filled)) +
    theme.fg("dim", "█".repeat(empty))
  );
}

function fmtResetTime(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${time} (${tz})`;
}

function fmtResetDate(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${date}, ${time} (${tz})`;
}

function renderQuotasTab(
  theme: ThemeFg & { fg(color: ThemeColor, text: string): string },
  width: number,
): string[] {
  const quotas = globalThis.__piCodexQuotas;
  const lines: string[] = [];
  const sectionTitle = (text: string) =>
    theme.fg(getHighlightColor(), text);
  const barW = Math.min(56, Math.max(24, width - 16));

  const renderWindow = (
    title: string,
    used: number,
    resetAt: number | undefined,
    resetFmt: (s: number) => string,
  ) => {
    if (lines.length) lines.push("");
    lines.push(sectionTitle(title));
    const u = Math.round(used);
    lines.push(`${quotaBar(u, barW, theme)} ${theme.fg("text", `${u}% used`)}`);
    if (resetAt !== undefined)
      lines.push(theme.fg("dim", `Resets ${resetFmt(resetAt)}`));
  };

  if (quotas?.fiveHour) {
    renderWindow(
      "Current session",
      quotas.fiveHour.usedPercent,
      quotas.fiveHour.resetAt,
      fmtResetTime,
    );
  }

  if (quotas?.weekly) {
    renderWindow(
      "Current week (all models)",
      quotas.weekly.usedPercent,
      quotas.weekly.resetAt,
      fmtResetDate,
    );
  }

  if (!quotas?.fiveHour && !quotas?.weekly) {
    lines.push(theme.fg("dim", "No vendor quotas available."));
    lines.push(
      theme.fg(
        "dim",
        "(Codex quotas appear here when signed into openai-codex.)",
      ),
    );
  }

  if (quotas?.fetchedAt) {
    lines.push("");
    lines.push(
      theme.fg(
        "dim",
        `Quotas refreshed ${Math.round((Date.now() - quotas.fetchedAt) / 1000)}s ago`,
      ),
    );
  }

  return lines.map((l) => truncateToWidth(l, width));
}

// ── /stats: Stats + Models tabs ─────────────────────────────────────────────

function fmtBigTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function fmtDurationLong(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${totalSec}s`;
}

/** Visible (printable) length of a string with ANSI codes stripped. */
function bareLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function twoColumnRows(
  pairs: { label: string; value: string }[],
  width: number,
  theme: ThemeFg & { fg(color: ThemeColor, text: string): string },
): string[] {
  // Each cell is rendered at its natural width (`label: value`, no internal
  // padding). The right column starts at a fixed offset equal to the
  // widest left cell + a small gap. Claude-style — labels stay flush to
  // their value, the second column aligns across rows.
  const leftPairs = pairs.filter((_, i) => i % 2 === 0);
  const cellLen = (p: { label: string; value: string }) =>
    p.label.length + 2 + p.value.length; // "label: value"
  const leftCellW = Math.max(...leftPairs.map(cellLen), 0);
  const gap = 6;
  const colStart = leftCellW + gap;
  const minWidth = colStart + 12;
  const fits = width >= minWidth;

  const out: string[] = [];
  const renderCell = (p: { label: string; value: string }) =>
    `${theme.fg("dim", `${p.label}:`)} ${theme.fg("text", p.value)}`;

  for (let i = 0; i < pairs.length; i += 2) {
    const left = renderCell(pairs[i]);
    const right = pairs[i + 1] ? renderCell(pairs[i + 1]) : "";
    if (!right) {
      out.push(left);
    } else if (fits) {
      const padLen = Math.max(gap, colStart - bareLen(left));
      out.push(`${left}${" ".repeat(padLen)}${right}`);
    } else {
      out.push(left);
      out.push(right);
    }
  }
  return out;
}

function activeDays(agg: Aggregates, days: number): number {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  let count = 0;
  for (const [key, b] of agg.byDay) {
    if (b.tokens <= 0) continue;
    const d = new Date(`${key}T00:00:00`);
    if (d >= cutoff && d <= now) count++;
  }
  return count;
}

function streaks(agg: Aggregates): { longest: number; current: number } {
  const keys = [...agg.byDay.keys()].filter((k) => (agg.byDay.get(k)?.tokens ?? 0) > 0).sort();
  if (!keys.length) return { longest: 0, current: 0 };
  const dates = keys.map((k) => new Date(`${k}T00:00:00`).getTime());
  let longest = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const gap = (dates[i] - dates[i - 1]) / 86_400_000;
    if (gap <= 1.5) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }
  // Current streak: trailing run ending today or yesterday.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastDay = new Date(dates[dates.length - 1]);
  const isCurrent =
    lastDay.getTime() === today.getTime() ||
    lastDay.getTime() === yesterday.getTime();
  let current = 0;
  if (isCurrent) {
    current = 1;
    for (let i = dates.length - 1; i > 0; i--) {
      const gap = (dates[i] - dates[i - 1]) / 86_400_000;
      if (gap <= 1.5) current++;
      else break;
    }
  }
  return { longest, current };
}

function mostActiveDay(agg: Aggregates): string | undefined {
  let topKey: string | undefined;
  let top = 0;
  for (const [key, b] of agg.byDay) {
    if (b.tokens > top) {
      top = b.tokens;
      topKey = key;
    }
  }
  if (!topKey) return undefined;
  const [y, m, d] = topKey.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function renderStatsOverview(
  agg: Aggregates,
  theme: ThemeFg & { fg(color: ThemeColor, text: string): string },
  width: number,
): string[] {
  const lines: string[] = [];
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 13 * 7);
  const hm = heatmap({
    start,
    end,
    valueAt: (key) => agg.byDay.get(key)?.tokens,
  });
  for (const l of hm) {
    lines.push(theme.fg(getHighlightColor(), l));
  }
  lines.push("");
  lines.push(theme.fg("dim", HEATMAP_LEGEND));
  lines.push("");

  // Range header — Claude shows "All time · Last 7 days · Last 30 days"
  // as a cycle control. We render the active selection in the highlight
  // colour and the alternates dim. Cycling is a follow-up.
  lines.push(
    `${theme.fg(getHighlightColor(), "All time")} ${theme.fg("dim", "· Last 7 days · Last 30 days")}`,
  );
  lines.push("");

  const active = activeDays(agg, 30);
  const { longest: longestStreak, current: currentStreak } = streaks(agg);
  const mostActive = mostActiveDay(agg);

  const pairs: { label: string; value: string }[] = [
    { label: "Favourite model", value: agg.totals.favoriteModel ?? "(none)" },
    { label: "Total tokens", value: fmtBigTokens(agg.totals.tokens) },
    { label: "Sessions", value: `${agg.totals.sessions}` },
    {
      label: "Longest session",
      value:
        agg.totals.longestMs > 0 ? fmtDurationLong(agg.totals.longestMs) : "—",
    },
    { label: "Active days", value: `${active}/30` },
    {
      label: "Longest streak",
      value: `${longestStreak} day${longestStreak === 1 ? "" : "s"}`,
    },
    { label: "Most active day", value: mostActive ?? "—" },
    {
      label: "Current streak",
      value: `${currentStreak} day${currentStreak === 1 ? "" : "s"}`,
    },
  ];

  for (const row of twoColumnRows(pairs, width, theme)) {
    lines.push(row);
  }

  return lines.map((l) => truncateToWidth(l, width));
}

function renderStatsModels(
  agg: Aggregates,
  theme: ThemeFg & { fg(color: ThemeColor, text: string): string },
  width: number,
): string[] {
  const lines: string[] = [];

  const days: { key: string; tokens: number; label: string }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const key = `${y}-${m}-${day}`;
    const v = agg.byDay.get(key)?.tokens ?? 0;
    const label = `${d.getDate()}`;
    days.push({ key, tokens: v, label });
  }
  lines.push(theme.fg(getHighlightColor(), "Tokens per Day"));
  lines.push("");
  const chart = barChart({
    values: days.map((d) => d.tokens),
    labels: days.map((d) => d.label),
    height: 6,
    width: Math.max(40, width),
    formatY: fmtBigTokens,
  });
  for (const l of chart) lines.push(theme.fg("text", l));

  const total = agg.totals.tokens || 1;
  const sorted = [...agg.byModel.entries()].sort(
    (a, b) => b[1].tokens - a[1].tokens,
  );
  if (sorted.length) {
    lines.push("");
    lines.push(
      `${theme.fg(getHighlightColor(), "All time")} ${theme.fg("dim", "· Last 7 days · Last 30 days")}`,
    );
    lines.push("");

    const accent = getHighlightColor();
    const renderBlock = (
      model: string,
      bucket: { tokens: number; sessions: number; cost: number },
    ): string[] => {
      const pct = (bucket.tokens / total) * 100;
      const header = `${theme.fg(accent, "●")} ${theme.fg("text", model)} ${theme.fg("dim", `(${pct.toFixed(1)}%)`)}`;
      // Approximate input/output split: sessions.ts only aggregates totals,
      // so we use byModel's own input/output if present, otherwise fall
      // back to a simple tokens / sessions readout. For now use the latter
      // since the aggregate type doesn't carry the split.
      const detail = theme.fg(
        "dim",
        `  ${fmtBigTokens(bucket.tokens)} tokens · ${bucket.sessions} session${bucket.sessions === 1 ? "" : "s"}`,
      );
      return [header, detail];
    };

    // Auto-fit: column 1 width = widest block header among left-column models.
    const headerLen = (model: string, pct: number) =>
      `● ${model} (${pct.toFixed(1)}%)`.length;
    const widest = Math.max(
      ...sorted.map(([m, b]) => headerLen(m, (b.tokens / total) * 100)),
    );
    const gap = 4;
    const colStart = widest + gap;
    const fits = width >= colStart + widest + 2;

    for (let i = 0; i < sorted.length; i += 2) {
      const leftBlock = renderBlock(sorted[i][0], sorted[i][1]);
      const rightBlock = sorted[i + 1]
        ? renderBlock(sorted[i + 1][0], sorted[i + 1][1])
        : null;

      if (!rightBlock || !fits) {
        // Stack on narrow terminals or for the last odd row.
        for (const l of leftBlock) lines.push(l);
        if (rightBlock) {
          for (const l of rightBlock) lines.push(l);
        }
      } else {
        for (let row = 0; row < 2; row++) {
          const left = leftBlock[row] ?? "";
          const right = rightBlock[row] ?? "";
          const pad = Math.max(gap, colStart - bareLen(left));
          lines.push(`${left}${" ".repeat(pad)}${right}`);
        }
      }
      if (i + 2 < sorted.length) lines.push("");
    }
  }

  return lines.map((l) => truncateToWidth(l, width));
}

// ── /config: settings hub ───────────────────────────────────────────────────

function buildConfigRoot(
  pagesById: Map<string, ConfigPage>,
  theme: ThemeFg & { fg(color: ThemeColor, text: string): string },
  close: () => void,
): Component {
  const listTheme = highlightTheme(theme, getHighlightColor());

  const highlightSubmenu = (
    _v: string,
    finish: (value?: string) => void,
  ): Component => {
    const items: SettingItem[] = HIGHLIGHT_COLORS.map((c) => ({
      id: c,
      label: c,
      currentValue: c === getHighlightColor() ? "●" : "",
      values: ["selected"],
      description:
        c === getHighlightColor()
          ? "Currently active."
          : "Enter to select. Takes effect on next /config open.",
    }));
    return new SettingsList(
      items,
      HIGHLIGHT_COLORS.length,
      listTheme,
      (id) => setHighlightColor(id as HighlightColor),
      () => finish(),
    );
  };

  const advancedSubmenu = (
    _v: string,
    finish: (value?: string) => void,
  ): Component => {
    const advancedPages = [...pagesById.values()].filter(
      (p) => !MAIN_PAGE_IDS.includes(p.id),
    );

    const extensionsItem: SettingItem = {
      id: "extensions",
      label: "Extensions",
      currentValue: "›",
      description:
        "Enable/disable individual pi-ux extensions (takes effect on next restart).",
      submenu: (_v2, finish2) => {
        const manifest = manifestConfig();
        const items: SettingItem[] = KNOWN_EXTENSIONS.map((name) => ({
          id: name,
          label: name,
          currentValue: manifest.get()[name]?.enabled === false ? "off" : "on",
          values: ["on", "off"],
        }));
        return new SettingsList(
          items,
          KNOWN_EXTENSIONS.length,
          listTheme,
          (id, value) => {
            const current = manifest.get();
            manifest.save({
              ...current,
              [id]: { enabled: value === "on" },
            });
          },
          () => finish2(),
        );
      },
    };

    const highlightItem: SettingItem = {
      id: "highlight",
      label: "Highlight colour",
      currentValue: getHighlightColor(),
      description: "pi-ux-wide highlight + cursor colour.",
      submenu: highlightSubmenu,
    };

    const items: SettingItem[] = [
      ...advancedPages.map(
        (p): SettingItem => ({
          id: p.id,
          label: p.label,
          currentValue: "›",
          description: p.description,
          submenu: (_v2, finish2) => p.build(theme, () => finish2()),
        }),
      ),
      highlightItem,
      extensionsItem,
    ];
    return new SettingsList(items, 10, listTheme, () => {}, () => finish());
  };

  const items: SettingItem[] = [];
  for (const id of MAIN_PAGE_IDS) {
    const page = pagesById.get(id);
    if (!page) continue;
    items.push({
      id: page.id,
      label: page.label,
      currentValue: "›",
      description: page.description,
      submenu: (_v, finish) => page.build(theme, () => finish()),
    });
  }
  items.push({
    id: "advanced",
    label: "Advanced",
    currentValue: "›",
    description:
      "Highlight colour, Hooks, Permissions, Quotas, Extensions — less-touched config.",
    submenu: advancedSubmenu,
  });

  return new SettingsList(items, 12, listTheme, () => {}, close);
}

// ── Extension factory ───────────────────────────────────────────────────────

export default function uxHub(pi: ExtensionAPI) {
  pi.registerCommand("config-superseded", {
    description:
      "(superseded — use /config) Configure pi-ux (statusline, metrics, hooks, permissions…)",
    handler: async (_args, ctx) => {
      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        const pages = getConfigPages();
        const pagesById = new Map(pages.map((p) => [p.id, p]));
        const close = () => done(undefined);

        const themed = theme as ThemeFg & {
          fg(color: ThemeColor, text: string): string;
        };

        return wrapWithBorders(buildConfigRoot(pagesById, themed, close), theme);
      });
    },
  });

  pi.registerCommand("stats", {
    description: "Show pi session stats, quotas, totals, and per-model usage",
    handler: async (_args, ctx) => {
      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        const close = () => done(undefined);

        const themed = theme as ThemeFg & {
          fg(color: ThemeColor, text: string): string;
        };

        const tabs: Tab[] = [
          {
            id: "session",
            label: "Session",
            build: (_t, _c) =>
              new StaticView((w) => renderSessionTab(ctx, themed, w)),
          },
          {
            id: "quotas",
            label: "Quotas",
            build: (_t, _c) => new StaticView((w) => renderQuotasTab(themed, w)),
          },
          {
            id: "stats",
            label: "Stats",
            build: (_t, _c) =>
              new StaticView((w) =>
                renderStatsOverview(getAggregates(), themed, w),
              ),
          },
          {
            id: "models",
            label: "Models",
            build: (_t, _c) =>
              new StaticView((w) =>
                renderStatsModels(getAggregates(), themed, w),
              ),
          },
        ];

        const tabsView = new TabsView(tabs, theme, close, {
          initial: "session",
        });
        return wrapWithBorders(tabsView, theme);
      });
    },
  });
}
