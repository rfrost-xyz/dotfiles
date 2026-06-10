/**
 * /config — hub for shared piedpi preferences (lib.json).
 *
 * Surfaces preferences that aren't specific to a single extension —
 * the kind of dials a user wants once and forgets. Today:
 *
 *   - menu.maxVisible   how many rows CycleMenu shows before scrolling.
 *   - context.usableTokens   where /context paints its "usable" marker
 *                            on the attribution graph.
 *   - context.tolerancePercent / fillBasis   shared context indicator
 *                            colour and percentage semantics.
 *
 * More piedpi-wide settings should land here as they emerge (the
 * statusline-specific ones — segment layout, git base, currencies —
 * stay under /statusline).
 *
 * Implementation matches /statusline: openConfigMenu over the lib
 * Config<LibPrefs>, with cycle-of-presets rows. Edit lib.json directly
 * for values outside the preset list.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { openConfigMenu } from "./lib/config-menu.ts";
import { type CycleRow, type MenuTheme } from "./lib/cycle-menu.ts";
import { type LibPrefs, libPrefs } from "./lib/prefs.ts";

const MENU_MAX_VISIBLE_PRESETS = [6, 8, 10, 12, 16, 20] as const;
const TOLERANCE_PRESETS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;

// 0 means "no marker" — included so users can switch it off without
// editing the JSON. Other values are typical context-window targets.
const USABLE_TOKEN_PRESETS = [
  0, 64_000, 96_000, 128_000, 160_000, 192_000, 200_000, 256_000,
] as const;

function fmtTokensTerse(n: number): string {
  if (n === 0) return "off";
  if (n % 1000 === 0) return `${n / 1000}k`;
  return `${n}`;
}

function nearestIndex(values: readonly number[], current: number): number {
  let bestIdx = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < values.length; i++) {
    const diff = Math.abs(values[i]! - current);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function buildRows(snapshot: LibPrefs): CycleRow[] {
  return [
    { kind: "heading", name: "Menus" },
    {
      kind: "value",
      name: "rows visible",
      values: MENU_MAX_VISIBLE_PRESETS.map((n) => `${n}`),
      initialIndex: nearestIndex(MENU_MAX_VISIBLE_PRESETS, snapshot.menu.maxVisible),
    },
    { kind: "heading", name: "Context" },
    {
      kind: "value",
      name: "usable marker",
      values: USABLE_TOKEN_PRESETS.map((n) => fmtTokensTerse(n)),
      initialIndex: nearestIndex(
        USABLE_TOKEN_PRESETS,
        snapshot.context.usableTokens,
      ),
    },
    {
      kind: "value",
      name: "warning tolerance",
      values: TOLERANCE_PRESETS.map((n) => `${n}%`),
      initialIndex: nearestIndex(
        TOLERANCE_PRESETS,
        snapshot.context.tolerancePercent,
      ),
    },
    {
      kind: "value",
      name: "fill basis",
      values: ["usable", "window"],
      initialIndex: snapshot.context.fillBasis === "window" ? 1 : 0,
    },
  ];
}

function applyRows(original: LibPrefs, idxs: readonly number[]): LibPrefs {
  // Row indices map by order: [headingMenus, maxVisible, headingContext, usable, tolerance, basis]
  const maxVisible =
    MENU_MAX_VISIBLE_PRESETS[idxs[1]!] ?? original.menu.maxVisible;
  const usableTokens =
    USABLE_TOKEN_PRESETS[idxs[3]!] ?? original.context.usableTokens;
  const tolerancePercent =
    TOLERANCE_PRESETS[idxs[4]!] ?? original.context.tolerancePercent;
  const fillBasis = idxs[5] === 1 ? "window" : "usable";
  return {
    menu: { ...original.menu, maxVisible },
    context: { ...original.context, usableTokens, tolerancePercent, fillBasis },
  };
}

export default function config(pi: ExtensionAPI) {
  const prefs = libPrefs();
  prefs.watch();

  pi.registerCommand("config", {
    description:
      "Shared piedpi preferences — menu sizing, /context marker, etc.",
    handler: async (_args, ctx) => {
      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        return openConfigMenu<LibPrefs>(
          tui,
          theme as unknown as MenuTheme,
          () => done(undefined),
          {
            config: prefs,
            buildRows,
            applyRows,
            title: "piedpi config",
          },
        );
      });
    },
  });
}
