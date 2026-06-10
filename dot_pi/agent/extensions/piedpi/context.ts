/**
 * /context — overlay report on this session's context window + token
 * flow, split across three tabs:
 *
 *   - Overview   model, used / window with pie glyph, attribution bar
 *                + legend — a single-screen snapshot of what's
 *                currently loaded in the context window.
 *   - Breakdown  selectable list of categories with drill-in (hjkl /
 *                cursor keys, enter). Breadcrumb sits just above the
 *                table.
 *   - Flow       one timeline of four 2-row sparkline charts (input ↑,
 *                output ↓, cache read R, cache write W) sharing a
 *                common turn axis, with a cursor moved by `h/l` /
 *                `←/→`. The cursor's full turn-width gets a
 *                SELECTED_BG spotlight across every chart so the
 *                highlight reads at a glance even when each turn
 *                occupies multiple cells. Below the timeline, a
 *                concise per-turn stats block names the cursor turn's
 *                input source split, output composition, cache impact,
 *                and chain position. Chain boundaries — where a fresh
 *                user message kicks off a cascade of model calls —
 *                are marked above the charts with `┊` in MUTED, so
 *                you can see how turns group into chains at a glance.
 *                `g`/`G` jump to first/last turn; `v` toggles linear/
 *                log. Compactions get a `↓` glyph (WARN) at their
 *                turn position on the same marker row.
 *
 * Tabs cycled with Tab / Shift+Tab. The Modal owns chrome and dispatch;
 * tabs own per-tab rendering and key bindings. Symbols (↑ ↓ R W pie)
 * match the statusline so the two read as one design.
 */

import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  loadProjectContextFiles,
  type ThemeColor,
  type ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { type Component, visibleWidth } from "@earendil-works/pi-tui";
import {
  fillPercent,
  paintHex,
  shiftHex,
  usableMarkerColour,
} from "./lib/colour.ts";
import {
  columns,
  hbar,
  type Mark,
  markerRow,
  type Painter,
  scaleFn,
  stack,
  turnSpan,
  turnToColumn,
} from "./lib/charts.ts";
import { type MenuTheme } from "./lib/cycle-menu.ts";
import { fmtTokens, pieChar } from "./lib/format.ts";
import { padVisible, truncate, wrapText } from "./lib/text.ts";
import {
  type ModalBodyContext,
  type ModalKey,
  openModal,
} from "./lib/modal.ts";
import { libPrefs } from "./lib/prefs.ts";
import { Tabs, tabsNavKeys } from "./lib/tabs.ts";

/**
 * Top-level grouping for the attribution colour palette. Categories
 * classify into one of these; each maps to a colour via omarchy-theme
 * (with theme-token fallback when omarchy-theme isn't loaded). Children
 * inherit their parent category's group, so the drill-in view paints
 * cohesively with the parent.
 */
type SegmentGroup =
  | "conversation"
  | "system"
  | "agents"
  | "tools"
  | "skills"
  | "prompts"
  | "extensions";

type Item = {
  id: string;
  name: string;
  tokens: number;
  detail?: string;
  group: SegmentGroup;
  /** Drill-in children. Nested arbitrarily — Item is recursive. */
  children?: Item[];
  /**
   * Raw text of whatever this leaf represents — a tool's signature,
   * an AGENTS.md file, a skill body. Drilling into a leaf with content
   * enters preview mode (truncated head), a second drill expands to
   * full (scrollable). Leaves without `content` aren't drillable
   * further than their list row.
   */
  content?: string;
};

// Type alias kept for readability where a value is conceptually the
// root of a drillable subtree (vs a leaf row).
type Category = Item;

type Flow = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  turns: number;
};

type PerTurn = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  // Output sub-totals (estimated from message content blocks).
  // Sum of text + thinking + toolCalls roughly equals `output`; small
  // drift is expected because content estimates aren't billing-exact.
  outputText: number;
  outputThinking: number;
  outputToolCalls: number;
  // Tool-name + count for tools called this turn. Drives the Flow
  // output drill-in row.
  toolsCalled: ReadonlyMap<string, number>;
  // Input sub-totals — what showed up between the previous assistant
  // turn and this one, paired into "user message" (typed input) vs
  // "tool results" (output of tool calls). Together they explain
  // roughly where this turn's fresh input bytes came from. Estimated
  // from content lengths, same caveat as the output sub-totals.
  inputUserMsg: number;
  inputToolResults: number;
};

type Snapshot = {
  estimated: number;
  sent: number | null;
  used: number;
  contextWindow: number;
  modelName: string;
  categories: Category[];
  flow: Flow;
  perTurn: readonly PerTurn[];
};

const ACCENT: ThemeColor = "accent";
const DIM: ThemeColor = "dim";
const MUTED: ThemeColor = "muted";
const TEXT: ThemeColor = "text";
const TITLE: ThemeColor = "customMessageLabel";
const WARN: ThemeColor = "warning";
const SUCCESS: ThemeColor = "success";
const LINK: ThemeColor = "mdLink";
const HEADING: ThemeColor = "mdHeading";
const SELECTED_BG: ThemeColor = "selectedBg";

// Fallback pi theme tokens when omarchy-theme isn't loaded (or hasn't
// published a hex for a group yet). One distinct token per group so the
// attribution graph + legend stay readable even without omarchy-theme.
const GROUP_FALLBACK: Record<SegmentGroup, ThemeColor> = {
  conversation: ACCENT,
  system: HEADING,
  agents: "syntaxKeyword",
  tools: LINK,
  skills: WARN,
  prompts: "syntaxString",
  extensions: SUCCESS,
};

type FlowChannel = "flowInput" | "flowOutput" | "flowCacheRead" | "flowCacheWrite";

/**
 * Bar-visualisation scales the user can cycle via the `v` key. Each
 * mode produces a 0..1 ratio for a given value, mapped to bar fill.
 *
 *   linear  v / max         honest absolute proportion
 *   log     log(1+v) / log(1+max)
 *                           compresses dynamic range so a dominant
 *                           value (cache read, Conversation) doesn't
 *                           crush the rest
 */
type VizMode = "linear" | "log";

declare global {
  // eslint-disable-next-line no-var
  var __piedpiContext:
    | {
        conversation?: string;
        system?: string;
        agents?: string;
        tools?: string;
        skills?: string;
        prompts?: string;
        extensions?: string;
        flowInput?: string;
        flowOutput?: string;
        flowCacheRead?: string;
        flowCacheWrite?: string;
      }
    | undefined;
}

// Fallback theme tokens for flow channels when omarchy hex is absent.
// Match the prior hardcoded mapping so behaviour is unchanged for users
// not running omarchy-theme.
const FLOW_FALLBACK: Record<FlowChannel, ThemeColor> = {
  flowInput: SUCCESS,
  flowOutput: WARN,
  flowCacheRead: ACCENT,
  flowCacheWrite: LINK,
};

function paintFlow(
  channel: FlowChannel,
  text: string,
  theme: MenuTheme,
): string {
  const hex = globalThis.__piedpiContext?.[channel];
  if (hex && hex.startsWith("#")) return paintHex(hex, text);
  return theme.fg(FLOW_FALLBACK[channel], text);
}

// Brightness offsets cycled per row index to give children inside a
// drill-in distinct shades of the parent group's colour. The schedule
// alternates lighten/darken at growing magnitudes so any two adjacent
// rows are visually distinguishable. Only applied when omarchy has
// published a hex — pi theme tokens can't be perturbed without
// allocating new tokens. Magnitudes deliberately large (±60 to ±100)
// so the differences read at a glance in a narrow column.
const TINT_SCHEDULE = [0, 60, -60, 100, -40, 30, -90, 80, -20, 45, -75] as const;

/**
 * Paint a single cell of the attribution graph (or legend swatch).
 * `tintIndex` shifts the colour brightness per child row inside a
 * drill-in (default 0 = no tint). Top-level rows pass 0 so each
 * group keeps its canonical colour.
 */
function paintSegment(
  group: SegmentGroup,
  char: string,
  theme: MenuTheme,
  tintIndex = 0,
): string {
  const hex = globalThis.__piedpiContext?.[group];
  if (hex && hex.startsWith("#")) {
    const shift = TINT_SCHEDULE[tintIndex % TINT_SCHEDULE.length] ?? 0;
    return paintHex(shift === 0 ? hex : shiftHex(hex, shift), char);
  }
  return theme.fg(GROUP_FALLBACK[group], char);
}

const emptyFlow = (): Flow => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  turns: 0,
});

function perTurnFromSession(ctx: ExtensionContext): PerTurn[] {
  const out: PerTurn[] = [];
  // Buffer user-role and tool-result content as we walk; flush onto
  // the next assistant turn so each PerTurn pairs with the input
  // that triggered it.
  let pendingUserMsg = 0;
  let pendingToolResults = 0;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (!("role" in msg)) continue;

    if (msg.role === "user") {
      const um = entry.message as {
        content: string | { type?: string; text?: string }[];
      };
      if (typeof um.content === "string") {
        pendingUserMsg += estimateTokens(um.content);
      } else if (Array.isArray(um.content)) {
        for (const block of um.content) {
          if (block?.type === "text" && typeof block.text === "string") {
            pendingUserMsg += estimateTokens(block.text);
          }
        }
      }
      continue;
    }

    if (msg.role === "toolResult") {
      const tr = entry.message as {
        content?: { type?: string; text?: string }[];
      };
      for (const block of tr.content ?? []) {
        if (block?.type === "text" && typeof block.text === "string") {
          pendingToolResults += estimateTokens(block.text);
        }
      }
      continue;
    }

    if (msg.role !== "assistant") continue;
    if (!msg.usage) continue;

    // Walk the assistant message's content blocks to split the
    // output token bucket into text / thinking / toolCall sub-totals
    // and collect tool-call names. Numbers are estimates from char
    // length (same heuristic as collectSessionContent), not
    // billing-exact — sum may drift slightly from `usage.output`.
    let outputText = 0;
    let outputThinking = 0;
    let outputToolCalls = 0;
    const toolsCalled = new Map<string, number>();
    const am = msg as {
      content?: {
        type?: string;
        text?: string;
        thinking?: string;
        name?: string;
        arguments?: Record<string, unknown>;
      }[];
    };
    for (const block of am.content ?? []) {
      if (block.type === "text" && typeof block.text === "string") {
        outputText += estimateTokens(block.text);
      } else if (
        block.type === "thinking" &&
        typeof block.thinking === "string"
      ) {
        outputThinking += estimateTokens(block.thinking);
      } else if (block.type === "toolCall") {
        const name = block.name ?? "";
        const args = JSON.stringify(block.arguments ?? {});
        outputToolCalls += estimateTokens(name + args);
        if (name) toolsCalled.set(name, (toolsCalled.get(name) ?? 0) + 1);
      }
    }
    out.push({
      input: msg.usage.input,
      output: msg.usage.output,
      cacheRead: msg.usage.cacheRead,
      cacheWrite: msg.usage.cacheWrite,
      outputText,
      outputThinking,
      outputToolCalls,
      toolsCalled,
      inputUserMsg: pendingUserMsg,
      inputToolResults: pendingToolResults,
    });
    pendingUserMsg = 0;
    pendingToolResults = 0;
  }
  return out;
}

function flowFromPerTurn(turns: readonly PerTurn[]): Flow {
  const flow = emptyFlow();
  for (const t of turns) {
    flow.input += t.input;
    flow.output += t.output;
    flow.cacheRead += t.cacheRead;
    flow.cacheWrite += t.cacheWrite;
    flow.turns += 1;
  }
  return flow;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateToolTokens(t: ToolInfo): number {
  const desc = t.description ?? "";
  const params = JSON.stringify(t.parameters ?? {});
  return estimateTokens(t.name + desc + params);
}

/**
 * Remove sections that pi builds into the effective system prompt but
 * which /context reports as their own System children. The remaining
 * text is the base/harness prompt, so previewing it doesn't duplicate
 * AGENTS.md or the available-skills list.
 */
function systemPromptWithoutReportedSections(prompt: string): string {
  return prompt
    .replace(/\n*<project_context>[\s\S]*?<\/project_context>\n*/g, "\n")
    .replace(/\n*The following skills provide specialized instructions for specific tasks\.[\s\S]*?<\/available_skills>\n*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseMcpName(
  name: string,
): { server: string; displayName: string } | undefined {
  const m = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(name);
  if (!m) return undefined;
  return { server: m[1]!, displayName: m[2]! };
}

function firstShellCommand(command: string): string | undefined {
  for (const rawLine of command.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    // Skip common shell setup lines that are not the real user-facing tool.
    if (/^(set|export|source|cd)\b/.test(line)) continue;
    line = line.split(/\s*(?:&&|\|\||\||;)\s*/)[0]?.trim() ?? line;
    const tokens = line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    for (let token of tokens) {
      token = token.replace(/^['"]|['"]$/g, "");
      if (!token || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
      if (["sudo", "env", "command", "time", "timeout"].includes(token)) continue;
      return basename(token);
    }
  }
  return undefined;
}

function bashToolAlias(command: string): string | undefined {
  const exe = firstShellCommand(command);
  if (!exe) return undefined;
  return `bash:${exe}`;
}

function displayToolName(name: string): string {
  return parseMcpName(name)?.displayName ?? name;
}

function displayBashCommandName(name: string): string {
  return name.startsWith("bash:") ? name.slice("bash:".length) : name;
}

/**
 * Painter for a SegmentGroup that respects omarchy's per-group hex
 * (via `paintSegment`). Used as the `fill` callback when handing
 * group-coloured charts to `lib/charts`.
 */
function segmentPainter(
  group: SegmentGroup,
  theme: MenuTheme,
  tintIndex = 0,
): Painter {
  return (text) => paintSegment(group, text, theme, tintIndex);
}

type SessionContent = {
  user: number;
  assistantText: number;
  assistantThinking: number;
  toolCalls: number;
  toolResults: number;
  /** Tool-call bytes split by tool name (assistant's toolCall blocks). */
  toolCallsByTool: ReadonlyMap<string, number>;
  /** Tool-result bytes split by tool name (toolResult messages carry
   *  `toolName` directly, so attribution is exact rather than
   *  positional for real tools; bash subcommands are matched by call id). */
  toolResultsByTool: ReadonlyMap<string, number>;
  /** For bash specifically, split call/result bytes by the executable invoked.
   *  These are nested under the `bash` tool row rather than promoted to tools. */
  bashCallsByCommand: ReadonlyMap<string, number>;
  bashResultsByCommand: ReadonlyMap<string, number>;
};

/**
 * Walk session entries and classify their bytes by role + block type.
 * Returns the raw estimates; the caller decides which top-level
 * category each bucket attaches to.
 *
 * Categorisation (post-cleanup):
 *   - user messages           → `User` category
 *   - assistant text/thinking → `Assistant` category
 *   - tool calls (assistant
 *     content type=toolCall)  → active `Tools` usage
 *   - tool results (separate
 *     role=toolResult)        → active `Tools` usage
 *
 * The previous "Conversation" wrapper mixed all five into one bucket;
 * the split puts each bucket in the category that matches what it
 * actually represents.
 */
function collectSessionContent(ctx: ExtensionContext): SessionContent {
  let user = 0;
  let assistantText = 0;
  let assistantThinking = 0;
  let toolCalls = 0;
  let toolResults = 0;
  const toolCallsByTool = new Map<string, number>();
  const toolResultsByTool = new Map<string, number>();
  const bashCallsByCommand = new Map<string, number>();
  const bashResultsByCommand = new Map<string, number>();
  const toolCallAliases = new Map<string, string>();

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "message") continue;
    const msg = entry.message as { role?: string };
    if (msg.role === "user") {
      const um = entry.message as {
        content: string | { type?: string; text?: string }[];
      };
      if (typeof um.content === "string") {
        user += estimateTokens(um.content);
      } else if (Array.isArray(um.content)) {
        for (const block of um.content) {
          if (block?.type === "text" && typeof block.text === "string") {
            user += estimateTokens(block.text);
          }
        }
      }
    } else if (msg.role === "assistant") {
      const am = entry.message as {
        content: {
          type?: string;
          id?: string;
          text?: string;
          thinking?: string;
          name?: string;
          arguments?: Record<string, unknown>;
        }[];
      };
      for (const block of am.content ?? []) {
        if (block.type === "text" && typeof block.text === "string") {
          assistantText += estimateTokens(block.text);
        } else if (
          block.type === "thinking" &&
          typeof block.thinking === "string"
        ) {
          assistantThinking += estimateTokens(block.thinking);
        } else if (block.type === "toolCall") {
          const rawName = block.name ?? "";
          const command = typeof block.arguments?.command === "string"
            ? block.arguments.command
            : undefined;
          const alias = rawName === "bash" && command
            ? bashToolAlias(command)
            : undefined;
          if (block.id && alias) toolCallAliases.set(block.id, alias);
          const args = JSON.stringify(block.arguments ?? {});
          const bytes = estimateTokens(rawName + args);
          toolCalls += bytes;
          if (rawName) {
            toolCallsByTool.set(rawName, (toolCallsByTool.get(rawName) ?? 0) + bytes);
          }
          if (alias) {
            bashCallsByCommand.set(alias, (bashCallsByCommand.get(alias) ?? 0) + bytes);
          }
        }
      }
    } else if (msg.role === "toolResult") {
      // ToolResultMessage carries `toolName` directly — attribution
      // is exact (no positional matching against earlier toolCall ids).
      const tr = entry.message as {
        toolCallId?: string;
        toolName?: string;
        content?: { type?: string; text?: string }[];
      };
      let bytes = 0;
      for (const block of tr.content ?? []) {
        if (block?.type === "text" && typeof block.text === "string") {
          bytes += estimateTokens(block.text);
        }
      }
      toolResults += bytes;
      const toolName = tr.toolName ?? "unknown";
      const alias = tr.toolCallId ? toolCallAliases.get(tr.toolCallId) : undefined;
      if (bytes > 0) {
        toolResultsByTool.set(
          toolName,
          (toolResultsByTool.get(toolName) ?? 0) + bytes,
        );
        if (alias) {
          bashResultsByCommand.set(alias, (bashResultsByCommand.get(alias) ?? 0) + bytes);
        }
      }
    }
  }

  return {
    user,
    assistantText,
    assistantThinking,
    toolCalls,
    toolResults,
    toolCallsByTool,
    toolResultsByTool,
    bashCallsByCommand,
    bashResultsByCommand,
  };
}

function collectSnapshot(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  flow: Flow,
  perTurn: readonly PerTurn[],
): Snapshot {
  const usage = ctx.getContextUsage();
  const model = ctx.model;
  const sysPrompt = ctx.getSystemPrompt();
  const tools = pi.getAllTools();
  const commands = pi.getCommands();

  // Project-context files (AGENTS.md / CLAUDE.md from the agent dir up
  // through cwd). Pi inlines them into the effective system prompt;
  // /context strips that generated section back out of the base prompt
  // and reports each file as its own System child.
  const agentDir = join(homedir(), ".pi", "agent");
  let projectFiles: { path: string; content: string }[] = [];
  try {
    projectFiles = loadProjectContextFiles({ cwd: ctx.cwd, agentDir });
  } catch {
    projectFiles = [];
  }
  const projectFileTokens = projectFiles.map((f) => ({
    path: f.path,
    tokens: estimateTokens(f.content),
    content: f.content,
  }));
  const baseSystemPrompt = systemPromptWithoutReportedSections(sysPrompt);
  const systemPromptTokens = estimateTokens(baseSystemPrompt);

  // ── Session content (user msgs, assistant blocks, tool I/O) ─────────
  // Walked once up-front so per-tool aggregation below can fold the
  // tool calls + tool results bytes into each tool's row, and the
  // User / Assistant category builders further down can read the
  // already-classified totals.
  const content = collectSessionContent(ctx);

  // ── System children: base prompt + generated startup material ──────
  // AGENTS.md rows are kept flat under System so a single file doesn't
  // require drilling through an extra "Agents" wrapper.

  // ── Agent instruction files ─────────────────────────────────────────
  const agentsChildren: Item[] = projectFileTokens
    .filter((f) => f.tokens > 0)
    .map((f) => ({
      id: `agents:${f.path}`,
      name: basename(f.path),
      tokens: f.tokens,
      detail: f.path,
      group: "agents" as const,
      content: f.content,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  // ── Tool definitions vs active tool I/O ─────────────────────────────
  // Tool schemas are static prompt material loaded with the system
  // prompt, while tool calls/results are active conversation flow. Keep
  // those costs in separate branches so the root view is mostly live
  // usage plus one System bucket for startup load.
  const toolDefinitionItems: Item[] = tools
    .map((t) => {
      const src = t.sourceInfo.source;
      const source = src === "builtin" ? "built-in" : src;
      return {
        id: `system:tool:${t.name}:def`,
        name: displayToolName(t.name),
        tokens: estimateToolTokens(t),
        detail: `source: ${source}`,
        group: "tools" as const,
        content: `${t.description ?? "(no description)"}\n\nParameters:\n${JSON.stringify(t.parameters ?? {}, null, 2)}`,
      };
    })
    .filter((t) => t.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);

  type PerToolBucket = {
    callTokens: number;
    resultTokens: number;
    source: string;
  };
  const perTool = new Map<string, PerToolBucket>();
  const getBucket = (name: string): PerToolBucket => {
    let b = perTool.get(name);
    if (!b) {
      b = {
        callTokens: 0,
        resultTokens: 0,
        source: "unregistered",
      };
      perTool.set(name, b);
    }
    return b;
  };
  // Seed registered tool sources without adding their definitions to
  // active usage; definitions are reported under System above.
  for (const t of tools) {
    const b = getBucket(t.name);
    const src = t.sourceInfo.source;
    b.source = src === "builtin" ? "built-in" : src;
  }
  // Merge in this-session call + result usage. Tools that were
  // called/got results but are no longer registered (e.g. a removed
  // MCP server, or a different session shape) get `source:
  // unregistered`.
  for (const [name, bytes] of content.toolCallsByTool) {
    const b = getBucket(name);
    b.callTokens = bytes;
    if (name.startsWith("bash:")) b.source = "bash command";
  }
  for (const [name, bytes] of content.toolResultsByTool) {
    const b = getBucket(name);
    b.resultTokens = bytes;
    if (name.startsWith("bash:")) b.source = "bash command";
  }

  const toolItems: Item[] = [];
  for (const [name, b] of perTool) {
    const total = b.callTokens + b.resultTokens;
    if (total === 0) continue;
    const children: Item[] = [];
    const bashCommandChildren: Item[] = [];
    if (name === "bash") {
      const commandNames = new Set<string>([
        ...content.bashCallsByCommand.keys(),
        ...content.bashResultsByCommand.keys(),
      ]);
      for (const commandName of commandNames) {
        const callTokens = content.bashCallsByCommand.get(commandName) ?? 0;
        const resultTokens = content.bashResultsByCommand.get(commandName) ?? 0;
        const commandChildren: Item[] = [];
        if (callTokens > 0) {
          commandChildren.push({
            id: `tool:bash:${commandName}:calls`,
            name: "calls",
            tokens: callTokens,
            detail: "shell command payloads emitted by assistant",
            group: "tools",
          });
        }
        if (resultTokens > 0) {
          commandChildren.push({
            id: `tool:bash:${commandName}:results`,
            name: "results",
            tokens: resultTokens,
            detail: "command output fed back to the model",
            group: "tools",
          });
        }
        bashCommandChildren.push({
          id: `tool:bash:${commandName}`,
          name: displayBashCommandName(commandName),
          tokens: callTokens + resultTokens,
          detail: "executable invoked through bash",
          group: "tools",
          children: commandChildren.length > 1 ? commandChildren : undefined,
          content: commandChildren.length <= 1 ? commandChildren[0]?.detail : undefined,
        });
      }
      bashCommandChildren.sort((a, b) => b.tokens - a.tokens);
      children.push(...bashCommandChildren);
    }

    if (b.callTokens > 0 && bashCommandChildren.length === 0) {
      children.push({
        id: `tool:${name}:calls`,
        name: "calls",
        tokens: b.callTokens,
        detail: "tool-call payloads emitted by assistant",
        group: "tools",
      });
    }
    if (b.resultTokens > 0 && bashCommandChildren.length === 0) {
      children.push({
        id: `tool:${name}:results`,
        name: "results",
        tokens: b.resultTokens,
        detail: "tool execution output fed back to the model",
        group: "tools",
      });
    }
    // Flatten the tool row when there's only one active role. Static
    // definitions live under System, so active Tools is purely what
    // the assistant emitted or the harness fed back this session.
    if (children.length === 1 && !children[0]!.children) {
      const only = children[0]!;
      toolItems.push({
        id: `tool:${name}`,
        name: displayToolName(name),
        tokens: total,
        group: "tools",
        detail: `source: ${b.source}`,
        content: only.content,
      });
    } else {
      toolItems.push({
        id: `tool:${name}`,
        name: displayToolName(name),
        tokens: total,
        group: "tools",
        detail: `source: ${b.source}`,
        children: children.length > 0 ? children : undefined,
      });
    }
  }
  toolItems.sort((a, b) => b.tokens - a.tokens);
  const toolsTotal = toolItems.reduce((s, t) => s + t.tokens, 0);

  // ── Static slash-command definitions loaded with the prompt ─────────
  const cmdGroup = (
    group: SegmentGroup,
    source: "skill" | "prompt" | "extension",
  ): Item[] =>
    commands
      .filter((c) => c.source === source)
      .map((c) => ({
        id: c.name,
        name: c.name,
        tokens: estimateTokens(`${c.name}: ${c.description ?? ""}`),
        detail: c.description,
        group,
        // Slash-command "content" is just name + description — that's
        // all pi exposes pre-invocation. Enough for the preview to
        // show "what does /foo do".
        content: `/${c.name}\n\n${c.description ?? "(no description)"}`,
      }))
      .sort((a, b) => b.tokens - a.tokens);

  const skillChildren = cmdGroup("skills", "skill");
  const promptChildren = cmdGroup("prompts", "prompt");
  const extChildren = cmdGroup("extensions", "extension");
  const sumTokens = (items: Item[]) => items.reduce((s, c) => s + c.tokens, 0);

  const sent = usage?.tokens ?? null;

  const categories: Category[] = [];

  // ── User ────────────────────────────────────────────────────────────
  if (content.user > 0) {
    categories.push({
      id: "group:user",
      name: "User",
      tokens: content.user,
      group: "conversation",
      detail: "messages typed this session",
    });
  }

  // ── Assistant (text + thinking) ────────────────────────────────────
  // Children are only useful when both block types have signal — a
  // session with only text (or only thinking) collapses to a single
  // Assistant row with no drill, since the wrapper would just repeat
  // the same numbers.
  const assistantTotal = content.assistantText + content.assistantThinking;
  if (assistantTotal > 0) {
    const assistantChildren: Item[] = [];
    if (content.assistantText > 0) {
      assistantChildren.push({
        id: "assistant:text",
        name: "Text",
        tokens: content.assistantText,
        group: "conversation",
        detail: "model's written response",
      });
    }
    if (content.assistantThinking > 0) {
      assistantChildren.push({
        id: "assistant:thinking",
        name: "Thinking",
        tokens: content.assistantThinking,
        group: "conversation",
        detail: "model's reasoning blocks",
      });
    }
    assistantChildren.sort((a, b) => b.tokens - a.tokens);
    categories.push({
      id: "group:assistant",
      name: "Assistant",
      tokens: assistantTotal,
      group: "conversation",
      detail: "model output this session",
      children:
        assistantChildren.length > 1 ? assistantChildren : undefined,
    });
  }

  const systemChildren: Item[] = [];
  if (systemPromptTokens > 0) {
    systemChildren.push({
      id: "system:base-prompt",
      name: "System prompt",
      tokens: systemPromptTokens,
      group: "system",
      detail: "base pi prompt, excluding AGENTS.md and skills listed below",
      content: baseSystemPrompt,
    });
  }
  systemChildren.push(...agentsChildren);
  if (toolDefinitionItems.length > 0) {
    systemChildren.push({
      id: "system:tool-definitions",
      name: "Tool definitions",
      tokens: sumTokens(toolDefinitionItems),
      group: "tools",
      detail: `${toolDefinitionItems.length} schema${toolDefinitionItems.length === 1 ? "" : "s"} loaded with the prompt`,
      children: toolDefinitionItems,
    });
  }
  if (skillChildren.length > 0) {
    systemChildren.push({
      id: "system:skills",
      name: "Skill definitions",
      tokens: sumTokens(skillChildren),
      group: "skills",
      detail: `${skillChildren.length} skill${skillChildren.length === 1 ? "" : "s"} loaded with the prompt`,
      children: skillChildren,
    });
  }
  if (promptChildren.length > 0) {
    systemChildren.push({
      id: "system:prompts",
      name: "Prompt definitions",
      tokens: sumTokens(promptChildren),
      group: "prompts",
      detail: `${promptChildren.length} prompt${promptChildren.length === 1 ? "" : "s"} loaded with the prompt`,
      children: promptChildren,
    });
  }
  if (extChildren.length > 0) {
    systemChildren.push({
      id: "system:extensions",
      name: "Extension command definitions",
      tokens: sumTokens(extChildren),
      group: "extensions",
      detail: `${extChildren.length} command${extChildren.length === 1 ? "" : "s"} loaded with the prompt`,
      children: extChildren,
    });
  }
  systemChildren.sort((a, b) => b.tokens - a.tokens);
  const systemTotal = sumTokens(systemChildren);
  if (systemTotal > 0) {
    categories.push({
      id: "group:system",
      name: "System",
      tokens: systemTotal,
      group: "system",
      detail: "startup prompt material and cached definitions",
      children: systemChildren,
    });
  }

  // Tools category — only active tool calls/results from this session.
  if (toolItems.length > 0) {
    categories.push({
      id: "group:tools",
      name: "Tools",
      tokens: toolsTotal,
      group: "tools",
      detail: `${toolItems.length} active tool${toolItems.length === 1 ? "" : "s"}`,
      children: toolItems,
    });
  }

  // Keep active session buckets first; System is the catch-all for
  // startup prompt material even when it dominates token count.
  categories.sort((a, b) => {
    if (a.group === "system" && b.group !== "system") return 1;
    if (b.group === "system" && a.group !== "system") return -1;
    return b.tokens - a.tokens;
  });

  const estimated = categories.reduce((s, c) => s + c.tokens, 0);
  const used = Math.max(estimated, sent ?? 0);

  return {
    estimated,
    sent,
    used,
    contextWindow: usage?.contextWindow ?? model?.contextWindow ?? 0,
    modelName: model?.name ?? "unknown",
    categories,
    flow,
    perTurn,
  };
}

// ── Overview tab ─────────────────────────────────────────────────────

class OverviewBody implements Component {
  constructor(
    private readonly mctx: ModalBodyContext,
    private readonly snapshot: Snapshot,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const theme = this.mctx.theme;
    const s = this.snapshot;
    // Modal owns gutters — `width` is the inner content area. No
    // further subtraction needed for our own padding.
    const inner = width;

    const prefs = libPrefs().get().context;
    const pct = fillPercent(
      s.used,
      prefs.fillBasis,
      prefs.usableTokens,
      s.contextWindow,
    );
    const pctToken = usableMarkerColour(
      s.used,
      prefs.usableTokens,
      prefs.tolerancePercent,
      SUCCESS,
    );
    const free = Math.max(0, s.contextWindow - s.used);
    const basisLabel = prefs.fillBasis === "usable" ? "usable" : "window";

    const lines: string[] = [];

    const denom = prefs.fillBasis === "usable" && prefs.usableTokens > 0
      ? prefs.usableTokens
      : s.contextWindow;
    const head =
      `${theme.fg(MUTED, s.modelName)}  ` +
      `${theme.fg(pctToken, pieChar(pct))} ${theme.fg(pctToken, `${pct}%`)}  ` +
      `${theme.fg(TEXT, fmtTokens(s.used))}${theme.fg(MUTED, ` / ${fmtTokens(denom)} ${basisLabel}`)}  ` +
      `${theme.fg(MUTED, "free")} ${theme.fg(TEXT, fmtTokens(free))}` +
      (s.sent === null || s.sent === 0
        ? `  ${theme.fg(DIM, "(est)")}`
        : "");
    lines.push(padVisible(head, width));

    lines.push("");

    const significant = s.categories.filter((c) => c.tokens > 0);
    const usable = libPrefs().get().context.usableTokens;
    const markerCol =
      usable > 0 && usable < s.contextWindow && s.contextWindow > 0
        ? Math.round((usable / s.contextWindow) * inner)
        : null;

    // Attribution bar — top-level cells go to each category in
    // proportion to its share of context, then within each category's
    // cells the children show internal composition with tinted shades
    // of the parent's colour. lib.stack's nested-segments form handles
    // both allocation passes.
    const segments = significant.map((c) => {
      const children = (c.children ?? []).filter((ch) => ch.tokens > 0);
      return {
        value: c.tokens,
        fill: segmentPainter(c.group, theme),
        children: children.length
          ? children.map((ch, i) => ({
              value: ch.tokens,
              fill: segmentPainter(ch.group, theme, i),
            }))
          : undefined,
      };
    });
    const attribLine = stack({
      segments,
      width: inner,
      total: s.contextWindow,
      empty: (t) => theme.fg(DIM, t),
      // Thin dotted vertical at the usable-tokens threshold. Painted in
      // the WARN token to match the `↑ 128k usable` label below the
      // bar, so eye lands on both as one annotation. Replicating the
      // line 3 rows tall produces a 3-cell vertical dotted line.
      marker:
        markerCol !== null
          ? {
              col: markerCol,
              glyph: "┊",
              paint: (t) => theme.fg(WARN, t),
            }
          : undefined,
    });
    // Replicate the same line 3 rows tall — gives the attribution
    // block visual weight without needing distinct per-row data.
    for (let r = 0; r < 3; r++) lines.push(attribLine);

    if (markerCol !== null) {
      const label = `↑ ${fmtTokens(usable)} usable`;
      const lead = " ".repeat(Math.max(0, markerCol));
      lines.push(padVisible(`${lead}${theme.fg(WARN, label)}`, width));
    }

    lines.push("");

    for (const c of significant) {
      const share =
        s.contextWindow === 0
          ? 0
          : Math.round((c.tokens / s.contextWindow) * 1000) / 10;
      const row =
        `${paintSegment(c.group, "●", theme)}  ` +
        `${theme.fg(TEXT, padVisible(truncate(c.name, 28), 28))}  ` +
        `${theme.fg(TITLE, padVisible(fmtTokens(c.tokens), 7))}  ` +
        `${theme.fg(MUTED, `${share}%`)}`;
      lines.push(padVisible(row, width));
    }
    if (significant.length === 0) {
      lines.push(theme.fg(DIM, "(no measured load yet)"));
    }

    return lines;
  }
}

// ── Breakdown tab ────────────────────────────────────────────────────

class BreakdownBody implements Component {
  private stack: string[] = [];
  private selected = new Map<string, number>();
  private scrollByView = new Map<string, number>();
  private vizMode: VizMode = "linear";
  // Content drill state. `full` shows the entire content (scrollable);
  // `null` means we're in the list view (where the selected content-
  // leaf already shows a 2-line inline preview directly under its row).
  private contentDrill: "full" | null = null;
  private contentItem: Item | undefined;

  constructor(
    private readonly mctx: ModalBodyContext,
    private readonly snapshot: Snapshot,
  ) {}

  cycleViz(): void {
    this.vizMode = this.vizMode === "linear" ? "log" : "linear";
    this.mctx.requestRender();
  }

  getVizMode(): VizMode {
    return this.vizMode;
  }

  invalidate(): void {}

  atTop(): boolean {
    return this.stack.length === 0 && this.contentDrill === null;
  }

  /** Drill state queries — used by breakdownKeys to swap the
   *  "drill in / view full / back" shortcut descriptions. */
  inContentFull(): boolean {
    return this.contentDrill === "full";
  }
  inContent(): boolean {
    return this.contentDrill !== null;
  }

  /**
   * The item the caret is on, or undefined when the list is empty.
   * Exposed so breakdownKeys can decide between "drill in" (has
   * children), "preview" (has content), or nothing.
   */
  currentItem(): Item | undefined {
    return this.currentItems()[this.currentSelected()];
  }

  /**
   * Walk the stack from the root categories down to the current
   * subtree. Each frame on the stack is an item id; we descend into
   * `children` of the matching item at each level. Bail with an empty
   * list if any frame fails to resolve (defensive — snapshot mismatches
   * after a manual edit shouldn't crash the modal).
   */
  currentItems(): readonly Item[] {
    let items: readonly Item[] = this.snapshot.categories;
    for (const id of this.stack) {
      const found = items.find((i) => i.id === id);
      if (!found || !found.children) return [];
      items = found.children;
    }
    return items;
  }

  currentSelected(): number {
    const items = this.currentItems();
    if (items.length === 0) return 0;
    const stored = this.selected.get(this.viewKey()) ?? 0;
    return Math.max(0, Math.min(stored, items.length - 1));
  }

  moveSelection(delta: number): void {
    // In content view, j/k scrolls the body. Otherwise it moves the
    // list cursor.
    if (this.contentDrill !== null) {
      this.mctx.scrollBy(delta);
      return;
    }
    const items = this.currentItems();
    if (items.length === 0) return;
    const cur = this.currentSelected();
    const next = (cur + delta + items.length) % items.length;
    this.selected.set(this.viewKey(), next);
    this.ensureVisible(next);
  }

  drillIn(): void {
    if (this.contentDrill === "full") return; // already at max depth

    const item = this.currentItems()[this.currentSelected()];
    if (!item) return;

    if (item.children && item.children.length > 0) {
      // Normal subtree drill.
      this.scrollByView.set(this.viewKey(), this.mctx.getScrollOffset());
      this.stack.push(item.id);
      this.mctx.scrollTo(this.scrollByView.get(this.viewKey()) ?? 0);
      return;
    }

    // Leaf with content → straight to full view. The 2-line preview
    // under the selected row in the list view already serves as the
    // "preview" step, so there's no intermediate state to enter.
    if (item.content) {
      this.contentItem = item;
      this.contentDrill = "full";
      this.scrollByView.set(this.viewKey(), this.mctx.getScrollOffset());
      this.mctx.scrollTo(0);
      this.mctx.requestRender();
    }
  }

  pop(): boolean {
    if (this.contentDrill === "full") {
      this.contentDrill = null;
      this.contentItem = undefined;
      this.mctx.scrollTo(this.scrollByView.get(this.viewKey()) ?? 0);
      this.mctx.requestRender();
      return true;
    }
    if (this.stack.length === 0) return false;
    this.scrollByView.set(this.viewKey(), this.mctx.getScrollOffset());
    this.stack.pop();
    this.mctx.scrollTo(this.scrollByView.get(this.viewKey()) ?? 0);
    return true;
  }

  render(width: number): string[] {
    if (this.contentDrill !== null && this.contentItem) {
      return this.renderContent(width, this.contentItem, this.contentDrill);
    }

    const theme = this.mctx.theme;
    const items = this.currentItems();

    const lines: string[] = [];

    // Modal owns the gutter — body emits content for the inner area
    // (`width` here IS the inner area). No leading "  " on lines.
    const crumbParts = ["top"];
    for (const id of this.stack) {
      crumbParts.push(this.findItem(id)?.name ?? id);
    }
    const sep = theme.fg(MUTED, " › ");
    const crumb = crumbParts
      .map((part, i) =>
        i === crumbParts.length - 1
          ? theme.fg(TEXT, part)
          : theme.fg(MUTED, part),
      )
      .join(sep);
    lines.push(padVisible(crumb, width));
    lines.push("");

    if (items.length === 0) {
      lines.push(padVisible(theme.fg(DIM, "(nothing here)"), width));
      return lines;
    }

    // Scale annotation — same wording + separator as Flow so the two
    // tabs read consistently.
    lines.push(
      padVisible(theme.fg(DIM, `volume · ${this.vizMode} scale`), width),
    );

    const maxTokens = Math.max(...items.map((i) => i.tokens), 1);
    const scale = scaleFn(this.vizMode, maxTokens);
    const nameWidth = Math.min(
      40,
      Math.max(...items.map((i) => visibleWidth(i.name))),
    );
    const tokensCol = 7;
    const pctCol = 6;
    const drillCol = 1;
    // Row layout (visible cells):
    // cursor(1) + " "(1) + name(nameWidth) + "  "(2) + bar(barWidth)
    //   + "  "(2) + drill(1) + "  "(2) + tokens(7) + "  "(2) + pct(6)
    // Constants total: 1+1+2+2+2+2 = 10, plus drill(1) = 11.
    const barWidth = Math.max(
      8,
      width - nameWidth - tokensCol - pctCol - drillCol - 11,
    );
    const window = this.snapshot.contextWindow;
    const cursorIdx = this.currentSelected();
    const tintIdx = (i: number) => (this.atTop() ? 0 : i);

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const isSelected = i === cursorIdx;
      lines.push(
        this.renderRow(item, isSelected, {
          width,
          nameWidth,
          barWidth,
          maxTokens,
          tintIdx: tintIdx(i),
          stack: this.atTop(),
          scale,
          window,
        }),
      );
    }
    return lines;
  }

  private renderRow(
    item: Item,
    selected: boolean,
    g: {
      width: number;
      nameWidth: number;
      barWidth: number;
      maxTokens: number;
      tintIdx: number;
      stack: boolean;
      scale: (v: number) => number;
      window: number;
    },
  ): string {
    const theme = this.mctx.theme;
    const cursor = selected ? theme.fg(ACCENT, "›") : " ";
    const name = padVisible(truncate(item.name, g.nameWidth), g.nameWidth);
    const tokens = padVisible(fmtTokens(item.tokens), 7);
    // Percent = share of context window. Matches the denominator used
    // by Overview's legend, so the numbers in both tabs read the same.
    const sharePct =
      g.window <= 0 ? 0 : Math.round((item.tokens / g.window) * 1000) / 10;
    const pct = padVisible(`${sharePct}%`, 6);
    // `→` marks anything drillable — either a subtree (children) or a
    // leaf carrying raw content (drillable into preview/full views).
    const drillable =
      this.categoryHasChildren(item.id) || Boolean(item.content);
    const drilly = drillable ? theme.fg(DIM, "→") : " ";
    // Bar — either a plain bar in the row's own group colour (drill-in
    // depth), or stacked into per-child segments inside the row's
    // filled portion (top-level rows, so the user can see internal
    // composition without expanding). Both paths route through lib.
    let barCell: string;
    if (g.stack) {
      const children = item.children ?? [];
      const childTotal = children.reduce((s, c) => s + c.tokens, 0);
      const filled = Math.max(
        0,
        Math.min(g.barWidth, Math.round(g.scale(item.tokens) * g.barWidth)),
      );
      if (children.length === 0 || filled === 0 || childTotal === 0) {
        barCell = hbar({
          value: item.tokens,
          max: g.maxTokens,
          width: g.barWidth,
          mode: this.vizMode,
          fill: segmentPainter(item.group, theme),
          empty: (t) => theme.fg(DIM, t),
        });
      } else {
        const segments = children
          .filter((c) => c.tokens > 0)
          .map((c, i) => ({
            value: c.tokens,
            fill: segmentPainter(c.group, theme, i),
          }));
        // Scale the visible filled portion through scaleFn so the
        // top-level row respects the same linear/log treatment as
        // its children would inside a drill.
        const scaledFilled = filled;
        barCell = stack({
          segments,
          width: g.barWidth,
          // The "filled" length is `scaledFilled` cells out of barWidth;
          // emulate that with total = sumSegs * barWidth / scaledFilled.
          total: scaledFilled > 0
            ? (children.reduce((s, c) => s + c.tokens, 0) * g.barWidth) / scaledFilled
            : 0,
          empty: (t) => theme.fg(DIM, t),
        });
      }
    } else {
      barCell = hbar({
        value: item.tokens,
        max: g.maxTokens,
        width: g.barWidth,
        mode: this.vizMode,
        fill: segmentPainter(item.group, theme, g.tintIdx),
        empty: (t) => theme.fg(DIM, t),
      });
    }
    // Drill arrow sits right after the bar (end of the graph). Token
    // and percent columns at the far right mirror Overview's legend so
    // the eye can scan numeric values down the same column position
    // when switching tabs.
    const content =
      `${cursor} ${theme.fg(TEXT, name)}  ${barCell}  ${drilly}  ` +
      `${theme.fg(TITLE, tokens)}  ${theme.fg(MUTED, pct)}`;
    if (selected) {
      return theme.bg(SELECTED_BG, padVisible(content, g.width));
    }
    return padVisible(content, g.width);
  }

  private viewKey(): string {
    return this.stack.length === 0 ? "_top" : this.stack.join("/");
  }

  /**
   * Render a leaf's raw content in full (scrollable via Modal). The
   * inline 2-line preview under the selected row in the list view
   * serves as the "preview" step, so this view goes straight to the
   * complete content. Long lines are soft-wrapped to fit the body
   * width so the content reads without horizontal scroll.
   */
  private renderContent(
    width: number,
    item: Item,
    _mode: "full",
  ): string[] {
    const theme = this.mctx.theme;
    const lines: string[] = [];

    const crumbParts = ["top"];
    for (const id of this.stack) crumbParts.push(this.findItem(id)?.name ?? id);
    crumbParts.push(item.name);
    const sep = theme.fg(MUTED, " › ");
    const crumb = crumbParts
      .map((part, i) =>
        i === crumbParts.length - 1
          ? theme.fg(TEXT, part)
          : theme.fg(MUTED, part),
      )
      .join(sep);
    lines.push(padVisible(crumb, width));

    const meta =
      `${theme.fg(MUTED, "tokens")} ${theme.fg(TEXT, fmtTokens(item.tokens))}  ` +
      `${theme.fg(MUTED, "chars")} ${theme.fg(TEXT, fmtTokens((item.content ?? "").length))}`;
    lines.push(padVisible(meta, width));
    lines.push("");

    const wrapped = wrapText(item.content ?? "", width);
    for (const line of wrapped) {
      lines.push(padVisible(line, width));
    }
    return lines;
  }

  /**
   * Resolve an item id by walking the snapshot tree. Lazy: descends
   * into children breadth-first only until the id is found.
   */
  private findItem(id: string): Item | undefined {
    const walk = (items: readonly Item[]): Item | undefined => {
      for (const it of items) {
        if (it.id === id) return it;
        if (it.children) {
          const found = walk(it.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    return walk(this.snapshot.categories);
  }

  private categoryHasChildren(id: string): boolean {
    const c = this.findItem(id);
    return !!c?.children && c.children.length > 0;
  }

  private ensureVisible(row: number): void {
    const top = this.mctx.getScrollOffset();
    const max = this.mctx.getMaxBodyRows();
    // Breadcrumb + rule + blank live at rows 0–2; rows[i] is at body-line i + 3.
    const lead = 3;
    const target = row + lead;
    if (target < top) this.mctx.scrollTo(target);
    else if (target >= top + max) this.mctx.scrollTo(target - max + 1);
    this.mctx.requestRender();
  }
}

function breakdownKeys(body: BreakdownBody): readonly ModalKey[] {
  const DOWN = ["j", "\x1b[B"];
  const UP = ["k", "\x1b[A"];
  const RIGHT = ["l", "\x1b[C", "\r", "\n"];
  const LEFT = ["h", "\x1b[D"];
  return [
    {
      key: "j/k",
      desc: () => (body.inContent() ? "scroll" : "select"),
      match: (d) => DOWN.includes(d) || UP.includes(d),
      action: (_mctx, data) => {
        body.moveSelection(DOWN.includes(data) ? 1 : -1);
      },
    },
    {
      key: "l/→",
      // Reflects what `l/→` will *do* from this state. Empty desc when
      // there's nothing further to drill into, so the modal hides the
      // hint instead of advertising a dead key.
      desc: () => {
        if (body.inContentFull()) return "";
        const item = body.currentItem();
        if (!item) return "";
        if (item.children && item.children.length > 0) return "drill in";
        if (item.content) return "view full";
        return "";
      },
      match: (d) => RIGHT.includes(d),
      action: () => {
        body.drillIn();
      },
    },
    {
      key: "h/←",
      desc: () => (body.atTop() ? "" : "back"),
      match: (d) => LEFT.includes(d),
      action: () => {
        body.pop();
      },
    },
    {
      key: "v",
      // The viz toggle only affects the list view's bar scale, so hide
      // the hint while reading content.
      desc: () => (body.inContent() ? "" : "viz"),
      match: (d) => d === "v",
      action: () => {
        if (!body.inContent()) body.cycleViz();
      },
    },
  ];
}

// ── Flow tab ────────────────────────────────────────────────────────
//
// Single timeline of four single-row sparklines (input ↑, output ↓,
// cache read R, cache write W) sharing a common turn axis. A cursor
// (h/l, ←/→) moves left/right across turns; the cursor column gets a
// SELECTED_BG spotlight across every sparkline and a `│` marker
// above. Below the timeline is a per-turn detail panel showing the
// cursor turn's stats in Breakdown-style hbar rows.

/** Painter helper — Flow charts route their fill through paintFlow
 *  so omarchy's per-channel hex (if published) wins over the pi
 *  theme-token fallback. */
function flowPainter(channel: FlowChannel, theme: MenuTheme): Painter {
  return (text) => paintFlow(channel, text, theme);
}

type FlowLane = {
  channel: FlowChannel;
  glyph: string;
  label: string;
  values: number[];
};

/**
 * Flow tab — single timeline of all four channels (input ↑, output ↓,
 * cache read R, cache write W) as one-row sparklines stacked over a
 * shared turn axis. A cursor moves left/right across turns; the cell
 * at the cursor column gets a `SELECTED_BG` spotlight inside each
 * sparkline and a `│` marker above. Below the sparkline block sits a
 * per-turn breakdown panel — bars showing where the cursor turn's
 * input/output bytes came from and what happened to the cache that
 * turn. No drill-in; the bottom panel is always live for the cursor
 * turn.
 */
class FlowBody implements Component {
  private vizMode: VizMode = "linear";
  private cursorTurn = 0;

  constructor(
    private readonly mctx: ModalBodyContext,
    private readonly snapshot: Snapshot,
  ) {
    // Land the cursor on the most recent turn — usually what the user
    // wants when they open Flow mid-session.
    this.cursorTurn = Math.max(0, snapshot.perTurn.length - 1);
  }

  invalidate(): void {}

  cycleViz(): void {
    this.vizMode = this.vizMode === "linear" ? "log" : "linear";
    this.mctx.requestRender();
  }

  getVizMode(): VizMode {
    return this.vizMode;
  }

  moveCursor(delta: number): void {
    const n = this.snapshot.perTurn.length;
    if (n === 0) return;
    this.cursorTurn = (this.cursorTurn + delta + n) % n;
    this.mctx.requestRender();
  }

  cursorTo(turn: number): void {
    const n = this.snapshot.perTurn.length;
    if (n === 0) return;
    this.cursorTurn = Math.max(0, Math.min(turn, n - 1));
    this.mctx.requestRender();
  }

  getCursorTurn(): number {
    return this.cursorTurn;
  }

  getTurnCount(): number {
    return this.snapshot.perTurn.length;
  }

  /**
   * Compaction turn-indices, derived from the prompt-size series
   * (input + cacheRead). Same data drives the marker-row glyphs
   * and the head-line summary count.
   */
  private compactionTurns(): Set<number> {
    const turns = this.snapshot.perTurn;
    const prompt = turns.map((t) => t.input + t.cacheRead);
    const RATIO = 0.4;
    const MIN_PREV = 5000;
    const out = new Set<number>();
    for (let i = 1; i < prompt.length; i++) {
      const prev = prompt[i - 1]!;
      const cur = prompt[i]!;
      if (prev >= MIN_PREV && cur < prev * (1 - RATIO)) out.add(i);
    }
    return out;
  }

  /** Lanes — one per channel, dropping any that have no signal. */
  private lanes(): FlowLane[] {
    const turns = this.snapshot.perTurn;
    const all: FlowLane[] = [
      { channel: "flowInput", glyph: "↑", label: "input", values: turns.map((t) => t.input) },
      { channel: "flowOutput", glyph: "↓", label: "output", values: turns.map((t) => t.output) },
      { channel: "flowCacheRead", glyph: "R", label: "cache read", values: turns.map((t) => t.cacheRead) },
      { channel: "flowCacheWrite", glyph: "W", label: "cache write", values: turns.map((t) => t.cacheWrite) },
    ];
    return all.filter((l) => l.values.some((v) => v > 0));
  }

  render(width: number): string[] {
    const turns = this.snapshot.perTurn;
    if (turns.length === 0) {
      return [
        padVisible(this.mctx.theme.fg(DIM, "no turns this session"), width),
      ];
    }
    if (this.cursorTurn >= turns.length) this.cursorTurn = turns.length - 1;

    const lanes = this.lanes();
    if (lanes.length === 0) {
      return [
        padVisible(this.mctx.theme.fg(DIM, "no usage data"), width),
      ];
    }

    const lines: string[] = [];
    lines.push(...this.renderTimeline(width, lanes));
    lines.push("");
    lines.push(this.mctx.theme.fg(DIM, "─".repeat(width)));
    lines.push(...this.renderTurnPanel(width));
    return lines;
  }

  /**
   * Timeline section — head line, cursor + compaction marker row,
   * then a 2-row column chart per channel. Charts stack with no blank
   * between them so they read as one cohesive timeline; label and
   * trailing stats sit on the chart's bottom row so the bar tops have
   * room to grow. The cursor column gets a `SELECTED_BG` spotlight
   * across every chart row so the eye locks onto the same turn across
   * all four lanes.
   */
  private renderTimeline(width: number, lanes: readonly FlowLane[]): string[] {
    const theme = this.mctx.theme;
    const turns = this.snapshot.perTurn;
    const lines: string[] = [];

    const LANE_HEIGHT = 2;

    // Layout: label column + gap + chart + gap + trailing.
    const labelW = Math.max(
      ...lanes.map((l) => visibleWidth(`${l.glyph} ${l.label}`)),
    );
    const trailingFor = (l: FlowLane): string => {
      const max = Math.max(...l.values, 0);
      const total = l.values.reduce((s, v) => s + v, 0);
      return `max ${fmtTokens(max)}  Σ ${fmtTokens(total)}`;
    };
    const trailingW = Math.max(...lanes.map((l) => trailingFor(l).length));
    const GAP = 2;
    const sparkW = Math.max(8, width - labelW - trailingW - GAP * 2);

    const cursorCol = turnToColumn(this.cursorTurn, turns.length, sparkW);
    const cursorSpan = turnSpan(this.cursorTurn, turns.length, sparkW);
    const compactions = this.compactionTurns();

    // Chain starts — turns triggered by a fresh user message. Each
    // chain is one user prompt + however many model calls that
    // prompt cascaded into (tool calls → results → more model calls).
    // A 25-turn session can be just a handful of chains; marking
    // where each chain begins lets the eye group related turns.
    const chainStarts: number[] = [];
    turns.forEach((t, i) => {
      if (t.inputUserMsg > 0) chainStarts.push(i);
    });

    // Head — turn count + viz mode + cursor position. Chain count
    // and compaction summary live on the same line so the user
    // can read "where am I, what scale, how many chains, how many
    // compactions" in one glance.
    const head =
      `${theme.fg(MUTED, `${turns.length} turn${turns.length === 1 ? "" : "s"}`)}  ` +
      `${theme.fg(DIM, `${this.vizMode} scale`)}  ` +
      `${theme.fg(ACCENT, `turn ${this.cursorTurn + 1}`)}` +
      (chainStarts.length > 1
        ? `  ${theme.fg(MUTED, `┊ ${chainStarts.length} chains`)}`
        : "") +
      (compactions.size > 0
        ? `  ${theme.fg(WARN, `↓ ${compactions.size} compaction${compactions.size === 1 ? "" : "s"}`)}`
        : "");
    lines.push(padVisible(head, width));
    lines.push("");

    // Marker row above the charts. Carries chain-start `┊` glyphs
    // (subtle, in MUTED) and compaction `↓` glyphs (loud, in WARN).
    // Only rendered when there's at least one of either — single-
    // chain no-compaction sessions skip the row and gain the breath
    // back as chart space.
    const showChainMarkers = chainStarts.length > 1;
    if (showChainMarkers || compactions.size > 0) {
      const marks: Mark[] = [];
      if (showChainMarkers) {
        for (const t of chainStarts) {
          marks.push({
            col: turnToColumn(t, turns.length, sparkW),
            glyph: "┊",
            paint: (s) => theme.fg(MUTED, s),
          });
        }
      }
      // Compactions appended after chains so they win at any shared
      // column — a compaction at a chain start is the louder signal.
      for (const t of compactions) {
        marks.push({
          col: turnToColumn(t, turns.length, sparkW),
          glyph: "↓",
          paint: (s) => theme.fg(WARN, s),
        });
      }
      const markerLead = " ".repeat(labelW + GAP);
      lines.push(markerLead + markerRow(marks, sparkW));
    }

    // Per-channel chart rows. Highlight spans the FULL set of columns
    // the cursor turn occupies, so when turns < chart width each turn
    // bar lights up across all its cells (a 3-cell-wide turn shows a
    // 3-cell highlight, not a 1-cell sliver).
    const highlight = {
      col: cursorCol,
      span: cursorSpan,
      paint: (t: string) => theme.bg(SELECTED_BG, t),
    };
    const labelPadEmpty = " ".repeat(labelW);
    const trailingPadEmpty = " ".repeat(trailingW);
    for (const lane of lanes) {
      const max = Math.max(...lane.values, 0);
      const chartRows = columns({
        values: lane.values,
        width: sparkW,
        height: LANE_HEIGHT,
        max,
        mode: this.vizMode,
        fill: flowPainter(lane.channel, theme),
        highlight,
      });
      const labelStr = `${paintFlow(lane.channel, lane.glyph, theme)} ${theme.fg(TEXT, lane.label)}`;
      const labelPad = padVisible(labelStr, labelW);
      const trailing = theme.fg(MUTED, trailingFor(lane));
      // Label/trailing on the chart's BOTTOM row (baseline) so the
      // bar tops have empty space above to grow into.
      for (let r = 0; r < chartRows.length; r++) {
        const isLast = r === chartRows.length - 1;
        const prefix = isLast ? labelPad : labelPadEmpty;
        const suffix = isLast ? trailing : trailingPadEmpty;
        lines.push(
          `${prefix}${" ".repeat(GAP)}${chartRows[r]!}${" ".repeat(GAP)}${suffix}`,
        );
      }
    }

    return lines;
  }

  /**
   * Per-turn detail — concise text-only stats for the cursor turn.
   * Four lines: a summary headline, then one line each for input
   * source split, output composition + tools fired, and cache
   * read/write. No bars — the timeline above does the visual work,
   * this just spells out the numbers for the highlighted turn.
   */
  private renderTurnPanel(width: number): string[] {
    const theme = this.mctx.theme;
    const turns = this.snapshot.perTurn;
    const t = turns[this.cursorTurn];
    if (!t) return [];

    const promptSize = t.input + t.cacheRead;
    const hitDenom = t.cacheRead + t.input;
    const hit = hitDenom > 0 ? Math.round((t.cacheRead / hitDenom) * 100) : 0;
    const isCompaction = this.compactionTurns().has(this.cursorTurn);

    // Chain index for the cursor turn — how many `inputUserMsg > 0`
    // turns occur up to and including this one. "Chain 4 of 7" tells
    // the user where this turn sits within the larger conversation
    // structure (one user prompt → one chain of model calls).
    let chainIdx = 0;
    let chainCount = 0;
    let chainStartTurn = 0;
    turns.forEach((tt, i) => {
      if (tt.inputUserMsg > 0) {
        chainCount += 1;
        if (i <= this.cursorTurn) {
          chainIdx = chainCount;
          chainStartTurn = i;
        }
      }
    });
    const chainOffset = this.cursorTurn - chainStartTurn + 1; // 1-based within chain
    const chainSize = (() => {
      // Count how many turns this chain covers — from its start
      // (chainStartTurn) through the turn before the next chain start.
      let end = turns.length;
      for (let i = chainStartTurn + 1; i < turns.length; i++) {
        if (turns[i]!.inputUserMsg > 0) {
          end = i;
          break;
        }
      }
      return end - chainStartTurn;
    })();

    const dot = ` ${theme.fg(DIM, "·")} `;
    const lines: string[] = [];
    lines.push("");

    // Summary headline — prompt size, cache split, hit %, chain
    // position. Chain annotation appears only when there's more than
    // one chain in the session; single-chain sessions don't need it.
    const summary =
      `${theme.fg(TEXT, `turn ${this.cursorTurn + 1}`)}${dot}` +
      (chainCount > 1
        ? `${theme.fg(MUTED, `chain ${chainIdx}/${chainCount}`)} ${theme.fg(DIM, `(${chainOffset}/${chainSize})`)}${dot}`
        : "") +
      `${theme.fg(MUTED, "prompt")} ${theme.fg(TEXT, fmtTokens(promptSize))}${dot}` +
      `${paintFlow("flowInput", "↑", theme)} ${theme.fg(TEXT, fmtTokens(t.input))}${dot}` +
      `${paintFlow("flowCacheRead", "R", theme)} ${theme.fg(TEXT, fmtTokens(t.cacheRead))}${dot}` +
      `${theme.fg(MUTED, `${hit}% hit`)}` +
      (isCompaction ? `${dot}${theme.fg(WARN, "↓ compaction")}` : "");
    lines.push(padVisible(summary, width));

    // Input — fresh bytes, broken down by source.
    const inputParts: string[] = [];
    if (t.inputUserMsg > 0)
      inputParts.push(
        `${theme.fg(MUTED, "user")} ${theme.fg(TEXT, fmtTokens(t.inputUserMsg))}`,
      );
    if (t.inputToolResults > 0)
      inputParts.push(
        `${theme.fg(MUTED, "tool result")} ${theme.fg(TEXT, fmtTokens(t.inputToolResults))}`,
      );
    const inputGap = t.input - (t.inputUserMsg + t.inputToolResults);
    if (inputGap > 1000)
      inputParts.push(
        theme.fg(DIM, `+${fmtTokens(inputGap)} unattributed`),
      );
    if (t.input > 0) {
      const inputLine =
        `${paintFlow("flowInput", "↑", theme)} ${theme.fg(TEXT, "input")} ${theme.fg(TITLE, fmtTokens(t.input))}` +
        (inputParts.length > 0 ? `   ${inputParts.join(dot)}` : "");
      lines.push(padVisible(inputLine, width));
    }

    // Output — generated bytes, broken down by block type. Tool
    // names trail the line so you can see which tools fired this turn
    // without a separate row.
    if (t.output > 0) {
      const outParts: string[] = [];
      if (t.outputText > 0)
        outParts.push(
          `${theme.fg(MUTED, "text")} ${theme.fg(TEXT, fmtTokens(t.outputText))}`,
        );
      if (t.outputThinking > 0)
        outParts.push(
          `${theme.fg(MUTED, "thinking")} ${theme.fg(TEXT, fmtTokens(t.outputThinking))}`,
        );
      if (t.outputToolCalls > 0)
        outParts.push(
          `${theme.fg(MUTED, "tools")} ${theme.fg(TEXT, fmtTokens(t.outputToolCalls))}`,
        );
      const tools =
        t.toolsCalled.size > 0
          ? [...t.toolsCalled.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, n]) => (n === 1 ? name : `${name}(${n})`))
              .join(", ")
          : "";
      const outLine =
        `${paintFlow("flowOutput", "↓", theme)} ${theme.fg(TEXT, "output")} ${theme.fg(TITLE, fmtTokens(t.output))}` +
        (outParts.length > 0 ? `   ${outParts.join(dot)}` : "") +
        (tools ? `   ${theme.fg(DIM, `[${tools}]`)}` : "");
      lines.push(padVisible(outLine, width));
    }

    // Cache — read + write on one line.
    const cacheLine =
      `${paintFlow("flowCacheRead", "R", theme)} ${theme.fg(TEXT, "cache")} ${theme.fg(TITLE, fmtTokens(t.cacheRead))}${dot}` +
      `${paintFlow("flowCacheWrite", "W", theme)} ${theme.fg(TITLE, fmtTokens(t.cacheWrite))}`;
    lines.push(padVisible(cacheLine, width));

    return lines;
  }
}

function flowKeys(body: FlowBody): readonly ModalKey[] {
  const RIGHT = ["l", "\x1b[C"];
  const LEFT = ["h", "\x1b[D"];
  const HOME = ["g", "\x1b[H"];
  const END = ["G", "\x1b[F"];
  return [
    {
      key: "h/l",
      desc: () => {
        const n = body.getTurnCount();
        return n > 0 ? `turn (${body.getCursorTurn() + 1}/${n})` : "";
      },
      match: (d) => RIGHT.includes(d) || LEFT.includes(d),
      action: (_mctx, data) => {
        body.moveCursor(RIGHT.includes(data) ? 1 : -1);
      },
    },
    {
      key: "g/G",
      desc: "first/last",
      match: (d) => HOME.includes(d) || END.includes(d),
      action: (_mctx, data) => {
        if (HOME.includes(data)) body.cursorTo(0);
        else body.cursorTo(body.getTurnCount() - 1);
      },
    },
    {
      key: "v",
      desc: "viz",
      match: (d) => d === "v",
      action: () => {
        body.cycleViz();
      },
    },
  ];
}

// ── Wiring ───────────────────────────────────────────────────────────

export default function context(pi: ExtensionAPI) {
  pi.registerCommand("context", {
    description:
      "Show this session's context usage and token flow — overview, drill-in, and per-turn flow.",
    handler: async (_args, ctx) => {
      const perTurn = perTurnFromSession(ctx);
      const snapshot = collectSnapshot(pi, ctx, flowFromPerTurn(perTurn), perTurn);
      await openModal(ctx, (mctx) => {
        const overview = new OverviewBody(mctx, snapshot);
        const breakdown = new BreakdownBody(mctx, snapshot);
        const flow = new FlowBody(mctx, snapshot);

        // Flow's bindings are state-dependent (chart-list vs drill-in
        // navigation), so feed in function form — Tabs re-evaluates on
        // every paint/dispatch.
        const flowBindings = flowKeys(flow);
        const tabs = new Tabs(
          [
            { label: "Overview", body: overview },
            { label: "Breakdown", body: breakdown, keys: breakdownKeys(breakdown) },
            { label: "Flow", body: flow, keys: () => flowBindings },
          ],
          mctx,
        );

        const closeKey: ModalKey = {
          key: "esc",
          desc: () =>
            tabs.getActiveIndex() === 1 && !breakdown.atTop()
              ? "back"
              : "close",
          match: (d) => d === "\x1b",
          action: () => {
            if (tabs.getActiveIndex() === 1 && breakdown.pop()) return;
            return "close";
          },
        };

        return {
          title: "Context",
          body: tabs,
          keys: () => [
            ...tabs.getActiveKeys(),
            ...tabsNavKeys(tabs),
            closeKey,
          ],
        };
      });
    },
  });
}
