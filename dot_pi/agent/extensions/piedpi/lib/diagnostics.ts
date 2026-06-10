/**
 * Shared diagnostics recorder.
 *
 * Extensions write structured events that ride along with the assistant
 * message diagnostics array. Pi persists these in session JSONL; later
 * extensions (e.g. a /session:events command) can replay them.
 *
 * Each consumer constructs `new Diagnostics("extension-name")` and calls
 * `record(type, details)`. The event is attached to the current assistant
 * message if one is being streamed, otherwise to the last assistant message
 * on the active branch. Falls back to silent no-op if nothing applies.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type DiagnosticEvent = {
  source: string;
  type: string;
  timestamp: number;
  details?: Record<string, unknown>;
};

type MessageDiagnostic = {
  type: string;
  timestamp: number;
  details: Record<string, unknown>;
};

function findLatestAssistantMessage(
  ctx: ExtensionContext,
): AssistantMessage | undefined {
  const branch = ctx.sessionManager.getBranch();
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type === "message" && entry.message.role === "assistant") {
      return entry.message as AssistantMessage;
    }
  }
  return undefined;
}

export class Diagnostics {
  constructor(private readonly source: string) {}

  record(
    ctx: ExtensionContext,
    type: string,
    details?: Record<string, unknown>,
  ): void {
    const target = findLatestAssistantMessage(ctx);
    if (!target) return;
    const event: MessageDiagnostic = {
      type: `${this.source}:${type}`,
      timestamp: Date.now(),
      details: { source: this.source, ...(details ?? {}) },
    };
    target.diagnostics = [
      ...((target.diagnostics as MessageDiagnostic[] | undefined) ?? []),
      event,
    ];
  }
}
