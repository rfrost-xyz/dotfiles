// Git stats — parallel execs, cached to /tmp keyed on CC session_id so
// rapid back-to-back renders skip the shellout cost. Cache TTL is 5s
// per the CC statusline docs' caching guidance.

import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type GitStats = {
  branch?: string;
  ahead: number;
  behind: number;
  added: number;
  deleted: number;
  branchAdded: number;
  branchDeleted: number;
  dirty: boolean;
};

const EMPTY: GitStats = {
  ahead: 0,
  behind: 0,
  added: 0,
  deleted: 0,
  branchAdded: 0,
  branchDeleted: 0,
  dirty: false,
};

const CACHE_TTL_MS = 5000;

async function tryExec(cwd: string, args: string[]): Promise<string> {
  try {
    return (await exec("git", args, { cwd, timeout: 1500 })).stdout;
  } catch {
    return "";
  }
}

function parseNumstat(stdout: string): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const [a, d] = line.split("\t");
    const pa = Number.parseInt(a ?? "", 10);
    const pd = Number.parseInt(d ?? "", 10);
    if (Number.isFinite(pa)) added += pa;
    if (Number.isFinite(pd)) deleted += pd;
  }
  return { added, deleted };
}

function parseAheadBehind(stdout: string): { ahead: number; behind: number } {
  const [a, b] = stdout.trim().split(/\s+/);
  return {
    ahead: Number.parseInt(a ?? "0", 10) || 0,
    behind: Number.parseInt(b ?? "0", 10) || 0,
  };
}

function cachePath(sessionId: string, cwd: string): string {
  // Include cwd in the key so a chdir mid-session (e.g. moving out of a
  // repo and back) doesn't return a stale empty result. session_id keeps
  // concurrent CC sessions from clobbering each other.
  const safeSession = sessionId.replace(/[^A-Za-z0-9_-]/g, "_");
  // Hash cwd into the filename; full path would blow past PATH_MAX.
  let h = 5381;
  for (let i = 0; i < cwd.length; i++) h = ((h << 5) + h + cwd.charCodeAt(i)) | 0;
  const safeCwd = (h >>> 0).toString(36);
  return join(tmpdir(), `piedcc-git-${safeSession}-${safeCwd}.json`);
}

function readCache(path: string): GitStats | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const age = Date.now() - statSync(path).mtimeMs;
    if (age > CACHE_TTL_MS) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as GitStats;
  } catch {
    return undefined;
  }
}

function writeCache(path: string, stats: GitStats): void {
  try {
    writeFileSync(path, JSON.stringify(stats));
  } catch {
    /* cache writes are best-effort */
  }
}

async function collectFresh(cwd: string, base: string): Promise<GitStats> {
  const inside = (await tryExec(cwd, ["rev-parse", "--is-inside-work-tree"])).trim();
  if (inside !== "true") return EMPTY;

  const [branch, porcelain, workNumstat, aheadBehind, branchNumstat] = await Promise.all([
    tryExec(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    tryExec(cwd, ["status", "--porcelain"]),
    tryExec(cwd, ["diff", "--numstat", "HEAD"]),
    tryExec(cwd, ["rev-list", "--left-right", "--count", `HEAD...${base}`]),
    tryExec(cwd, ["diff", "--numstat", `${base}...HEAD`]),
  ]);

  const work = parseNumstat(workNumstat);
  const ab = parseAheadBehind(aheadBehind);
  const branchDiff = parseNumstat(branchNumstat);
  return {
    branch: branch.trim() || undefined,
    dirty: porcelain.trim().length > 0,
    added: work.added,
    deleted: work.deleted,
    ahead: ab.ahead,
    behind: ab.behind,
    branchAdded: branchDiff.added,
    branchDeleted: branchDiff.deleted,
  };
}

export async function collectGitStats(
  cwd: string,
  base: string,
  sessionId: string,
): Promise<GitStats> {
  const path = cachePath(sessionId, cwd);
  const cached = readCache(path);
  if (cached) return cached;
  const fresh = await collectFresh(cwd, base);
  writeCache(path, fresh);
  return fresh;
}
