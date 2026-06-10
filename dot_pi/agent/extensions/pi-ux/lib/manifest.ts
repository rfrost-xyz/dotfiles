/**
 * Extension enable/disable manifest.
 *
 * `~/.pi/agent/config/extensions.json` keyed by extension name:
 *
 * {
 *   "metrics":       { "enabled": true },
 *   "hooks":         { "enabled": true },
 *   ...
 * }
 *
 * Project layer at `<project>/.pi/extensions.json` lets you disable
 * features per-worktree. Reading is lazy and cached; each extension's
 * `index.ts` calls `isEnabled("name")` and returns early if disabled.
 *
 * `ux` (the /config hub) is not listed and cannot be disabled here.
 * Statusline is also not listed — it lives as a sibling extension and is
 * always on when loaded; control its visibility via /config → Statusline
 * or by editing statusline.json.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { Config, projectConfigPath } from "./config.ts";

export type ExtensionsManifest = Record<string, { enabled: boolean }>;

export const MANIFEST_PATH = join(
  homedir(),
  ".pi",
  "agent",
  "config",
  "extensions.json",
);

export const DEFAULT_MANIFEST: ExtensionsManifest = {
  metrics: { enabled: true },
  hooks: { enabled: true },
  permissions: { enabled: true },
  quotas: { enabled: true },
  "theme-sync": { enabled: true },
  autocomplete: { enabled: true },
};

export const KNOWN_EXTENSIONS: string[] = Object.keys(DEFAULT_MANIFEST);

function parseManifest(raw: unknown): ExtensionsManifest {
  if (!raw || typeof raw !== "object")
    return structuredClone(DEFAULT_MANIFEST);
  const data = raw as Record<string, unknown>;
  const out: ExtensionsManifest = structuredClone(DEFAULT_MANIFEST);
  for (const [name, entry] of Object.entries(data)) {
    if (!entry || typeof entry !== "object") continue;
    const enabled = (entry as { enabled?: unknown }).enabled;
    if (typeof enabled === "boolean") {
      out[name] = { ...(out[name] ?? { enabled: true }), enabled };
    }
  }
  return out;
}

let cached: Config<ExtensionsManifest> | undefined;

export function manifestConfig(): Config<ExtensionsManifest> {
  if (!cached) {
    cached = new Config<ExtensionsManifest>({
      userPath: MANIFEST_PATH,
      projectPath: () => projectConfigPath("extensions.json"),
      defaults: DEFAULT_MANIFEST,
      parse: parseManifest,
    });
    cached.watch();
  }
  return cached;
}

export function isEnabled(name: string): boolean {
  return manifestConfig().get()[name]?.enabled !== false;
}
