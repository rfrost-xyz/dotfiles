/**
 * Live "thinking" message: random phrase + shimmer animation +
 * composed metric line.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type TokenUsage } from "../lib/format.ts";
import {
  blendRgb,
  darken,
  hexToRgb,
  isOmarchyLightMode,
  lighten,
  paintRgb,
  readOmarchyAccent,
  type Rgb,
} from "../lib/theme.ts";
import { type PhraseTheme, type ResponseMetricsOptions } from "./config.ts";
import { buildMetricParts, type TimerDetails } from "./format.ts";

// ── Phrase pools ────────────────────────────────────────────────────────────

const PHRASE_POOLS: Record<PhraseTheme, string[]> = {
  wankernomics: [
    "Synergising in a mind camp…",
    "Circling back…",
    "Touching base with the stakeholders…",
    "Cascading and looping in to HR…",
    "Aligning with stakeholders…",
    "Back off, I'm ideating…",
    "Taking all of this offline…",
  ],
  siliconValley: [
    "Middling out…",
    "Burning all the runway on a tiki party…",
    "Conjoining the triangles of success…",
    "Pied-pipering…",
  ],
  officeSpace: [
    "TPS-reporting…",
    "Cover-sheeting…",
    "Mmm-yeahing…",
    "Flair collecting…",
    "Consulting the Bobs…",
    "Setting fire to the building…",
    "Avoiding Lumbergh…",
    "Smashing up the printer…",
    "PC LOAD LETTER…",
  ],
};

export function pickPhrase(opts: ResponseMetricsOptions): string {
  if (!opts.phrases.enabled || !opts.phrases.themes.length) return "Thinking…";
  const pool: string[] = [];
  for (const theme of opts.phrases.themes) pool.push(...PHRASE_POOLS[theme]);
  if (!pool.length) return "Thinking…";
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Live state ──────────────────────────────────────────────────────────────

export type LiveState = {
  startedAt?: number;
  modelSegmentStartedAt?: number;
  toolSegmentStartedAt?: number;
  modelDurationMs: number;
  toolDurationMs: number;
  toolCallCount: number;
  modelPassCount: number;
  latestUsage?: TokenUsage;
  liveBaseUsage?: TokenUsage;
  lastLiveUsageText?: string;
  lastLiveMessage?: string;
  lastLiveUpdateAt?: number;
  timer?: ReturnType<typeof setInterval>;
  shimmerTimer?: ReturnType<typeof setInterval>;
  phrase?: string;
  plainInner?: string;
  wavePos: number;
};

export function newLiveState(): LiveState {
  return {
    modelDurationMs: 0,
    toolDurationMs: 0,
    toolCallCount: 0,
    modelPassCount: 0,
    wavePos: 0,
  };
}

export function liveUsage(
  base: TokenUsage | undefined,
  latest: TokenUsage | undefined,
): TokenUsage | undefined {
  if (!base && !latest) return undefined;
  return {
    input: base?.input,
    cacheRead: base?.cacheRead,
    cacheWrite: base?.cacheWrite,
    output: latest?.output,
    outputEstimate:
      latest?.output === undefined ? latest?.outputEstimate : undefined,
  };
}

export function currentDetails(
  state: LiveState,
  endedAt = Date.now(),
): TimerDetails | undefined {
  if (!state.startedAt) return undefined;
  return {
    startedAt: state.startedAt,
    endedAt,
    durationMs: endedAt - state.startedAt,
    modelDurationMs:
      state.modelDurationMs +
      (state.modelSegmentStartedAt ? endedAt - state.modelSegmentStartedAt : 0),
    toolDurationMs:
      state.toolDurationMs +
      (state.toolSegmentStartedAt ? endedAt - state.toolSegmentStartedAt : 0),
    toolCallCount: state.toolCallCount,
    modelPassCount: state.modelPassCount,
  };
}

// ── Shimmer ─────────────────────────────────────────────────────────────────

function shimmerText(
  text: string,
  accent: Rgb,
  base: Rgb,
  wavePos: number,
  sigma = 2.5,
): string {
  const chars = [...text];
  const L = chars.length;
  if (!L) return "";
  let out = "";
  const span = Math.max(2, L * 2);
  for (let i = 0; i < L; i++) {
    let d = i - wavePos;
    d = ((d % span) + span) % span;
    if (d > L) d = d - span;
    const t = Math.exp(-(d * d) / (2 * sigma * sigma));
    const [r, g, b] = blendRgb(base, accent, t);
    out += `\x1b[38;2;${r};${g};${b}m${chars[i]}`;
  }
  return out + "\x1b[39m";
}

function shimmerColors(): { accent: Rgb; base: Rgb; peak: Rgb } {
  const accentHex = readOmarchyAccent() ?? "#89b4fa";
  const accent = hexToRgb(accentHex);
  if (isOmarchyLightMode()) {
    return { accent, base: accent, peak: darken(accent, 0.45) };
  }
  return { accent, base: accent, peak: lighten(accent, 0.5) };
}

function composeLiveLine(
  phraseText: string,
  inner: string,
  verbose: boolean,
): string {
  if (!phraseText && !inner) return "";
  if (verbose) return inner ? `${phraseText} (${inner})` : phraseText;
  if (phraseText && inner) return `${phraseText} · ${inner}`;
  return phraseText || inner;
}

export function renderLiveLine(
  ctx: ExtensionContext,
  state: LiveState,
  options: ResponseMetricsOptions,
): void {
  if (!options.live) return;
  const verbose = options.liveStyle === "verbose";
  const phrase = state.phrase ?? (verbose ? "Thinking…" : "");
  const inner = state.plainInner ?? "";
  let phraseRendered = phrase;
  if (phrase) {
    const { accent, base, peak } = shimmerColors();
    if (options.phraseAnimation === "shimmer") {
      phraseRendered = shimmerText(phrase, peak, base, state.wavePos);
    } else {
      phraseRendered = paintRgb(accent, phrase);
    }
  }
  const message = composeLiveLine(phraseRendered, inner, verbose);
  state.lastLiveMessage = message;
  ctx.ui.setWorkingMessage(message);
}

export function setLiveTimer(
  ctx: ExtensionContext,
  state: LiveState,
  options: ResponseMetricsOptions,
  force = false,
): void {
  if (!options.live) return;
  const now = Date.now();
  if (
    !force &&
    state.lastLiveUpdateAt &&
    now - state.lastLiveUpdateAt < options.intervalMs
  )
    return;
  const details = currentDetails(state, now);
  if (!details) return;
  const parts = buildMetricParts(
    details,
    liveUsage(state.liveBaseUsage, state.latestUsage),
    undefined,
    "",
    options.liveStyle,
  );
  if (parts.usage) state.lastLiveUsageText = parts.usage;
  else if (options.liveMetrics.includes("usage") && state.lastLiveUsageText)
    parts.usage = state.lastLiveUsageText;
  state.plainInner = options.liveMetrics
    .map((key) => parts[key])
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  state.lastLiveUpdateAt = now;
  renderLiveLine(ctx, state, options);
}
