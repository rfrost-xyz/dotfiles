/**
 * Hooks extension.
 *
 * - `preToolUse` rules run on pi's `tool_call` event. Action "block"
 *   prevents the tool from running. Action "notify" just surfaces a
 *   warning.
 * - `postToolUse` rules run on `tool_result` and are notify-only (the
 *   tool already ran).
 *
 * Config layers: user (~/.pi/agent/config/hooks.json) + project
 * (<project-root>/.pi/hooks.json). Project rules are appended and
 * evaluated FIRST so they can pre-empt user rules.
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
  DEFAULT_HOOKS,
  type HooksConfig,
  parseHooks,
  PROJECT_FILE,
} from "./config.ts";
import {
  currentSubagent,
  describeEvent,
  describeRule,
  ruleMatches,
  type ToolEventLike,
} from "./runner.ts";

export default function hooksExtension(pi: ExtensionAPI) {
  if (!isEnabled("hooks")) return;
  const config = new Config<HooksConfig>({
    userPath: CONFIG_PATH,
    projectPath: () => projectConfigPath(PROJECT_FILE),
    defaults: DEFAULT_HOOKS,
    parse: parseHooks,
    arrayAppendKeys: ARRAY_APPEND_KEYS,
  });
  config.watch();
  const diag = new Diagnostics("hooks");

  registerConfigPage({
    id: "hooks",
    label: "Hooks",
    description:
      "Read-only rule list. Edit ~/.pi/agent/config/hooks.json or <project>/.pi/hooks.json.",
    build: (theme, close) => {
      const c = config.get();
      const items: SettingItem[] = [
        ...c.preToolUse.map((r, i) => ({
          id: `pre-${i}`,
          label: `pre · ${r.name ?? "(unnamed)"}`,
          currentValue: `${r.action}${r.tools ? ` ${r.tools.join(",")}` : ""}${r.pathSuffix ? ` ${r.pathSuffix}` : ""}${r.unlessAgent ? ` ¬${r.unlessAgent}` : ""}`,
        })),
        ...c.postToolUse.map((r, i) => ({
          id: `post-${i}`,
          label: `post · ${r.name ?? "(unnamed)"}`,
          currentValue: `${r.action}${r.tools ? ` ${r.tools.join(",")}` : ""}`,
        })),
      ];
      if (!items.length)
        items.push({
          id: "_empty",
          label: "(no hook rules)",
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

  pi.on("tool_call", async (event, ctx) => {
    const rules = config.get().preToolUse;
    if (!rules.length) return undefined;
    const agent = currentSubagent();
    const toolEvent: ToolEventLike = {
      toolName: event.toolName,
      input: event.input as Record<string, unknown> | undefined,
    };
    for (const rule of rules) {
      if (!ruleMatches(rule, toolEvent, agent)) continue;
      const reason = rule.reason ?? `Blocked by hook ${describeRule(rule)}`;
      diag.record(ctx, "preToolUse", {
        rule: describeRule(rule),
        tool: toolEvent.toolName,
        action: rule.action,
        agent,
        reason,
      });
      if (rule.action === "block") {
        if (ctx.hasUI)
          ctx.ui.notify(
            `Blocked ${describeEvent(toolEvent)} — ${reason}`,
            "warning",
          );
        return { block: true, reason };
      }
      if (ctx.hasUI) ctx.ui.notify(reason, "info");
    }
    return undefined;
  });

  pi.on("tool_result", (event, ctx) => {
    const rules = config.get().postToolUse;
    if (!rules.length) return;
    const agent = currentSubagent();
    const inputAny = (event as { input?: unknown }).input;
    const toolEvent: ToolEventLike = {
      toolName: event.toolName,
      input:
        inputAny && typeof inputAny === "object"
          ? (inputAny as Record<string, unknown>)
          : undefined,
    };
    for (const rule of rules) {
      if (!ruleMatches(rule, toolEvent, agent)) continue;
      const reason = rule.reason ?? `Hook ${describeRule(rule)} fired`;
      diag.record(ctx, "postToolUse", {
        rule: describeRule(rule),
        tool: toolEvent.toolName,
        agent,
        reason,
      });
      if (ctx.hasUI) ctx.ui.notify(reason, "info");
    }
  });
}
