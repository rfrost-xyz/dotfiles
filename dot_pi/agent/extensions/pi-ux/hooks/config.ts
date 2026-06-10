/**
 * Hooks configuration types, defaults, parser, paths.
 *
 * Schema:
 * {
 *   "preToolUse":  [Rule, …],   // checked before tool runs; can block
 *   "postToolUse": [Rule, …]    // checked after tool runs; notify-only
 * }
 *
 * Each Rule matches by tools[] AND (pathSuffix|pathRegex) AND commandRegex
 * AND agent / unlessAgent. All conditions are AND'd. Empty matchers match
 * anything.
 */

import { homedir } from "node:os";
import { join } from "node:path";

export type HookEvent = "preToolUse" | "postToolUse";
export type HookAction = "block" | "notify";

export type HookRule = {
  name?: string;
  tools?: string[];
  pathSuffix?: string;
  pathRegex?: string;
  commandRegex?: string;
  /** Only fires when PI_SUBAGENT_CHILD_AGENT equals this string. */
  agent?: string;
  /** Skips when PI_SUBAGENT_CHILD_AGENT equals this string. */
  unlessAgent?: string;
  action: HookAction;
  reason?: string;
};

export type HooksConfig = {
  preToolUse: HookRule[];
  postToolUse: HookRule[];
};

export const CONFIG_PATH = join(
  homedir(),
  ".pi",
  "agent",
  "config",
  "hooks.json",
);
export const PROJECT_FILE = "hooks.json";
export const ARRAY_APPEND_KEYS = ["preToolUse", "postToolUse"];

export const DEFAULT_HOOKS: HooksConfig = {
  preToolUse: [],
  postToolUse: [],
};

function parseRule(value: unknown): HookRule | undefined {
  if (!value || typeof value !== "object") return undefined;
  const r = value as Partial<HookRule>;
  if (r.action !== "block" && r.action !== "notify") return undefined;
  return {
    name: typeof r.name === "string" ? r.name : undefined,
    tools: Array.isArray(r.tools)
      ? r.tools.filter((t): t is string => typeof t === "string")
      : undefined,
    pathSuffix: typeof r.pathSuffix === "string" ? r.pathSuffix : undefined,
    pathRegex: typeof r.pathRegex === "string" ? r.pathRegex : undefined,
    commandRegex:
      typeof r.commandRegex === "string" ? r.commandRegex : undefined,
    agent: typeof r.agent === "string" ? r.agent : undefined,
    unlessAgent:
      typeof r.unlessAgent === "string" ? r.unlessAgent : undefined,
    action: r.action,
    reason: typeof r.reason === "string" ? r.reason : undefined,
  };
}

function parseRules(value: unknown): HookRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseRule)
    .filter((r): r is HookRule => Boolean(r));
}

export function parseHooks(raw: unknown): HooksConfig {
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_HOOKS);
  const data = raw as Partial<HooksConfig>;
  return {
    preToolUse: parseRules(data.preToolUse),
    postToolUse: parseRules(data.postToolUse),
  };
}
