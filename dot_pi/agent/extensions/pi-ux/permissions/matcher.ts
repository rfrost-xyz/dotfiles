/**
 * Permission matcher + session-scoped ask cache.
 */

import type { PermRule } from "./config.ts";

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
 * patterns. ruleMatches runs on every tool_call so we avoid `new RegExp`
 * per call.
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
  rule: PermRule,
  event: ToolEventLike,
  currentAgent: string | undefined,
): boolean {
  if (rule.tools && !rule.tools.includes(event.toolName)) return false;
  if (rule.agent !== undefined && currentAgent !== rule.agent) return false;
  if (rule.unlessAgent !== undefined && currentAgent === rule.unlessAgent)
    return false;

  const pathRe = compile(rule.pathRegex);
  if (pathRe) {
    const path = inputPath(event.input);
    if (!path || !pathRe.test(path)) return false;
  }
  const cmdRe = compile(rule.commandRegex);
  if (cmdRe) {
    const cmd = inputCommand(event.input);
    if (!cmd || !cmdRe.test(cmd)) return false;
  }

  return true;
}

export function ruleDescription(rule: PermRule): string {
  if (rule.name) return rule.name;
  const parts: string[] = [];
  if (rule.tools) parts.push(`tools=${rule.tools.join(",")}`);
  if (rule.commandRegex) parts.push(`cmd~${rule.commandRegex}`);
  if (rule.pathRegex) parts.push(`path~${rule.pathRegex}`);
  return parts.join(" ") || "rule";
}

export function eventSignature(event: ToolEventLike): string {
  const path = inputPath(event.input);
  const cmd = inputCommand(event.input);
  return `${event.toolName}::${path ?? ""}::${cmd ?? ""}`;
}

/**
 * Session-scoped ask cache. Keys map to "allow" (user confirmed) or "deny"
 * (user declined). On confirm, future identical signatures bypass the
 * prompt; on decline, future identical signatures keep blocking until the
 * session ends. Per-session memory only — cleared when pi restarts.
 */
export class AskCache {
  private decisions = new Map<string, "allow" | "deny">();

  get(signature: string): "allow" | "deny" | undefined {
    return this.decisions.get(signature);
  }

  remember(signature: string, decision: "allow" | "deny"): void {
    this.decisions.set(signature, decision);
  }

  clear(): void {
    this.decisions.clear();
  }
}
