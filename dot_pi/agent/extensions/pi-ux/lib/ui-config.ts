/**
 * Shared pi-ux UI preferences.
 *
 * Anything that should look the same across every menu (statusline,
 * metrics, hooks, permissions, ux hub) lives here. Right now: just
 * `highlightColor`. The original design had each extension carrying its
 * own copy — that was a mistake.
 *
 * Stored at `~/.pi/agent/config/ui.json`; project-layered via
 * `<project>/.pi/ui.json`.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { Config, projectConfigPath } from "./config.ts";
import { HIGHLIGHT_COLORS, type HighlightColor } from "./theme.ts";

export type UiConfig = {
  highlightColor: HighlightColor;
};

export const DEFAULT_UI: UiConfig = {
  highlightColor: "accent",
};

export const UI_CONFIG_PATH = join(
  homedir(),
  ".pi",
  "agent",
  "config",
  "ui.json",
);

function parse(raw: unknown): UiConfig {
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_UI);
  const data = raw as Partial<UiConfig>;
  return {
    highlightColor: HIGHLIGHT_COLORS.includes(
      data.highlightColor as HighlightColor,
    )
      ? (data.highlightColor as HighlightColor)
      : DEFAULT_UI.highlightColor,
  };
}

let cached: Config<UiConfig> | undefined;

export function uiConfig(): Config<UiConfig> {
  if (!cached) {
    cached = new Config<UiConfig>({
      userPath: UI_CONFIG_PATH,
      projectPath: () => projectConfigPath("ui.json"),
      defaults: DEFAULT_UI,
      parse,
    });
    cached.watch();
  }
  return cached;
}

export function getHighlightColor(): HighlightColor {
  return uiConfig().get().highlightColor;
}

export function setHighlightColor(color: HighlightColor): void {
  const c = uiConfig();
  c.save({ ...c.get(), highlightColor: color });
}
