/**
 * Response metrics extension.
 *
 * Lifecycle: starts a live timer on agent_start, ticks `setLiveTimer` and
 * (if enabled) the shimmer animation. On message_end attaches metrics as
 * a structured diagnostic; optionally appends "_Took …_" to the assistant
 * message content.
 */

import { existsSync, watch } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerConfigPage } from "../lib/config-pages.ts";
import { isEnabled } from "../lib/manifest.ts";
import {
  CONFIG_PATH,
  DIAGNOSTIC_TYPE,
  loadOptions,
  type ResponseMetricsOptions,
  saveOptions,
} from "./config.ts";
import {
  appendMetricsToContent,
  buildLabel,
  type TimerDetails,
} from "./format.ts";
import {
  currentDetails,
  type LiveState,
  newLiveState,
  pickPhrase,
  renderLiveLine,
  setLiveTimer,
} from "./live-message.ts";
import { buildMetricsMenu } from "./settings-ui.ts";

function withLiveUsageEstimate(
  usage: import("../lib/format.ts").TokenUsage | undefined,
  content: unknown,
): import("../lib/format.ts").TokenUsage | undefined {
  const estimate = estimateVisibleOutputTokens(content);
  if (estimate === undefined || usage?.output !== undefined) return usage;
  return { ...(usage ?? {}), outputEstimate: estimate };
}

function estimateVisibleOutputTokens(content: unknown): number | undefined {
  if (!Array.isArray(content)) return undefined;
  const chars = content.reduce((sum, block) => {
    if (!block || typeof block !== "object") return sum;
    const typed = block as { type?: string; text?: unknown };
    return typed.type === "text" && typeof typed.text === "string"
      ? sum + typed.text.length
      : sum;
  }, 0);
  return chars > 0 ? Math.max(1, Math.round(chars / 4)) : undefined;
}

function mergeUsage(
  previous: import("../lib/format.ts").TokenUsage | undefined,
  next: import("../lib/format.ts").TokenUsage | undefined,
): import("../lib/format.ts").TokenUsage | undefined {
  if (!previous) return next;
  if (!next) return previous;
  return {
    input: next.input ?? previous.input,
    output: next.output ?? previous.output,
    outputEstimate:
      next.output === undefined
        ? (next.outputEstimate ?? previous.outputEstimate)
        : undefined,
    cacheRead: next.cacheRead ?? previous.cacheRead,
    cacheWrite: next.cacheWrite ?? previous.cacheWrite,
    cost: next.cost ?? previous.cost,
  };
}

function latchLiveBaseUsage(
  previous: import("../lib/format.ts").TokenUsage | undefined,
  next: import("../lib/format.ts").TokenUsage | undefined,
): import("../lib/format.ts").TokenUsage | undefined {
  if (!next) return previous;
  return {
    input: previous?.input ?? next.input,
    cacheRead: previous?.cacheRead ?? next.cacheRead,
    cacheWrite: previous?.cacheWrite ?? next.cacheWrite,
  };
}

function countToolCalls(content: unknown): number {
  return Array.isArray(content)
    ? content.filter(
        (block) =>
          block &&
          typeof block === "object" &&
          (block as { type?: unknown }).type === "toolCall",
      ).length
    : 0;
}

export default function metricsExtension(pi: ExtensionAPI) {
  if (!isEnabled("metrics")) return;
  let options: ResponseMetricsOptions = loadOptions();
  const state: LiveState = newLiveState();

  registerConfigPage({
    id: "metrics",
    label: "Response metrics",
    description: "Live phrase, shimmer, timer, final-line label, metric ordering.",
    build: (theme, close) =>
      buildMetricsMenu(options, theme, () => saveOptions(options), close),
  });

  try {
    if (existsSync(CONFIG_PATH))
      watch(CONFIG_PATH, { persistent: false }, () => {
        const next = loadOptions();
        if (JSON.stringify(next) === JSON.stringify(options)) return;
        options = next;
      });
  } catch {
    /* ignore */
  }

  function resetTurn(ctx?: ExtensionContext): void {
    if (state.timer) clearInterval(state.timer);
    state.timer = undefined;
    if (state.shimmerTimer) clearInterval(state.shimmerTimer);
    state.shimmerTimer = undefined;
    ctx?.ui.setWorkingMessage();
    state.startedAt = undefined;
    state.modelSegmentStartedAt = undefined;
    state.toolSegmentStartedAt = undefined;
    state.modelDurationMs = 0;
    state.toolDurationMs = 0;
    state.toolCallCount = 0;
    state.modelPassCount = 0;
    state.latestUsage = undefined;
    state.liveBaseUsage = undefined;
    state.lastLiveUsageText = undefined;
    state.lastLiveMessage = undefined;
    state.lastLiveUpdateAt = undefined;
    state.phrase = undefined;
    state.plainInner = undefined;
    state.wavePos = 0;
  }

  function markAssistantActive(): void {
    const now = Date.now();
    if (state.toolSegmentStartedAt) {
      state.toolDurationMs += now - state.toolSegmentStartedAt;
      state.toolSegmentStartedAt = undefined;
    }
    state.modelSegmentStartedAt ??= now;
  }

  function markAssistantStoppedForTool(): void {
    const now = Date.now();
    if (state.modelSegmentStartedAt) {
      state.modelDurationMs += now - state.modelSegmentStartedAt;
      state.modelSegmentStartedAt = undefined;
    }
    state.toolSegmentStartedAt = now;
  }

  function finishTurn(ctx?: ExtensionContext): TimerDetails | undefined {
    const details = currentDetails(state);
    resetTurn(ctx);
    return details;
  }

  pi.on("agent_start", (_event, ctx) => {
    resetTurn(ctx);
    const now = Date.now();
    state.startedAt = now;
    state.modelSegmentStartedAt = now;
    state.phrase = pickPhrase(options);
    state.wavePos = 0;
    setLiveTimer(ctx, state, options, true);
    if (options.live)
      state.timer = setInterval(
        () => setLiveTimer(ctx, state, options, true),
        options.intervalMs,
      );
    if (options.live && options.phraseAnimation === "shimmer") {
      state.shimmerTimer = setInterval(() => {
        state.wavePos += 0.6;
        renderLiveLine(ctx, state, options);
      }, options.phraseAnimationMs);
    }
  });

  pi.on("message_update", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    markAssistantActive();
    const updateUsage = withLiveUsageEstimate(
      event.message.usage,
      event.message.content,
    );
    state.liveBaseUsage = latchLiveBaseUsage(state.liveBaseUsage, updateUsage);
    state.latestUsage = mergeUsage(state.latestUsage, updateUsage);
    setLiveTimer(ctx, state, options);
  });

  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const updateUsage = withLiveUsageEstimate(
      event.message.usage,
      event.message.content,
    );
    state.liveBaseUsage = latchLiveBaseUsage(state.liveBaseUsage, updateUsage);
    const usage = mergeUsage(state.latestUsage, updateUsage);
    state.latestUsage = usage;
    state.modelPassCount += 1;
    state.toolCallCount += countToolCalls(event.message.content);

    if (event.message.stopReason === "toolUse") {
      markAssistantStoppedForTool();
      setLiveTimer(ctx, state, options, true);
      return;
    }
    if (
      event.message.diagnostics?.some(
        (diagnostic) => diagnostic.type === DIAGNOSTIC_TYPE,
      )
    ) {
      resetTurn(ctx);
      return;
    }

    const details = finishTurn(ctx);
    if (!details) return;
    const messageWithModel = event.message as typeof event.message & {
      model?: unknown;
    };
    const model =
      typeof messageWithModel.model === "string"
        ? messageWithModel.model
        : undefined;
    const label = buildLabel(
      details,
      usage,
      model,
      options.finalMetrics,
      options.label,
      options.liveStyle,
    );
    if (
      options.appendToMessage &&
      label &&
      details.durationMs >= options.minAppendDurationMs
    ) {
      event.message.content = appendMetricsToContent(
        event.message.content,
        label,
      );
    }
    event.message.diagnostics = [
      ...(event.message.diagnostics ?? []),
      {
        type: DIAGNOSTIC_TYPE,
        timestamp: details.endedAt,
        details: {
          ...details,
          label,
          model,
          usage,
          liveMetrics: options.liveMetrics,
          finalMetrics: options.finalMetrics,
        },
      },
    ];
  });

  pi.on("agent_end", (_event, ctx) => resetTurn(ctx));
  pi.on("session_shutdown", (_event, ctx) => resetTurn(ctx));
}
