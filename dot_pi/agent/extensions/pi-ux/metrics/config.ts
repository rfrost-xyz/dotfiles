/**
 * Response metrics config types, defaults, parser, on-disk path.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type MetricKey =
  | "duration"
  | "modelTime"
  | "toolTime"
  | "toolCalls"
  | "modelPasses"
  | "model"
  | "usage"
  | "cost"
  | "tokensPerSecond";

export type MetricListKey = "liveMetrics" | "finalMetrics";
export type LiveStyle = "terse" | "verbose";
export type PhraseTheme = "wankernomics" | "siliconValley" | "officeSpace";
export type PhraseAnimation = "off" | "shimmer";

export const METRIC_KEYS: MetricKey[] = [
  "duration",
  "modelTime",
  "toolTime",
  "toolCalls",
  "modelPasses",
  "model",
  "usage",
  "cost",
  "tokensPerSecond",
];

export const PHRASE_THEMES: PhraseTheme[] = [
  "wankernomics",
  "siliconValley",
  "officeSpace",
];

export type ResponseMetricsOptions = {
  version: number;
  live: boolean;
  appendToMessage: boolean;
  liveMetrics: MetricKey[];
  finalMetrics: MetricKey[];
  minAppendDurationMs: number;
  intervalMs: number;
  label: string;
  liveStyle: LiveStyle;
  phrases: { enabled: boolean; themes: PhraseTheme[] };
  phraseAnimation: PhraseAnimation;
  phraseAnimationMs: number;
};

export const DIAGNOSTIC_TYPE = "metrics:turn";
export const CONFIG_VERSION = 2;
export const CONFIG_PATH = join(
  homedir(),
  ".pi",
  "agent",
  "config",
  "metrics.json",
);

export const DEFAULT_OPTIONS: ResponseMetricsOptions = {
  version: CONFIG_VERSION,
  live: true,
  appendToMessage: false,
  liveMetrics: ["duration", "usage", "tokensPerSecond"],
  finalMetrics: ["duration", "usage", "tokensPerSecond"],
  minAppendDurationMs: 2_000,
  intervalMs: 1_000,
  label: "Took",
  liveStyle: "verbose",
  phrases: { enabled: true, themes: [...PHRASE_THEMES] },
  phraseAnimation: "shimmer",
  phraseAnimationMs: 80,
};

function normalizePhraseThemes(
  value: unknown,
  fallback: PhraseTheme[],
): PhraseTheme[] {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<PhraseTheme>();
  const next: PhraseTheme[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !PHRASE_THEMES.includes(item as PhraseTheme)
    )
      continue;
    const theme = item as PhraseTheme;
    if (!seen.has(theme)) next.push(theme);
    seen.add(theme);
  }
  return next.length ? next : [...fallback];
}

function normalizeMetricList(
  value: unknown,
  fallback: MetricKey[],
): MetricKey[] {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<MetricKey>();
  const next: MetricKey[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !METRIC_KEYS.includes(item as MetricKey))
      continue;
    const metric = item as MetricKey;
    if (!seen.has(metric)) next.push(metric);
    seen.add(metric);
  }
  return next;
}

export function parseOptions(raw: unknown): ResponseMetricsOptions {
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_OPTIONS);
  const data = raw as Partial<ResponseMetricsOptions>;
  const phrasesRaw = (
    data as { phrases?: Partial<ResponseMetricsOptions["phrases"]> }
  ).phrases;
  return {
    version: CONFIG_VERSION,
    live: typeof data.live === "boolean" ? data.live : DEFAULT_OPTIONS.live,
    appendToMessage:
      typeof data.appendToMessage === "boolean"
        ? data.appendToMessage
        : DEFAULT_OPTIONS.appendToMessage,
    liveMetrics: normalizeMetricList(
      data.liveMetrics,
      DEFAULT_OPTIONS.liveMetrics,
    ),
    finalMetrics: normalizeMetricList(
      data.finalMetrics,
      DEFAULT_OPTIONS.finalMetrics,
    ),
    minAppendDurationMs:
      typeof data.minAppendDurationMs === "number" &&
      Number.isFinite(data.minAppendDurationMs)
        ? data.minAppendDurationMs
        : DEFAULT_OPTIONS.minAppendDurationMs,
    intervalMs:
      typeof data.intervalMs === "number" && Number.isFinite(data.intervalMs)
        ? data.intervalMs
        : DEFAULT_OPTIONS.intervalMs,
    label:
      typeof data.label === "string" && data.label.trim()
        ? data.label.trim()
        : DEFAULT_OPTIONS.label,
    liveStyle:
      data.liveStyle === "terse" || data.liveStyle === "verbose"
        ? data.liveStyle
        : DEFAULT_OPTIONS.liveStyle,
    phrases: {
      enabled:
        typeof phrasesRaw?.enabled === "boolean"
          ? phrasesRaw.enabled
          : DEFAULT_OPTIONS.phrases.enabled,
      themes: normalizePhraseThemes(
        phrasesRaw?.themes,
        DEFAULT_OPTIONS.phrases.themes,
      ),
    },
    phraseAnimation:
      data.phraseAnimation === "off" || data.phraseAnimation === "shimmer"
        ? data.phraseAnimation
        : DEFAULT_OPTIONS.phraseAnimation,
    phraseAnimationMs:
      typeof data.phraseAnimationMs === "number" &&
      Number.isFinite(data.phraseAnimationMs) &&
      data.phraseAnimationMs >= 40
        ? data.phraseAnimationMs
        : DEFAULT_OPTIONS.phraseAnimationMs,
  };
}

export function loadOptions(): ResponseMetricsOptions {
  try {
    return existsSync(CONFIG_PATH)
      ? parseOptions(JSON.parse(readFileSync(CONFIG_PATH, "utf8")))
      : structuredClone(DEFAULT_OPTIONS);
  } catch {
    return structuredClone(DEFAULT_OPTIONS);
  }
}

export function saveOptions(options: ResponseMetricsOptions): void {
  writeFileSync(CONFIG_PATH, `${JSON.stringify(options, null, 2)}\n`);
}
