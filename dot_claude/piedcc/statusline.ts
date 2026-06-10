#!/usr/bin/env bun
// piedcc — Claude Code statusline. Reads JSON on stdin, prints
// multi-line ANSI to stdout. See lib/cc.ts for the input shape.

import { execSync } from "node:child_process";
import { closeSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tty from "node:tty";
import type { CCStatusInput } from "./lib/cc.ts";
import {
  fillPercent,
  percentColour,
  usableMarkerColour,
  type ThemeToken,
} from "./lib/colour.ts";
import {
  ensureConfigOnDisk,
  loadConfig,
  type Config,
  type Segment,
} from "./lib/config.ts";
import { fmtResetRelative, fmtTokens, pieChar } from "./lib/format.ts";
import { collectGitStats, type GitStats } from "./lib/git.ts";
import { theme } from "./lib/omarchy.ts";
import { visibleWidth } from "./lib/width.ts";

type Deps = { cc: CCStatusInput; config: Config; git: GitStats };

function tok(d: Deps, s: Segment): ThemeToken {
  return (d.config.colors[s] ?? "dim") as ThemeToken;
}

// ── Git ─────────────────────────────────────────────────────────────────

function gitDiffText(
  style: Config["gitDiffStyle"],
  kind: "branch" | "work",
  sign: "+" | "-",
  value: number,
): string {
  const prefix = kind === "branch" ? "^" : "@";
  if (style === "symbols") return `${prefix}${sign}`;
  if (style === "numbers") return `${prefix}${value}`;
  return `${prefix}${sign}${value}`;
}

function paintGitBranch(d: Deps): string | undefined {
  if (!d.git.branch && !d.git.dirty) return undefined;
  return theme.fg(tok(d, "gitBranch"), `${d.git.branch ?? "git"}${d.git.dirty ? "*" : ""}`);
}

function paintGitWorkDiff(d: Deps): string | undefined {
  const parts: string[] = [];
  if (d.git.added) parts.push(theme.fg("success", gitDiffText(d.config.gitDiffStyle, "work", "+", d.git.added)));
  if (d.git.deleted) parts.push(theme.fg("error", gitDiffText(d.config.gitDiffStyle, "work", "-", d.git.deleted)));
  return parts.length ? parts.join(" ") : undefined;
}

function paintGitAhead(d: Deps): string | undefined {
  const parts: string[] = [];
  if (d.git.ahead) parts.push(theme.fg("success", `↑${d.git.ahead}`));
  if (d.git.behind) parts.push(theme.fg("warning", `↓${d.git.behind}`));
  return parts.length ? parts.join(" ") : undefined;
}

function paintGitBranchDiff(d: Deps): string | undefined {
  const parts: string[] = [];
  if (d.git.branchAdded) parts.push(theme.fg("success", gitDiffText(d.config.gitDiffStyle, "branch", "+", d.git.branchAdded)));
  if (d.git.branchDeleted) parts.push(theme.fg("error", gitDiffText(d.config.gitDiffStyle, "branch", "-", d.git.branchDeleted)));
  return parts.length ? parts.join(" ") : undefined;
}

// ── Tokens / context / model / effort / rates ───────────────────────────

function paintUsage(d: Deps): string | undefined {
  const ctx = d.cc.context_window;
  if (!ctx) return undefined;
  const cu = ctx.current_usage;
  // Prefer per-component when available; fall back to totals so the
  // segment still renders before the first API response.
  const input = cu?.input_tokens ?? ctx.total_input_tokens;
  const output = cu?.output_tokens ?? ctx.total_output_tokens;
  const cacheRead = cu?.cache_read_input_tokens ?? 0;
  const cacheWrite = cu?.cache_creation_input_tokens ?? 0;
  const parts: string[] = [];
  if (d.config.usageInput) parts.push(`↑${fmtTokens(input)}`);
  if (d.config.usageOutput) parts.push(`↓${fmtTokens(output)}`);
  if (d.config.usageCacheRead && cacheRead) parts.push(`R${fmtTokens(cacheRead)}`);
  if (d.config.usageCacheWrite && cacheWrite) parts.push(`W${fmtTokens(cacheWrite)}`);
  return parts.length ? theme.fg(tok(d, "usage"), parts.join(" ")) : undefined;
}

function paintContext(d: Deps): string | undefined {
  const ctx = d.cc.context_window;
  if (!ctx) return undefined;
  const window = ctx.context_window_size;
  const used = window * (ctx.used_percentage / 100);
  const displayPercent = fillPercent(used, d.config.fillBasis, d.config.usableTokens, window);
  const amount =
    d.config.contextAmount === "used"
      ? used
      : d.config.contextAmount === "remaining"
        ? window - used
        : window;
  const shown = Math.round(displayPercent);
  const main = d.config.pieContext ? pieChar(shown) : `${shown}%`;
  const tail = d.config.showContextTotal ? ` ${fmtTokens(amount)}` : "";
  const color = usableMarkerColour(used, d.config.usableTokens, d.config.tolerancePercent, tok(d, "context"));
  return theme.fg(color, `ctx ${main}${tail}`);
}

function paintModel(d: Deps): string {
  let name = d.config.modelDisplay === "id" ? d.cc.model.id : d.cc.model.display_name;
  if (d.config.modelStripContext) name = name.replace(/ context\)/g, ")");
  return theme.fg(tok(d, "model"), name);
}

function paintEffort(d: Deps): string | undefined {
  const lvl = d.cc.effort?.level;
  if (!lvl) return undefined;
  return theme.fg(tok(d, "effort"), lvl);
}

function ratePart(
  label: string,
  pct: number | undefined,
  pie: boolean,
  reset: string | undefined,
): string | undefined {
  if (pct === undefined) return undefined;
  const used = Math.round(Math.max(0, Math.min(100, pct)));
  const main = pie ? pieChar(used) : `${used}%`;
  return `${label} ${main}${reset ? ` ${reset}` : ""}`;
}

function paintRate5h(d: Deps): string | undefined {
  const rl = d.cc.rate_limits?.five_hour;
  const reset = d.config.showRate5hReset ? fmtResetRelative(rl?.resets_at) : undefined;
  const p = ratePart("5h", rl?.used_percentage, d.config.pieRate5h, reset);
  if (!p) return undefined;
  return theme.fg(
    percentColour(rl?.used_percentage, tok(d, "rate5h"), d.config.rate5hWarning, d.config.rate5hError),
    p,
  );
}

function paintRateWeekly(d: Deps): string | undefined {
  const rl = d.cc.rate_limits?.seven_day;
  const reset = d.config.showRateWeeklyReset ? fmtResetRelative(rl?.resets_at) : undefined;
  const p = ratePart("wk", rl?.used_percentage, d.config.pieRateWeekly, reset);
  if (!p) return undefined;
  return theme.fg(
    percentColour(rl?.used_percentage, tok(d, "rateWeekly"), d.config.rateWeeklyWarning, d.config.rateWeeklyError),
    p,
  );
}

const PAINTERS: Record<Segment, (d: Deps) => string | undefined> = {
  gitBranch: paintGitBranch,
  gitWorkDiff: paintGitWorkDiff,
  gitAhead: paintGitAhead,
  gitBranchDiff: paintGitBranchDiff,
  usage: paintUsage,
  context: paintContext,
  model: paintModel,
  effort: paintEffort,
  rate5h: paintRate5h,
  rateWeekly: paintRateWeekly,
};

// ── Layout ──────────────────────────────────────────────────────────────

function paintSide(d: Deps, segments: Segment[], sep: string): string {
  return segments
    .map((s) => PAINTERS[s]?.(d))
    .filter((s): s is string => Boolean(s) && s!.length > 0)
    .join(sep);
}

function composeLine(left: string, right: string, termCols: number): string {
  if (!right) return left;
  if (!left) return right;
  const used = visibleWidth(left) + visibleWidth(right);
  if (termCols <= 0 || used + 2 > termCols) return `${left}  ${right}`;
  return `${left}${" ".repeat(termCols - used)}${right}`;
}

// CC pipes JSON in, so process.stdout is not a TTY. Try every reasonable
// source before falling back to the config's `defaultColumns`.
function detectColumns(fallback: number): number {
  if (process.stdout.columns && process.stdout.columns > 0) return process.stdout.columns;
  if (process.stderr.columns && process.stderr.columns > 0) return process.stderr.columns;
  const env = Number.parseInt(process.env.COLUMNS ?? "0", 10);
  if (env > 0) return env;

  let fd: number | undefined;
  try {
    fd = openSync("/dev/tty", "r+");
    const cols = new tty.WriteStream(fd).columns ?? 0;
    if (cols > 0) return cols;
  } catch {
    /* fall through */
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }

  try {
    const out = execSync("tput cols 2>/dev/null </dev/tty", {
      shell: "/bin/sh",
      encoding: "utf8",
      timeout: 200,
    });
    const n = Number.parseInt(out.trim(), 10);
    if (n > 0) return n;
  } catch {
    /* fall through */
  }

  return fallback;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  ensureConfigOnDisk();
  const stdin = await readStdin();

  // Diagnostic: drop the most recent stdin to /tmp so we can inspect what
  // CC is actually sending when a segment looks wrong. Overwritten each
  // render — ~5KB max, no rotation needed.
  try {
    writeFileSync(join(tmpdir(), "piedcc-stdin-latest.json"), stdin);
  } catch {
    /* best-effort */
  }

  let cc: CCStatusInput;
  try {
    cc = JSON.parse(stdin) as CCStatusInput;
  } catch {
    process.stdout.write(theme.fg("dim", "piedcc: awaiting CC stdin"));
    return;
  }
  const config = loadConfig();
  const git = await collectGitStats(cc.workspace.current_dir, config.gitBase, cc.session_id);
  const deps: Deps = { cc, config, git };

  const detected = {
    stdoutCols: process.stdout.columns ?? null,
    stderrCols: process.stderr.columns ?? null,
    envCols: process.env.COLUMNS ?? null,
    final: 0,
  };
  const termCols = detectColumns(config.defaultColumns);
  detected.final = termCols;
  const out: string[] = [];
  for (const line of config.lines) {
    const left = paintSide(deps, line.left, config.separator);
    const right = paintSide(deps, line.right, config.separator);
    out.push(composeLine(left, right, termCols));
  }
  const rendered = out.join("\n");
  process.stdout.write(rendered);

  // Diagnostic dump — every render overwrites this file with detected
  // terminal width, line widths, and the raw output. Inspect with:
  //   cat /tmp/piedcc-debug-latest.txt
  try {
    const lineWidths = out.map((l, i) => `  line${i + 1}: ${visibleWidth(l)} visible chars`).join("\n");
    const debug = [
      `[${new Date().toISOString()}] piedcc render`,
      `detected columns: ${JSON.stringify(detected)}`,
      `config.defaultColumns: ${config.defaultColumns}`,
      `lines emitted: ${out.length}`,
      lineWidths,
      `--- raw stdout (with ANSI) ---`,
      rendered,
      "",
    ].join("\n");
    writeFileSync(join(tmpdir(), "piedcc-debug-latest.txt"), debug);
  } catch {
    /* best-effort */
  }
}

main().catch((err) => {
  process.stdout.write(`\x1b[38;2;83;104;91mpiedcc error: ${String(err?.message ?? err)}\x1b[39m`);
});
