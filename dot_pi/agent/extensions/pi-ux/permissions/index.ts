/**
 * Permissions extension.
 *
 * Wires to pi's `tool_call`. For each call, evaluates deny → ask → allow.
 * - `deny` match → `{ block: true, reason }`
 * - `ask` match (without a cached decision) → prompt via ctx.ui.confirm,
 *   cache the answer for the session. Cached "deny" continues blocking.
 * - `allow` match or no rules → tool runs.
 *
 * Config layers: user (~/.pi/agent/config/permissions.json) + project
 * (<project-root>/.pi/permissions.json). Project rules are appended and
 * evaluated first.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type SettingItem, SettingsList } from "@earendil-works/pi-tui";
import { Config, projectConfigPath } from "../lib/config.ts";
import { registerConfigPage } from "../lib/config-pages.ts";
import { Diagnostics } from "../lib/diagnostics.ts";
import { isEnabled } from "../lib/manifest.ts";
import { highlightTheme } from "../lib/theme.ts";
import {
  ARRAY_APPEND_KEYS,
  CONFIG_PATH,
  DEFAULT_PERMISSIONS,
  parsePermissions,
  type PermissionsConfig,
  PROJECT_FILE,
} from "./config.ts";
import {
  AskCache,
  eventSignature,
  ruleDescription,
  ruleMatches,
  type ToolEventLike,
} from "./matcher.ts";

function currentSubagent(): string | undefined {
  const name = process.env.PI_SUBAGENT_CHILD_AGENT;
  return name && name.trim() ? name.trim() : undefined;
}

export default function permissionsExtension(pi: ExtensionAPI) {
  if (!isEnabled("permissions")) return;
  const config = new Config<PermissionsConfig>({
    userPath: CONFIG_PATH,
    projectPath: () => projectConfigPath(PROJECT_FILE),
    defaults: DEFAULT_PERMISSIONS,
    parse: parsePermissions,
    arrayAppendKeys: ARRAY_APPEND_KEYS,
  });
  config.watch();

  const askCache = new AskCache();
  const diag = new Diagnostics("permissions");

  registerConfigPage({
    id: "permissions",
    label: "Permissions",
    description:
      "Read-only rule list. Edit ~/.pi/agent/config/permissions.json or <project>/.pi/permissions.json.",
    build: (theme, close) => {
      const c = config.get();
      const formatRule = (label: string, idx: number, rule: typeof c.allow[number]) => ({
        id: `${label}-${idx}`,
        label: `${label} · ${rule.name ?? "(unnamed)"}`,
        currentValue: `${rule.tools ? rule.tools.join(",") : "*"}${rule.commandRegex ? ` cmd~${rule.commandRegex}` : ""}${rule.pathRegex ? ` path~${rule.pathRegex}` : ""}`,
      });
      const items: SettingItem[] = [
        ...c.deny.map((r, i) => formatRule("deny", i, r)),
        ...c.ask.map((r, i) => formatRule("ask", i, r)),
        ...c.allow.map((r, i) => formatRule("allow", i, r)),
      ];
      if (!items.length)
        items.push({
          id: "_empty",
          label: "(no permission rules — default-allow)",
          currentValue: "",
        });
      return new SettingsList(
        items,
        12,
        highlightTheme(theme, "accent"),
        () => {},
        close,
      );
    },
  });

  pi.on("session_shutdown", () => askCache.clear());

  pi.on("tool_call", async (event, ctx) => {
    const { allow, deny, ask } = config.get();
    if (!allow.length && !deny.length && !ask.length) return undefined;

    const agent = currentSubagent();
    const toolEvent: ToolEventLike = {
      toolName: event.toolName,
      input: event.input as Record<string, unknown> | undefined,
    };

    // 1. deny
    for (const rule of deny) {
      if (!ruleMatches(rule, toolEvent, agent)) continue;
      const reason = rule.reason ?? `Denied by ${ruleDescription(rule)}`;
      diag.record(ctx, "denied", {
        rule: ruleDescription(rule),
        tool: event.toolName,
        agent,
        reason,
      });
      if (ctx.hasUI) ctx.ui.notify(reason, "warning");
      return { block: true, reason };
    }

    // 2. allow — short-circuit
    for (const rule of allow) {
      if (ruleMatches(rule, toolEvent, agent)) return undefined;
    }

    // 3. ask
    for (const rule of ask) {
      if (!ruleMatches(rule, toolEvent, agent)) continue;
      const sig = eventSignature(toolEvent);
      const cached = askCache.get(sig);
      if (cached === "allow") return undefined;
      if (cached === "deny") {
        return {
          block: true,
          reason: `Previously declined for this session: ${ruleDescription(rule)}`,
        };
      }
      if (!ctx.hasUI) {
        diag.record(ctx, "ask-no-ui", {
          rule: ruleDescription(rule),
          tool: event.toolName,
        });
        return {
          block: true,
          reason: `Ask-rule matched (${ruleDescription(rule)}) but no UI to prompt`,
        };
      }
      const description = rule.reason ?? ruleDescription(rule);
      const ok = await ctx.ui.confirm(
        `Allow ${event.toolName}?`,
        description,
      );
      askCache.remember(sig, ok ? "allow" : "deny");
      diag.record(ctx, ok ? "ask-allowed" : "ask-declined", {
        rule: ruleDescription(rule),
        tool: event.toolName,
        agent,
      });
      if (!ok) {
        return {
          block: true,
          reason: `Declined by user: ${ruleDescription(rule)}`,
        };
      }
      return undefined;
    }

    return undefined;
  });
}
