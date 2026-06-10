/**
 * Permissions configuration. Schema:
 *
 * {
 *   "allow": [PermRule, …],   // explicitly permit; bypass any ask
 *   "deny":  [PermRule, …],   // explicitly block
 *   "ask":   [PermRule, …]    // prompt user; remembered for the session
 * }
 *
 * Evaluation order per tool call: deny → ask → allow → default-allow.
 * If a rule in the higher-priority list matches, that decision wins.
 */

import { homedir } from "node:os";
import { join } from "node:path";

export type PermRule = {
  name?: string;
  tools?: string[];
  pathRegex?: string;
  commandRegex?: string;
  agent?: string;
  unlessAgent?: string;
  reason?: string;
};

export type PermissionsConfig = {
  allow: PermRule[];
  deny: PermRule[];
  ask: PermRule[];
};

export const CONFIG_PATH = join(
  homedir(),
  ".pi",
  "agent",
  "config",
  "permissions.json",
);
export const PROJECT_FILE = "permissions.json";
export const ARRAY_APPEND_KEYS = ["allow", "deny", "ask"];

export const DEFAULT_PERMISSIONS: PermissionsConfig = {
  allow: [],
  deny: [],
  ask: [],
};

function parseRule(value: unknown): PermRule | undefined {
  if (!value || typeof value !== "object") return undefined;
  const r = value as Partial<PermRule>;
  return {
    name: typeof r.name === "string" ? r.name : undefined,
    tools: Array.isArray(r.tools)
      ? r.tools.filter((t): t is string => typeof t === "string")
      : undefined,
    pathRegex: typeof r.pathRegex === "string" ? r.pathRegex : undefined,
    commandRegex:
      typeof r.commandRegex === "string" ? r.commandRegex : undefined,
    agent: typeof r.agent === "string" ? r.agent : undefined,
    unlessAgent:
      typeof r.unlessAgent === "string" ? r.unlessAgent : undefined,
    reason: typeof r.reason === "string" ? r.reason : undefined,
  };
}

function parseRules(value: unknown): PermRule[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseRule).filter((r): r is PermRule => Boolean(r));
}

export function parsePermissions(raw: unknown): PermissionsConfig {
  if (!raw || typeof raw !== "object")
    return structuredClone(DEFAULT_PERMISSIONS);
  const data = raw as Partial<PermissionsConfig>;
  return {
    allow: parseRules(data.allow),
    deny: parseRules(data.deny),
    ask: parseRules(data.ask),
  };
}
