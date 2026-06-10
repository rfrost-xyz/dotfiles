/**
 * Session aggregation for the Stats tab.
 *
 * Walks `~/.pi/agent/sessions/*.jsonl`, extracts per-message usage from
 * assistant messages, and aggregates by day + by model. Cached for
 * SESSION_TTL_MS so the Stats tab can render instantly on re-open.
 *
 * Each session file is JSONL with entries of various `type`s. We only
 * care about `message` entries where `message.role === "assistant"` —
 * those carry `usage`, `model`, `timestamp`. The session file's first
 * line is a `session` record with `timestamp` (= start). Last assistant
 * message timestamp serves as session end for duration.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SESSION_DIR = join(homedir(), ".pi", "agent", "sessions");
const SESSION_TTL_MS = 60_000;

export type SessionUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

export type SessionSummary = {
  file: string;
  startedAt: Date;
  endedAt?: Date;
  durationMs?: number;
  model?: string;
  usage: SessionUsage;
};

export type DayBucket = {
  tokens: number;
  cost: number;
  sessions: number;
};

export type ModelBucket = {
  tokens: number;
  sessions: number;
  cost: number;
};

export type Aggregates = {
  sessions: SessionSummary[];
  byDay: Map<string, DayBucket>; // key: YYYY-MM-DD
  byModel: Map<string, ModelBucket>;
  totals: {
    tokens: number;
    sessions: number;
    cost: number;
    longestMs: number;
    longestSession?: SessionSummary;
    favoriteModel?: string;
  };
  computedAt: number;
};

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLine(line: string): Record<string, unknown> | undefined {
  if (!line) return undefined;
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function readSession(file: string): SessionSummary | undefined {
  let raw: string;
  try {
    raw = readFileSync(file, "utf-8");
  } catch {
    return undefined;
  }

  let startedAt: Date | undefined;
  let lastTimestamp: Date | undefined;
  let dominantModel: string | undefined;
  const modelCounts = new Map<string, number>();
  const usage: SessionUsage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  };

  for (const line of raw.split("\n")) {
    const entry = parseLine(line);
    if (!entry) continue;
    const type = entry.type;
    if (type === "session" && typeof entry.timestamp === "string") {
      startedAt ??= new Date(entry.timestamp);
      continue;
    }
    if (type !== "message") continue;
    const msg = entry.message as
      | {
          role?: string;
          model?: string;
          timestamp?: string;
          usage?: Partial<SessionUsage> & { cost?: { total?: number } };
        }
      | undefined;
    if (!msg || msg.role !== "assistant") continue;
    if (msg.timestamp) lastTimestamp = new Date(msg.timestamp);
    if (msg.model) {
      modelCounts.set(msg.model, (modelCounts.get(msg.model) ?? 0) + 1);
    }
    const u = msg.usage;
    if (u) {
      usage.input += typeof u.input === "number" ? u.input : 0;
      usage.output += typeof u.output === "number" ? u.output : 0;
      usage.cacheRead += typeof u.cacheRead === "number" ? u.cacheRead : 0;
      usage.cacheWrite += typeof u.cacheWrite === "number" ? u.cacheWrite : 0;
      usage.cost += typeof u.cost?.total === "number" ? u.cost.total : 0;
    }
  }

  if (!startedAt) {
    // Fall back to file mtime
    try {
      startedAt = new Date(statSync(file).mtime);
    } catch {
      return undefined;
    }
  }

  let max = 0;
  for (const [m, c] of modelCounts) {
    if (c > max) {
      max = c;
      dominantModel = m;
    }
  }

  return {
    file,
    startedAt,
    endedAt: lastTimestamp,
    durationMs:
      lastTimestamp && startedAt
        ? lastTimestamp.getTime() - startedAt.getTime()
        : undefined,
    model: dominantModel,
    usage,
  };
}

function scanSessions(): SessionSummary[] {
  let entries: string[];
  try {
    entries = readdirSync(SESSION_DIR).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const out: SessionSummary[] = [];
  for (const f of entries) {
    const s = readSession(join(SESSION_DIR, f));
    if (s) out.push(s);
  }
  return out;
}

function computeAggregates(): Aggregates {
  const sessions = scanSessions();
  const byDay = new Map<string, DayBucket>();
  const byModel = new Map<string, ModelBucket>();
  let totalTokens = 0;
  let totalCost = 0;
  let longestMs = 0;
  let longestSession: SessionSummary | undefined;

  for (const s of sessions) {
    const tokens = s.usage.input + s.usage.output;
    totalTokens += tokens;
    totalCost += s.usage.cost;
    if ((s.durationMs ?? 0) > longestMs) {
      longestMs = s.durationMs ?? 0;
      longestSession = s;
    }
    const dk = dayKey(s.startedAt);
    const day = byDay.get(dk) ?? { tokens: 0, cost: 0, sessions: 0 };
    day.tokens += tokens;
    day.cost += s.usage.cost;
    day.sessions += 1;
    byDay.set(dk, day);
    if (s.model) {
      const m = byModel.get(s.model) ?? { tokens: 0, sessions: 0, cost: 0 };
      m.tokens += tokens;
      m.sessions += 1;
      m.cost += s.usage.cost;
      byModel.set(s.model, m);
    }
  }

  let favoriteModel: string | undefined;
  let favMax = 0;
  for (const [model, b] of byModel) {
    if (b.tokens > favMax) {
      favMax = b.tokens;
      favoriteModel = model;
    }
  }

  return {
    sessions,
    byDay,
    byModel,
    totals: {
      tokens: totalTokens,
      sessions: sessions.length,
      cost: totalCost,
      longestMs,
      longestSession,
      favoriteModel,
    },
    computedAt: Date.now(),
  };
}

let cached: Aggregates | undefined;

export function getAggregates(force = false): Aggregates {
  if (!force && cached && Date.now() - cached.computedAt < SESSION_TTL_MS)
    return cached;
  cached = computeAggregates();
  return cached;
}

/**
 * Filter aggregate sessions to a time range. Returns a new aggregate.
 * Used by the "Last 7 days" / "Last 30 days" range selector.
 */
export function aggregatesInRange(
  full: Aggregates,
  since: Date,
): Aggregates {
  const sessions = full.sessions.filter((s) => s.startedAt >= since);
  const byDay = new Map<string, DayBucket>();
  const byModel = new Map<string, ModelBucket>();
  let totalTokens = 0;
  let totalCost = 0;
  let longestMs = 0;
  let longestSession: SessionSummary | undefined;

  for (const s of sessions) {
    const tokens = s.usage.input + s.usage.output;
    totalTokens += tokens;
    totalCost += s.usage.cost;
    if ((s.durationMs ?? 0) > longestMs) {
      longestMs = s.durationMs ?? 0;
      longestSession = s;
    }
    const dk = dayKey(s.startedAt);
    const day = byDay.get(dk) ?? { tokens: 0, cost: 0, sessions: 0 };
    day.tokens += tokens;
    day.cost += s.usage.cost;
    day.sessions += 1;
    byDay.set(dk, day);
    if (s.model) {
      const m = byModel.get(s.model) ?? { tokens: 0, sessions: 0, cost: 0 };
      m.tokens += tokens;
      m.sessions += 1;
      m.cost += s.usage.cost;
      byModel.set(s.model, m);
    }
  }
  let favoriteModel: string | undefined;
  let favMax = 0;
  for (const [model, b] of byModel) {
    if (b.tokens > favMax) {
      favMax = b.tokens;
      favoriteModel = model;
    }
  }
  return {
    sessions,
    byDay,
    byModel,
    totals: {
      tokens: totalTokens,
      sessions: sessions.length,
      cost: totalCost,
      longestMs,
      longestSession,
      favoriteModel,
    },
    computedAt: full.computedAt,
  };
}
