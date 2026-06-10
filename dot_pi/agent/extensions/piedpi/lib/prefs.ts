/**
 * Shared lib preferences.
 *
 * One small JSON file at `~/.pi/agent/config/lib.json` controls behaviour
 * common to multiple lib primitives. Today: how many rows a CycleMenu
 * shows before scrolling, and the "usable" context window threshold
 * marker that /context paints on its attribution graph.
 *
 * Example:
 *   {
 *     "menu":    { "maxVisible": 10 },
 *     "context": { "usableTokens": 128000 }
 *   }
 *
 * Edit the file freely — lib watches it and reloads. Defaults apply when
 * the file is missing or malformed.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { FillBasis } from "./colour.ts";
import { Config } from "./config.ts";

export type LibPrefs = {
  menu: {
    /** Max rows shown by CycleMenu before scrolling. Min 1. */
    maxVisible: number;
  };
  context: {
    /**
     * "Useful" context tokens. /context paints a marker tick on its
     * attribution bar at this position, since many models degrade past
     * a soft threshold even when the hard window is larger. 0 disables
     * the marker entirely. Default 128_000.
     */
    usableTokens: number;
    /**
     * Buffer below the usable marker where the indicator turns yellow.
     * Value is a percent of `usableTokens` — e.g. 15 means yellow from
     * `usableTokens * 0.85` up to `usableTokens`, red beyond. Clamped
     * to [0, 100]. Default 15.
     */
    tolerancePercent: number;
    /**
     * Whether the displayed percentage uses the usable marker or the
     * model's full context window as the denominator. Colour always
     * follows the usable marker regardless. Default "usable".
     */
    fillBasis: FillBasis;
  };
};

const DEFAULTS: LibPrefs = {
  menu: {
    maxVisible: 10,
  },
  context: {
    usableTokens: 128_000,
    tolerancePercent: 15,
    fillBasis: "usable",
  },
};

const PATH = join(homedir(), ".pi", "agent", "config", "lib.json");

function parse(raw: unknown): LibPrefs {
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULTS);
  const r = raw as {
    menu?: { maxVisible?: unknown };
    context?: {
      usableTokens?: unknown;
      tolerancePercent?: unknown;
      fillBasis?: unknown;
    };
  };
  let maxVisible = DEFAULTS.menu.maxVisible;
  if (typeof r.menu?.maxVisible === "number" && r.menu.maxVisible >= 1) {
    maxVisible = Math.floor(r.menu.maxVisible);
  }
  let usableTokens = DEFAULTS.context.usableTokens;
  if (
    typeof r.context?.usableTokens === "number" &&
    r.context.usableTokens >= 0
  ) {
    usableTokens = Math.floor(r.context.usableTokens);
  }
  let tolerancePercent = DEFAULTS.context.tolerancePercent;
  if (
    typeof r.context?.tolerancePercent === "number" &&
    r.context.tolerancePercent >= 0
  ) {
    tolerancePercent = Math.min(100, Math.floor(r.context.tolerancePercent));
  }
  let fillBasis = DEFAULTS.context.fillBasis;
  if (r.context?.fillBasis === "window" || r.context?.fillBasis === "usable") {
    fillBasis = r.context.fillBasis;
  }
  return {
    menu: { maxVisible },
    context: { usableTokens, tolerancePercent, fillBasis },
  };
}

let cached: Config<LibPrefs> | undefined;

export function libPrefs(): Config<LibPrefs> {
  if (!cached) {
    cached = new Config<LibPrefs>({
      userPath: PATH,
      defaults: DEFAULTS,
      parse,
    });
    cached.watch();
  }
  return cached;
}
