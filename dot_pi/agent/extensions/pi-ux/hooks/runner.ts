/**
 * Hook matching + execution.
 *
 * Pure functions over rules + event data. The extension wires `tool_call`
 * and `tool_result` to these.
 */

import type { HookRule } from "./config.ts";

export type ToolEventLike = {
  toolName: string;
  input: Record<string, unknown> | undefined;
};

function inputPath(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  if (typeof input.path === "string") return input.path;
  if (typeof input.file_path === "string") return input.file_path;
  return undefined;
}

function inputCommand(
  input: Record<string, unknown> | undefined,
): string | undefined {
  return input && typeof input.command === "string" ? input.command : undefined;
}

const regexCache = new Map<string, RegExp | null>();

/**
 * Compile a regex once per source string. `null` cached for invalid
 * patterns. `ruleMatches` is on the tool_call hot path, so even a Map
 * lookup is cheaper than `new RegExp` per call.
 */
function compile(regex: string | undefined): RegExp | undefined {
  if (!regex) return undefined;
  const cached = regexCache.get(regex);
  if (cached === null) return undefined;
  if (cached) return cached;
  try {
    const re = new RegExp(regex);
    regexCache.set(regex, re);
    return re;
  } catch {
    regexCache.set(regex, null);
    return undefined;
  }
}

export function ruleMatches(
  rule: HookRule,
  event: ToolEventLike,
  currentAgent: string | undefined,
): boolean {
  if (rule.tools && !rule.tools.includes(event.toolName)) return false;

  if (rule.agent !== undefined && currentAgent !== rule.agent) return false;
  if (rule.unlessAgent !== undefined && currentAgent === rule.unlessAgent)
    return false;

  const path = inputPath(event.input);
  if (rule.pathSuffix) {
    if (!path || !path.endsWith(rule.pathSuffix)) return false;
  }
  const pathRe = compile(rule.pathRegex);
  if (pathRe) {
    if (!path || !pathRe.test(path)) return false;
  }
  const cmdRe = compile(rule.commandRegex);
  if (cmdRe) {
    const cmd = inputCommand(event.input);
    if (!cmd || !cmdRe.test(cmd)) return false;
  }

  return true;
}

export function currentSubagent(): string | undefined {
  const name = process.env.PI_SUBAGENT_CHILD_AGENT;
  return name && name.trim() ? name.trim() : undefined;
}

export function describeRule(rule: HookRule): string {
  return rule.name ?? `hook(${rule.action})`;
}

export function describeEvent(event: ToolEventLike): string {
  const path = inputPath(event.input);
  const cmd = inputCommand(event.input);
  if (path) return `${event.toolName} ${path}`;
  if (cmd) return `${event.toolName} ${cmd.slice(0, 40)}`;
  return event.toolName;
}
