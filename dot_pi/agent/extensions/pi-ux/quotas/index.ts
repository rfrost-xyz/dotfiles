/**
 * Vendor quota poller.
 *
 * Today: OpenAI Codex / ChatGPT 5h + weekly usage windows from the
 * private chatgpt.com/backend-api endpoint, polled on agent turn
 * boundaries. Results published on `globalThis.__piCodexQuotas` so the
 * statusline `codex5h` and `codexWeekly` segments can read them without
 * importing this extension. When disabled, segments render nothing.
 *
 * Future: add more vendor pollers in their own files alongside this one
 * (e.g. anthropic.ts, openrouter.ts) and re-export from index. Statusline
 * segments can be added per vendor; the registry shape will likely grow
 * to a `globalThis.__piQuotas` map keyed by vendor when that happens.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Diagnostics } from "../lib/diagnostics.ts";
import { isEnabled } from "../lib/manifest.ts";

export type QuotaWindow = {
  usedPercent: number;
  windowSeconds: number;
  resetAt?: number;
};

export type CodexUsage = {
  fiveHour?: QuotaWindow;
  weekly?: QuotaWindow;
  fetchedAt?: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __piCodexQuotas: CodexUsage | undefined;
}

const CHATGPT_BASE_URL = (
  process.env.CHATGPT_BASE_URL || "https://chatgpt.com/backend-api"
).replace(/\/+$/, "");
const OPENAI_AUTH_CLAIM = "https://api.openai.com/auth";
const FIVE_HOUR_SECONDS = 5 * 60 * 60;
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const CODEX_TTL_MS = 60_000;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeWindow(value: unknown): QuotaWindow | undefined {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.used_percent !== "number" ||
    typeof record.limit_window_seconds !== "number"
  )
    return undefined;
  return {
    usedPercent: record.used_percent,
    windowSeconds: record.limit_window_seconds,
    resetAt: typeof record.reset_at === "number" ? record.reset_at : undefined,
  };
}

function parseCodexUsage(data: unknown): CodexUsage {
  const rateLimit = asRecord(asRecord(data)?.rate_limit);
  const windows = [
    normalizeWindow(rateLimit?.primary_window),
    normalizeWindow(rateLimit?.secondary_window),
  ].filter(Boolean) as QuotaWindow[];
  return {
    fiveHour: windows.find(
      (w) => Math.abs(w.windowSeconds - FIVE_HOUR_SECONDS) <= 120,
    ),
    weekly: windows.find(
      (w) => Math.abs(w.windowSeconds - WEEK_SECONDS) <= 120,
    ),
    fetchedAt: Date.now(),
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    return JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    );
  } catch {
    return {};
  }
}

function accountIdFromToken(token: string): string | undefined {
  const payload = decodeJwtPayload(token);
  const auth = asRecord(payload[OPENAI_AUTH_CLAIM]);
  return typeof auth?.chatgpt_account_id === "string"
    ? auth.chatgpt_account_id
    : undefined;
}

function isCodexProvider(provider: string | undefined): boolean {
  return (
    provider === "openai-codex" ||
    /^openai-codex-\d+$/.test(provider ?? "")
  );
}

export default function quotasExtension(pi: ExtensionAPI) {
  if (!isEnabled("quotas")) return;

  // Note: quotas no longer register a ConfigPage — their data is surfaced
  // by the /stats Quotas tab. This extension just polls + publishes to
  // globalThis so statusline segments and the hub can read it.

  const diag = new Diagnostics("quotas");

  pi.on("session_start", (_event, ctx) => {
    let inflight: Promise<void> | undefined;

    const refresh = async (force = false): Promise<void> => {
      if (!isCodexProvider(ctx.model?.provider)) {
        globalThis.__piCodexQuotas = undefined;
        return;
      }
      const cached = globalThis.__piCodexQuotas;
      if (
        !force &&
        cached?.fetchedAt &&
        Date.now() - cached.fetchedAt < CODEX_TTL_MS
      )
        return;
      if (inflight) return inflight;

      const model = ctx.model;
      if (!model) {
        globalThis.__piCodexQuotas = undefined;
        return;
      }

      inflight = (async () => {
        const auth = await ctx.modelRegistry
          .getApiKeyAndHeaders(model)
          .catch(() => undefined);
        if (!auth?.ok || !auth.apiKey) {
          globalThis.__piCodexQuotas = undefined;
          diag.record(ctx, "refresh-skipped", { reason: "no-api-key" });
          return;
        }
        const accountId = accountIdFromToken(auth.apiKey);
        const response = await fetch(`${CHATGPT_BASE_URL}/wham/usage`, {
          headers: {
            Authorization: `Bearer ${auth.apiKey}`,
            Accept: "application/json",
            "User-Agent": "pi-quotas",
            ...(accountId ? { "chatgpt-account-id": accountId } : {}),
          },
          signal: AbortSignal.timeout(15000),
        }).catch(() => undefined);
        if (response?.ok) {
          globalThis.__piCodexQuotas = parseCodexUsage(await response.json());
          diag.record(ctx, "refresh", {
            fiveHourUsed: globalThis.__piCodexQuotas?.fiveHour?.usedPercent,
            weeklyUsed: globalThis.__piCodexQuotas?.weekly?.usedPercent,
            fetchedAt: globalThis.__piCodexQuotas?.fetchedAt,
          });
        } else {
          globalThis.__piCodexQuotas = undefined;
          diag.record(ctx, "refresh-failed", {
            status: response?.status,
          });
        }
      })().finally(() => {
        inflight = undefined;
      });
      return inflight;
    };

    void refresh(true);

    const onTurnBoundary = () => void refresh();
    pi.on("agent_end", onTurnBoundary);
    pi.on("model_select", () => void refresh(true));
  });
}
