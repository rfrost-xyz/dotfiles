/**
 * Final-line + per-metric formatters.
 */

import {
  fmtCost,
  fmtDuration,
  formatTokensPerSecond,
  formatUsage,
  type TokenUsage,
} from "../lib/format.ts";
import type { LiveStyle, MetricKey } from "./config.ts";

export type TimerDetails = {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  modelDurationMs: number;
  toolDurationMs: number;
  toolCallCount: number;
  modelPassCount: number;
};

export function buildMetricParts(
  details: TimerDetails,
  usage: TokenUsage | undefined,
  model: string | undefined,
  label: string,
  style: LiveStyle = "terse",
): Partial<Record<MetricKey, string>> {
  const verbose = style === "verbose";
  return {
    duration: label
      ? `${label} ${fmtDuration(details.durationMs)}`
      : fmtDuration(details.durationMs),
    modelTime:
      details.modelDurationMs >= 1_000
        ? verbose
          ? `thought for ${fmtDuration(details.modelDurationMs)}`
          : `model ${fmtDuration(details.modelDurationMs)}`
        : undefined,
    toolTime:
      details.toolDurationMs >= 1_000
        ? verbose
          ? `tools ran for ${fmtDuration(details.toolDurationMs)}`
          : `tools ${fmtDuration(details.toolDurationMs)}`
        : undefined,
    toolCalls:
      details.toolCallCount > 0
        ? `${details.toolCallCount} tool ${details.toolCallCount === 1 ? "call" : "calls"}`
        : undefined,
    modelPasses:
      details.modelPassCount > 1
        ? `${details.modelPassCount} model passes`
        : undefined,
    model,
    usage: formatUsage(usage, style),
    cost: fmtCost(usage?.cost?.total),
    tokensPerSecond: formatTokensPerSecond(usage, details.modelDurationMs),
  };
}

function withFinalCountOrder(metrics: MetricKey[]): MetricKey[] {
  const withoutCounts = metrics.filter(
    (key) => key !== "modelPasses" && key !== "toolCalls",
  );
  return [
    ...withoutCounts,
    ...(metrics.includes("modelPasses") ? (["modelPasses"] as const) : []),
    ...(metrics.includes("toolCalls") ? (["toolCalls"] as const) : []),
  ];
}

export function buildLabel(
  details: TimerDetails,
  usage: TokenUsage | undefined,
  model: string | undefined,
  metrics: MetricKey[],
  label: string,
  style: LiveStyle = "terse",
): string {
  const parts = buildMetricParts(details, usage, model, label, style);
  return withFinalCountOrder(metrics)
    .map((key) => parts[key])
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function appendMetricsToContent<T extends { type: string; text?: string }>(
  content: T[],
  label: string,
): T[] {
  const next = [...content];
  for (let i = next.length - 1; i >= 0; i--) {
    const block = next[i];
    if (block?.type !== "text") continue;
    const text = block.text ?? "";
    if (text.includes(`_${label}_`)) return next;
    next[i] = { ...block, text: `${text}${text.trim() ? "\n\n" : ""}_${label}_` };
    return next;
  }
  return [...next, { type: "text", text: `_${label}_` } as T];
}
