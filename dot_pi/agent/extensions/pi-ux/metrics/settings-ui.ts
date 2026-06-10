/**
 * Response-metrics configuration menu (rendered as the Response metrics
 * page inside /config:ux).
 *
 * Top-level menu uses the shared declarative `buildMenu` helper from
 * `lib/menu.ts`; each field carries its own get/set, so there's no
 * separate onChange switch. The two submenus that need bespoke
 * interaction (metric reorder via Shift+J/K, phrase-themes toggle) keep
 * their own bespoke Components.
 */

import {
  type Component,
  type SettingItem,
  SettingsList,
} from "@earendil-works/pi-tui";
import { fmtDuration } from "../lib/format.ts";
import { buildMenu, type MenuField } from "../lib/menu.ts";
import { highlightTheme, type ThemeFg } from "../lib/theme.ts";
import { getHighlightColor } from "../lib/ui-config.ts";
import {
  type LiveStyle,
  type MetricKey,
  METRIC_KEYS,
  type MetricListKey,
  type PhraseAnimation,
  type PhraseTheme,
  PHRASE_THEMES,
  type ResponseMetricsOptions,
} from "./config.ts";

const DURATION_VALUES = [0, 1_000, 2_000, 3_000, 5_000, 10_000].map((v) =>
  fmtDuration(v),
);
const INTERVAL_VALUES = [500, 1_000, 2_000, 5_000].map((v) =>
  v === 500 ? "0.5s" : fmtDuration(v),
);
const LABEL_VALUES = ["Took", "Thought for", "Responded in", "Completed in"];

const parseDurationValue = (s: string): number => {
  if (s === "0.5s") return 500;
  const seconds = Number.parseInt(s.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
};

const fmtIntervalMs = (ms: number): string =>
  ms === 500 ? "0.5s" : fmtDuration(ms);

const PHRASE_THEME_LABELS: Record<PhraseTheme, string> = {
  wankernomics: "Wankernomics",
  siliconValley: "Silicon Valley",
  officeSpace: "Office Space",
};

const PHRASE_THEME_ABBREV: Record<PhraseTheme, string> = {
  wankernomics: "wanker",
  siliconValley: "valley",
  officeSpace: "office",
};

function phraseSummary(options: ResponseMetricsOptions): string {
  if (!options.phrases.enabled) return "off";
  if (!options.phrases.themes.length) return "none";
  return options.phrases.themes.map((t) => PHRASE_THEME_ABBREV[t]).join(", ");
}

// ── Metric list submenu (with reorder) ──────────────────────────────────────

function metricsSubmenuFactory(
  options: ResponseMetricsOptions,
  key: MetricListKey,
  persist: () => void,
) {
  return (theme: ThemeFg, close: () => void): Component => {
    const listTheme = highlightTheme(theme, getHighlightColor());
    const buildItems = (): SettingItem[] => {
      const enabled = options[key];
      const disabled = METRIC_KEYS.filter((m) => !enabled.includes(m));
      return [
        ...enabled.map((m, i) => ({
          id: m,
          label: `${(i + 1).toString().padStart(2)}. ${m}`,
          currentValue: "on",
          values: ["on", "off"],
        })),
        ...disabled.map((m) => ({
          id: m,
          label: ` –. ${m}`,
          currentValue: "off",
          values: ["on", "off"],
        })),
      ];
    };
    const items = buildItems();
    const list = new SettingsList(
      items,
      10,
      listTheme,
      (id, value) => {
        const metric = id as MetricKey;
        const isEnabled = options[key].includes(metric);
        if (value === "on" && !isEnabled)
          options[key] = [...options[key], metric];
        else if (value === "off" && isEnabled)
          options[key] = options[key].filter((m) => m !== metric);
        persist();
        refresh(metric);
      },
      close,
    );
    const internals = list as unknown as { selectedIndex: number };
    const refresh = (follow?: MetricKey): void => {
      items.splice(0, items.length, ...buildItems());
      if (follow) {
        const at = items.findIndex((it) => it.id === follow);
        if (at >= 0) internals.selectedIndex = at;
      }
    };
    const move = (delta: -1 | 1): void => {
      const item = items[internals.selectedIndex];
      if (!item) return;
      const metric = item.id as MetricKey;
      const arr = options[key];
      const at = arr.indexOf(metric);
      if (at < 0) return;
      const target = Math.max(0, Math.min(arr.length - 1, at + delta));
      if (target === at) return;
      const next = [...arr];
      next.splice(at, 1);
      next.splice(target, 0, metric);
      options[key] = next;
      persist();
      refresh(metric);
    };

    return {
      submenuComponent: list,
      render: (w: number) => list.render(w),
      invalidate: () => list.invalidate(),
      handleInput: (data: string) => {
        if (data === "K" || data === "\x1b[1;2A") return move(-1);
        if (data === "J" || data === "\x1b[1;2B") return move(1);
        return list.handleInput?.(data);
      },
    } as Component;
  };
}

// ── Phrase themes submenu ───────────────────────────────────────────────────

function phrasesSubmenuFactory(
  options: ResponseMetricsOptions,
  persist: () => void,
) {
  return (theme: ThemeFg, close: () => void): Component => {
    const listTheme = highlightTheme(theme, getHighlightColor());
    const buildItems = (): SettingItem[] => [
      {
        id: "__enabled",
        label: "Enabled",
        currentValue: options.phrases.enabled ? "on" : "off",
        values: ["on", "off"],
      },
      ...PHRASE_THEMES.map((t) => ({
        id: t,
        label: PHRASE_THEME_LABELS[t],
        currentValue: options.phrases.themes.includes(t) ? "on" : "off",
        values: ["on", "off"],
      })),
    ];
    const list = new SettingsList(
      buildItems(),
      8,
      listTheme,
      (id, value) => {
        if (id === "__enabled") options.phrases.enabled = value === "on";
        else {
          const t = id as PhraseTheme;
          const has = options.phrases.themes.includes(t);
          if (value === "on" && !has)
            options.phrases.themes = [...options.phrases.themes, t];
          else if (value === "off" && has)
            options.phrases.themes = options.phrases.themes.filter((x) => x !== t);
        }
        persist();
        for (const item of buildItems())
          list.updateValue(item.id, item.currentValue);
      },
      close,
    );
    return list;
  };
}

// ── Top-level declarative menu ──────────────────────────────────────────────

export function buildMetricsMenu(
  options: ResponseMetricsOptions,
  theme: ThemeFg,
  persist: () => void,
  close: () => void,
): Component {
  const fields: MenuField[] = [
    {
      kind: "toggle",
      id: "live",
      label: "Live timer",
      description: "Update the live row while the assistant is active.",
      get: () => options.live,
      set: (v) => { options.live = v; persist(); },
    },
    {
      kind: "cycle",
      id: "liveStyle",
      label: "Live style",
      description:
        "Verbose: 'Frolicking… (9m 36s · ↓ 48.2k tokens · thought for 5s)'. Terse: compact symbols.",
      values: ["terse", "verbose"],
      get: () => options.liveStyle,
      set: (v) => { options.liveStyle = v as LiveStyle; persist(); },
    },
    {
      kind: "submenu",
      id: "phrases",
      label: "Phrases",
      description: "Themed gerunds rotated per turn.",
      currentValue: () => phraseSummary(options),
      build: (t, close2) => phrasesSubmenuFactory(options, persist)(t, close2),
    },
    {
      kind: "cycle",
      id: "phraseAnimation",
      label: "Phrase animation",
      description:
        "Shimmer rides a bright spot across the phrase using the omarchy accent.",
      values: ["shimmer", "off"],
      get: () => options.phraseAnimation,
      set: (v) => { options.phraseAnimation = v as PhraseAnimation; persist(); },
    },
    {
      kind: "toggle",
      id: "appendToMessage",
      label: "Append to final message",
      description:
        "If on, '_Took …_' is appended to the final assistant text; otherwise metrics live only in diagnostics.",
      get: () => options.appendToMessage,
      set: (v) => { options.appendToMessage = v; persist(); },
    },
    {
      kind: "submenu",
      id: "liveMetrics",
      label: "Live metrics",
      description:
        "h/l toggle · Shift+J/K reorder · enabled rows show their position.",
      currentValue: () => options.liveMetrics.join(", ") || "none",
      build: (t, close2) =>
        metricsSubmenuFactory(options, "liveMetrics", persist)(t, close2),
    },
    {
      kind: "submenu",
      id: "finalMetrics",
      label: "Final metrics",
      description:
        "h/l toggle · Shift+J/K reorder · enabled rows show their position.",
      currentValue: () => options.finalMetrics.join(", ") || "none",
      build: (t, close2) =>
        metricsSubmenuFactory(options, "finalMetrics", persist)(t, close2),
    },
    {
      kind: "cycle",
      id: "minAppendDurationMs",
      label: "Min final duration",
      values: DURATION_VALUES,
      get: () => fmtDuration(options.minAppendDurationMs),
      set: (v) => { options.minAppendDurationMs = parseDurationValue(v); persist(); },
    },
    {
      kind: "cycle",
      id: "intervalMs",
      label: "Live interval",
      values: INTERVAL_VALUES,
      get: () => fmtIntervalMs(options.intervalMs),
      set: (v) => { options.intervalMs = parseDurationValue(v); persist(); },
    },
    {
      kind: "cycle",
      id: "label",
      label: "Final label",
      values: LABEL_VALUES,
      get: () => options.label,
      set: (v) => { options.label = v; persist(); },
    },
  ];
  return buildMenu(fields, theme, close);
}
