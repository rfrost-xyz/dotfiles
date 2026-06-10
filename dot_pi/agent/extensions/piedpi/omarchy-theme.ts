/**
 * Syncs pi's TUI theme with the current Omarchy theme.
 *
 * Reads ~/.config/omarchy/current/theme/colors.toml, derives a pi theme,
 * writes ~/.pi/agent/themes/omarchy.json, and switches pi to it.
 * Watches theme.name and reapplies on `omarchy theme set <name>`.
 */

import { promises as fs, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { paintHex } from "./lib/colour.ts";
import { Config } from "./lib/config.ts";
import { openConfigMenu } from "./lib/config-menu.ts";
import { type CycleRow, type MenuTheme } from "./lib/cycle-menu.ts";

const OMARCHY_DIR = join(homedir(), ".config", "omarchy", "current");
const COLORS_FILE = join(OMARCHY_DIR, "theme", "colors.toml");
const NAME_FILE = join(OMARCHY_DIR, "theme.name");
const THEMES_DIR = join(homedir(), ".pi", "agent", "themes");
const THEME_OUT = join(THEMES_DIR, "omarchy.json");
const CONFIG_DIR = join(homedir(), ".pi", "agent", "config");
const CONFIG_FILE = join(CONFIG_DIR, "omarchy-theme.json");
const THEME_NAME = "omarchy";

// Palette var names exposed in the generated theme. Plus the special value
// "default" which resolves to "" (terminal default color).
const PALETTE_VARS = [
	"default",
	"accent",
	"fg",
	"bg",
	"dim",
	"muted",
	"red",
	"green",
	"yellow",
	"blue",
	"magenta",
	"cyan",
	"brightRed",
	"brightGreen",
	"brightYellow",
	"brightBlue",
	"brightMagenta",
	"brightCyan",
	"brightWhite",
] as const;
type PaletteVar = (typeof PALETTE_VARS)[number];

// Categories the user can configure via /omarchy-theme settings. Each maps to
// one or more pi theme tokens. Tokens not listed here use a fixed default
// derived from the omarchy palette (see buildTheme).
type Category = {
	name: string;
	description: string;
	tokens: readonly string[];
	default: PaletteVar;
};

const CATEGORIES: readonly Category[] = [
	{
		name: "userMessage",
		description: "Your message bubbles in chat history",
		tokens: ["userMessageText"],
		default: "default",
	},
	{
		// Drives pi's `dim` token. Reused beyond the statusline: markdown rules,
		// syntax comments, code-block borders, menu separators and the filter
		// prompt all follow this colour.
		name: "statusline",
		description: "Statusline text + pi's dim token (md rules, comments…)",
		tokens: ["dim"],
		default: "dim",
	},
	{
		// Drives pi's `muted` token. Affects menu shortcut descriptions
		// (e.g. `j/k row · h/l cycle value`), pi's thinkingText, markdown
		// quotes, and syntax punctuation.
		name: "menu desc",
		description: "Menu shortcut descriptions + pi's muted token",
		tokens: ["muted"],
		default: "muted",
	},
	{
		// Drives pi's `customMessageLabel` token. Affects menu titles (bold)
		// and pi's custom-message labels.
		name: "menu title",
		description: "Menu titles + pi custom-message labels",
		tokens: ["customMessageLabel"],
		default: "accent",
	},
	{
		// Drives pi's `customMessageText` token. Affects menu shortcut keys
		// (the "j/k", "enter", etc. cells) and pi's custom-message body text.
		name: "menu keymaps",
		description: "Menu shortcut keys + pi custom-message body text",
		tokens: ["customMessageText"],
		default: "default",
	},
	// ── Tool calls ───────────────────────────────────────────────────────────
	{
		name: "tool title",
		description: "Tool call titles (e.g. Bash, Read, Edit headers)",
		tokens: ["toolTitle"],
		default: "accent",
	},
	{
		name: "tool output",
		description: "Tool call body text (stdout / file contents / etc.)",
		tokens: ["toolOutput"],
		default: "default",
	},
	{
		name: "diff added",
		description: "Diff additions in tool output (e.g. Edit, Write)",
		tokens: ["toolDiffAdded"],
		default: "green",
	},
	{
		name: "diff removed",
		description: "Diff deletions in tool output",
		tokens: ["toolDiffRemoved"],
		default: "red",
	},
	{
		name: "diff context",
		description: "Unchanged context lines in diffs",
		tokens: ["toolDiffContext"],
		default: "dim",
	},
	// ── Agent message markdown ───────────────────────────────────────────────
	// The plain paragraph text in agent replies is rendered with terminal
	// default fg (no pi token), so there's no CATEGORY for it — change
	// omarchy's `fg` palette colour if you need that.
	{
		name: "agent heading",
		description: "Markdown headings in agent replies",
		tokens: ["mdHeading"],
		default: "accent",
	},
	{
		name: "agent code",
		description: "Inline `code` in agent replies",
		tokens: ["mdCode"],
		default: "accent",
	},
	{
		name: "agent code block",
		description: "Fenced code block body in agent replies",
		tokens: ["mdCodeBlock"],
		default: "default",
	},
	{
		name: "agent quote",
		description: "Markdown blockquotes in agent replies",
		tokens: ["mdQuote"],
		default: "muted",
	},
	{
		name: "agent link",
		description: "Markdown links (and URLs) in agent replies",
		tokens: ["mdLink", "mdLinkUrl"],
		default: "accent",
	},
	{
		name: "agent thinking",
		description: "Agent thinking-mode text",
		tokens: ["thinkingText"],
		default: "muted",
	},
	// Per-thinking-level palette. Writes to pi's existing thinkingX tokens —
	// pi uses them for the editor border at each thinking level, and the
	// statusline reads them via theme.fg("thinkingHigh", "high") to colour
	// the thinking-level segment. One token controls both surfaces.
	{
		name: "thinkingOff",
		description: "Thinking level: off",
		tokens: ["thinkingOff"],
		default: "dim",
	},
	{
		name: "thinkingMinimal",
		description: "Thinking level: minimal",
		tokens: ["thinkingMinimal"],
		default: "muted",
	},
	{
		name: "thinkingLow",
		description: "Thinking level: low",
		tokens: ["thinkingLow"],
		default: "accent",
	},
	{
		name: "thinkingMedium",
		description: "Thinking level: medium",
		tokens: ["thinkingMedium"],
		default: "green",
	},
	{
		name: "thinkingHigh",
		description: "Thinking level: high",
		tokens: ["thinkingHigh"],
		default: "yellow",
	},
	{
		name: "thinkingXhigh",
		description: "Thinking level: xhigh",
		tokens: ["thinkingXhigh"],
		default: "red",
	},
	// ── /context attribution palette ─────────────────────────────────────────
	// These don't drive any pi theme token (tokens: []) — they're consumed
	// by the /context extension via `globalThis.__piedpiContext`. The
	// menu lets the user pick a palette var per context-domain.
	{
		name: "context conversation",
		description: "/context: the live conversation segment",
		tokens: [],
		default: "accent",
	},
	{
		name: "context system",
		description: "/context: pi's harness system prompt",
		tokens: [],
		default: "yellow",
	},
	{
		name: "context agents",
		description: "/context: agents files (AGENTS.md / CLAUDE.md)",
		tokens: [],
		default: "brightYellow",
	},
	{
		name: "context tools",
		description: "/context: tool definitions (built-in, MCP, extensions)",
		tokens: [],
		default: "blue",
	},
	{
		name: "context skills",
		description: "/context: skill slash commands",
		tokens: [],
		default: "magenta",
	},
	{
		name: "context prompts",
		description: "/context: prompt template slash commands",
		tokens: [],
		default: "cyan",
	},
	{
		name: "context extensions",
		description: "/context: extension-registered slash commands",
		tokens: [],
		default: "green",
	},
	// ── /context flow tab: one colour per token channel ──────────────────────
	{
		name: "context flow input",
		description: "/context Flow: ↑ input (fresh, uncached prompt tokens)",
		tokens: [],
		default: "green",
	},
	{
		name: "context flow output",
		description: "/context Flow: ↓ output (assistant-generated tokens)",
		tokens: [],
		default: "yellow",
	},
	{
		name: "context flow cache-read",
		description: "/context Flow: R cache read (cache-hit input tokens)",
		tokens: [],
		default: "accent",
	},
	{
		name: "context flow cache-write",
		description: "/context Flow: W cache write (newly cached prefix tokens)",
		tokens: [],
		default: "magenta",
	},
];

type ThemeConfig = {
	// Per-category palette overrides. Missing entries use the category default.
	overrides: Record<string, PaletteVar>;
	// Editor-border override. When true, all six thinkingX tokens are set
	// uniformly to borderColor. The statusline thinking-text reads per-level
	// colours via globalThis (see publishThinkingColors) and is unaffected.
	borderOverride: boolean;
	borderColor: PaletteVar;
};

const DEFAULT_CONFIG: ThemeConfig = {
	overrides: {},
	borderOverride: false,
	borderColor: "dim",
};

function parseThemeConfig(raw: unknown): ThemeConfig {
	if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_CONFIG);
	const parsed = raw as Partial<ThemeConfig> & { overrides?: unknown };

	const validVar = (v: unknown): v is PaletteVar =>
		typeof v === "string" && (PALETTE_VARS as readonly string[]).includes(v);

	const overrides: Record<string, PaletteVar> = {};
	let borderOverride = DEFAULT_CONFIG.borderOverride;
	let borderColor = DEFAULT_CONFIG.borderColor;
	if (typeof parsed.borderOverride === "boolean")
		borderOverride = parsed.borderOverride;
	if (validVar(parsed.borderColor)) borderColor = parsed.borderColor;

	if (parsed.overrides && typeof parsed.overrides === "object") {
		for (const [k, v] of Object.entries(
			parsed.overrides as Record<string, unknown>,
		)) {
			if (validVar(v)) overrides[k] = v;
		}
	}
	return { overrides, borderOverride, borderColor };
}

const configStore = (() => {
	return new Config<ThemeConfig>({
		userPath: CONFIG_FILE,
		defaults: DEFAULT_CONFIG,
		parse: parseThemeConfig,
	});
})();

function effectiveColor(cat: Category, overrides: Record<string, PaletteVar>): PaletteVar {
	return overrides[cat.name] ?? cat.default;
}

type Palette = {
	accent: string;
	cursor: string;
	foreground: string;
	background: string;
	selection_foreground: string;
	selection_background: string;
	color: string[]; // 0..15
};

function parseColors(toml: string): Palette {
	const get = (k: string): string | undefined => {
		const m = toml.match(new RegExp(`^\\s*${k}\\s*=\\s*"([^"]+)"`, "m"));
		return m?.[1];
	};
	const color: string[] = [];
	for (let i = 0; i < 16; i++) {
		const v = get(`color${i}`);
		if (!v) throw new Error(`colors.toml missing color${i}`);
		color[i] = v;
	}
	const required = [
		"accent",
		"cursor",
		"foreground",
		"background",
		"selection_foreground",
		"selection_background",
	] as const;
	const out: Record<string, string> = {};
	for (const k of required) {
		const v = get(k);
		if (!v) throw new Error(`colors.toml missing ${k}`);
		out[k] = v;
	}
	return { ...(out as Omit<Palette, "color">), color };
}

// Default value for every one of pi's 51 theme tokens. All values are either
// hex literals from the omarchy palette (backgrounds) or var-name indirections
// that resolve via the `vars` block — so each omarchy theme drives its own
// concrete colors. CATEGORIES (e.g. "border") override these on top.
function defaultTokenMap(c: string[]): Record<string, string> {
	const bg = c[0]!; // ANSI black — used as the subtle background tint
	return {
		// Core UI
		accent: "accent",
		border: "dim",
		borderAccent: "accent",
		borderMuted: "dim",
		success: "green",
		error: "red",
		warning: "yellow",
		muted: "muted",
		dim: "dim",
		text: "",
		thinkingText: "muted",
		// Backgrounds & content
		selectedBg: bg,
		userMessageBg: bg,
		userMessageText: "",
		customMessageBg: bg,
		customMessageText: "",
		customMessageLabel: "accent",
		toolPendingBg: bg,
		toolSuccessBg: bg,
		toolErrorBg: bg,
		toolTitle: "accent",
		toolOutput: "",
		// Markdown
		mdHeading: "accent",
		mdLink: "accent",
		mdLinkUrl: "accent",
		mdCode: "accent",
		mdCodeBlock: "",
		mdCodeBlockBorder: "dim",
		mdQuote: "muted",
		mdQuoteBorder: "dim",
		mdHr: "dim",
		mdListBullet: "accent",
		// Tool diffs
		toolDiffAdded: "green",
		toolDiffRemoved: "red",
		toolDiffContext: "dim",
		// Syntax (needs per-token variety to be readable)
		syntaxComment: "dim",
		syntaxKeyword: "magenta",
		syntaxFunction: "blue",
		syntaxVariable: "yellow",
		syntaxString: "green",
		syntaxNumber: "magenta",
		syntaxType: "blue",
		syntaxOperator: "cyan",
		syntaxPunctuation: "muted",
		// Thinking-level borders — overridden by the "border" category.
		thinkingOff: "accent",
		thinkingMinimal: "accent",
		thinkingLow: "accent",
		thinkingMedium: "accent",
		thinkingHigh: "accent",
		thinkingXhigh: "accent",
		// Bash mode
		bashMode: "accent",
	};
}

function resolveVar(v: PaletteVar): string {
	return v === "default" ? "" : v;
}

// Map a palette var to its concrete hex in the active palette. Returns ""
// for "default" (no swatch) and a fallback gray if the palette isn't ready.
function paletteHex(v: PaletteVar, p: Palette | undefined): string {
	if (!p) return "";
	if (v === "default") return "";
	const c = p.color;
	const map: Record<Exclude<PaletteVar, "default">, string> = {
		accent: p.accent,
		fg: p.foreground,
		bg: p.background,
		dim: c[8]!,
		muted: c[7]!,
		red: c[1]!,
		green: c[2]!,
		yellow: c[3]!,
		blue: c[4]!,
		magenta: c[5]!,
		cyan: c[6]!,
		brightRed: c[9]!,
		brightGreen: c[10]!,
		brightYellow: c[11]!,
		brightBlue: c[12]!,
		brightMagenta: c[13]!,
		brightCyan: c[14]!,
		brightWhite: c[15]!,
	};
	return map[v];
}


function swatch(v: PaletteVar, p: Palette | undefined): string {
	// "default" means "use the terminal's default text color" — render as a
	// hollow circle in the omarchy foreground so it's still visible.
	if (v === "default") return paintHex(p?.foreground, "○");
	return paintHex(paletteHex(v, p), "●");
}

const THINKING_TOKENS = [
	"thinkingOff",
	"thinkingMinimal",
	"thinkingLow",
	"thinkingMedium",
	"thinkingHigh",
	"thinkingXhigh",
] as const;

const THINKING_LEVEL_FROM_TOKEN: Record<string, string> = {
	thinkingOff: "off",
	thinkingMinimal: "minimal",
	thinkingLow: "low",
	thinkingMedium: "medium",
	thinkingHigh: "high",
	thinkingXhigh: "xhigh",
};

declare global {
	// eslint-disable-next-line no-var
	var __piOmarchyThinking: Record<string, string> | undefined;
}

/**
 * Publish the resolved per-level hex colours so the statusline can paint
 * thinking-level text in those colours regardless of the editor-border
 * override. omarchy-theme stays the colour source of truth; statusline
 * does the painting.
 */
function publishThinkingColors(config: ThemeConfig, palette: Palette): void {
	const map: Record<string, string> = {};
	for (const cat of CATEGORIES) {
		const level = THINKING_LEVEL_FROM_TOKEN[cat.name];
		if (!level) continue;
		const v = effectiveColor(cat, config.overrides);
		const hex = paletteHex(v, palette);
		if (hex) map[level] = hex;
	}
	globalThis.__piOmarchyThinking = map;
}

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

/**
 * Publish the resolved hex per /context segment group. /context paints
 * the attribution graph + legend from this map via `paintRgb`; if the
 * map is undefined (omarchy-theme not loaded), /context falls back to
 * pi theme tokens. omarchy-theme stays the colour source of truth.
 */
function publishContextColors(config: ThemeConfig, palette: Palette): void {
	const hexFor = (name: string): string | undefined => {
		const cat = CATEGORIES.find((c) => c.name === name);
		if (!cat) return undefined;
		const hex = paletteHex(effectiveColor(cat, config.overrides), palette);
		return hex || undefined;
	};
	globalThis.__piedpiContext = {
		conversation: hexFor("context conversation"),
		system: hexFor("context system"),
		agents: hexFor("context agents"),
		tools: hexFor("context tools"),
		skills: hexFor("context skills"),
		prompts: hexFor("context prompts"),
		extensions: hexFor("context extensions"),
		flowInput: hexFor("context flow input"),
		flowOutput: hexFor("context flow output"),
		flowCacheRead: hexFor("context flow cache-read"),
		flowCacheWrite: hexFor("context flow cache-write"),
	};
}

function buildTheme(p: Palette, config: ThemeConfig) {
	// color0=black, 1=red, 2=green, 3=yellow, 4=blue, 5=magenta, 6=cyan, 7=white,
	// 8=bright black (dim), 9-15=bright variants.
	const c = p.color;

	// Start with category defaults, then apply user overrides on top.
	const tokenValues: Record<string, string> = { ...defaultTokenMap(c) };
	for (const cat of CATEGORIES) {
		const color = effectiveColor(cat, config.overrides);
		const resolved = resolveVar(color);
		for (const token of cat.tokens) {
			tokenValues[token] = resolved;
		}
	}

	// Editor-border override: mask all six thinkingX tokens with one colour.
	// Statusline thinking-text is unaffected because it reads
	// globalThis.__piOmarchyThinking, not these tokens.
	if (config.borderOverride) {
		const resolved = resolveVar(config.borderColor);
		for (const token of THINKING_TOKENS) {
			tokenValues[token] = resolved;
		}
	}

	return {
		$schema:
			"https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
		name: THEME_NAME,
		vars: {
			accent: p.accent,
			bg: p.background,
			fg: p.foreground,
			dim: c[8],
			muted: c[7],
			red: c[1],
			green: c[2],
			yellow: c[3],
			blue: c[4],
			magenta: c[5],
			cyan: c[6],
			brightRed: c[9],
			brightGreen: c[10],
			brightYellow: c[11],
			brightBlue: c[12],
			brightMagenta: c[13],
			brightCyan: c[14],
			brightWhite: c[15],
			selBg: p.selection_background,
		},
		colors: tokenValues,
		export: {
			pageBg: p.background,
			cardBg: c[0],
			infoBg: c[0],
		},
	};
}

type GenResult =
	| { ok: true; omarchyName: string; palette: Palette }
	| { ok: false; error: string };

async function generate(config: ThemeConfig): Promise<GenResult> {
	try {
		const toml = await fs.readFile(COLORS_FILE, "utf8");
		const palette = parseColors(toml);
		const theme = buildTheme(palette, config);
		publishThinkingColors(config, palette);
		publishContextColors(config, palette);
		// Ensure target dir exists — user may have removed ~/.pi/agent/themes.
		await fs.mkdir(THEMES_DIR, { recursive: true });
		await fs.writeFile(THEME_OUT, JSON.stringify(theme, null, 2));
		let name = "unknown";
		try {
			name = (await fs.readFile(NAME_FILE, "utf8")).trim() || name;
		} catch {}
		return { ok: true, omarchyName: name, palette };
	} catch (err) {
		return { ok: false, error: String((err as Error).message ?? err) };
	}
}

let lastGen: GenResult | null = null;

export default async function (pi: ExtensionAPI) {
	// Generate before theme discovery so pi finds the file at startup.
	lastGen = await generate(configStore.get());

	let watcher: FSWatcher | null = null;

	type Ctx = Parameters<Parameters<ExtensionAPI["on"]>[1]>[1];

	const apply = (
		ctx: Ctx,
		opts: { quietOnFail?: boolean; verbose?: boolean } = {},
	) => {
		if (!lastGen?.ok) {
			if (!opts.quietOnFail) {
				ctx.ui.notify(
					`omarchy-theme: generate failed (${lastGen && !lastGen.ok ? lastGen.error : "unknown"})`,
					"error",
				);
			}
			return false;
		}
		// Try by name first.
		let r = ctx.ui.setTheme(THEME_NAME);
		let usedFallback = false;
		if (!r.success) {
			// Fallback: load directly from disk in case pi's registry hasn't
			// picked up the file (race between extension factory and theme
			// discovery on startup).
			const theme = ctx.ui.getTheme(THEME_NAME);
			if (theme) {
				usedFallback = true;
				r = ctx.ui.setTheme(theme);
			}
		}
		if (!r.success) {
			if (!opts.quietOnFail) {
				ctx.ui.notify(
					`omarchy-theme: setTheme failed (${r.error ?? "unknown"}) — pi theme now: ${ctx.ui.theme.name ?? "?"}`,
					"error",
				);
			}
			return false;
		}
		const active = ctx.ui.theme.name ?? "?";
		// If pi reports a different theme name than what we set, that means
		// pi's internal load fell back silently. Make it visible.
		if (active !== THEME_NAME) {
			if (!opts.quietOnFail) {
				ctx.ui.notify(
					`omarchy-theme: setTheme returned success but pi reports theme="${active}". Try /omarchy-theme reload.`,
					"warning",
				);
			}
			return false;
		}
		// Success is silent — visual change is feedback enough.
		if (opts.verbose) {
			ctx.ui.notify(
				`omarchy-theme: applied omarchy/${lastGen.omarchyName}${usedFallback ? " (via fallback)" : ""}`,
				"info",
			);
		}
		return true;
	};

	let pendingTimer: ReturnType<typeof setTimeout> | null = null;

	const scheduleReapply = (ctx: Ctx) => {
		// Trailing debounce: omarchy-theme-set does `rm -rf theme`, `mv next theme`,
		// then writes `theme.name` last. We want to fire AFTER all of that settles.
		if (pendingTimer) clearTimeout(pendingTimer);
		pendingTimer = setTimeout(async () => {
			pendingTimer = null;
			for (let attempt = 0; attempt < 6; attempt++) {
				const g = await generate(configStore.get());
				if (g.ok) {
					lastGen = g;
					// Defer apply so pi's internal hot-reload (100ms debounce) has
					// a chance to re-read the rewritten JSON into its registry
					// cache. Otherwise setTheme uses the stale cached Theme and
					// pi keeps showing the previous omarchy theme's colors.
					setTimeout(() => apply(ctx), 250);
					return;
				}
				// Files not settled yet; retry shortly.
				await new Promise((r) => setTimeout(r, 250));
			}
			// Persist final failure for /omarchy-theme status, but don't spam the chat.
			lastGen = await generate(configStore.get());
		}, 600);
	};

	pi.on("session_start", async (_event, ctx) => {
		// Defer first apply: pi runs its own initTheme during startup AFTER
		// extension factories complete but possibly AFTER our session_start
		// handler too. A short timeout lets the dust settle before we re-apply.
		setTimeout(() => apply(ctx, { quietOnFail: true }), 150);

		try {
			watcher = watch(OMARCHY_DIR, { persistent: false }, (_evt, file) => {
				if (file === "theme.name" || file === "theme") {
					scheduleReapply(ctx);
				}
			});
		} catch (err) {
			ctx.ui.notify(`omarchy-theme: watch failed (${err})`, "warning");
		}
	});

	pi.on("session_shutdown", () => {
		watcher?.close();
		watcher = null;
		if (pendingTimer) {
			clearTimeout(pendingTimer);
			pendingTimer = null;
		}
	});

	const showStatus = (ctx: Ctx) => {
		const piTheme = ctx.ui.theme.name ?? "(unnamed)";
		const omarchy = lastGen?.ok
			? lastGen.omarchyName
			: `error: ${lastGen?.error ?? "not generated"}`;
		const overrideLines = CATEGORIES.map((cat) => {
			const cur = effectiveColor(cat, configStore.get().overrides);
			const tag = cat.name in configStore.get().overrides ? "*" : " ";
			return `  ${tag} ${cat.name.padEnd(8)} ${cur}`;
		});
		ctx.ui.notify(
			[
				`pi theme:      ${piTheme}`,
				`omarchy theme: ${omarchy}`,
				`overrides (* = customized):`,
				...overrideLines,
			].join("\n"),
			"info",
		);
	};

	pi.registerCommand("omarchy-theme", {
		description: "Open the omarchy theme color menu (or `reload` to resync)",
		getArgumentCompletions: (prefix) => {
			const subs = ["reload"];
			const items = subs.map((v) => ({ value: v, label: v }));
			const filtered = items.filter((i) => i.value.startsWith(prefix));
			return filtered.length ? filtered : null;
		},
		handler: async (args, ctx) => {
			const sub0 = (args ?? "").trim();

			if (sub0 === "reload") {
				lastGen = await generate(configStore.get());
				apply(ctx, { verbose: true });
				showStatus(ctx);
				return;
			}

			// No args → open the live-preview color menu (custom UI).
			await openColorMenu(ctx);
		},
	});

	async function openColorMenu(ctx: Ctx): Promise<void> {
		await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
			return buildColorMenu(tui, ctx, theme as MenuTheme, done);
		});
	}

	function buildColorMenu(
		tui: TUI,
		ctx: Ctx,
		theme: MenuTheme,
		done: (v: void) => void,
	): Component {
		// Row 0: borderOverride (toggle), Row 1: borderColor (palette var),
		// Row 2+: CATEGORIES. The idx layout is stable so applyRows can read
		// straight out of the index vector.
		const buildRows = (cfg: ThemeConfig): CycleRow[] => [
			{
				name: "border override",
				values: ["off", "on"],
				initialIndex: cfg.borderOverride ? 1 : 0,
			},
			{
				name: "border colour",
				values: PALETTE_VARS,
				initialIndex: Math.max(0, PALETTE_VARS.indexOf(cfg.borderColor)),
				paintPrefix: (v) =>
					swatch(v as PaletteVar, lastGen?.ok ? lastGen.palette : undefined),
			},
			...CATEGORIES.map(
				(cat): CycleRow => ({
					name: cat.name,
					values: PALETTE_VARS,
					initialIndex: Math.max(
						0,
						PALETTE_VARS.indexOf(effectiveColor(cat, cfg.overrides)),
					),
					paintPrefix: (v) =>
						swatch(v as PaletteVar, lastGen?.ok ? lastGen.palette : undefined),
				}),
			),
		];

		const applyRows = (
			_original: ThemeConfig,
			idxs: readonly number[],
		): ThemeConfig => {
			const overrides: Record<string, PaletteVar> = {};
			const borderOverride = ["off", "on"][idxs[0]!] === "on";
			const borderColor = PALETTE_VARS[idxs[1]!] as PaletteVar;
			CATEGORIES.forEach((cat, i) => {
				const pick = PALETTE_VARS[idxs[i + 2]!] as PaletteVar;
				if (pick !== cat.default) overrides[cat.name] = pick;
			});
			return { overrides, borderOverride, borderColor };
		};

		let previewTimer: ReturnType<typeof setTimeout> | null = null;
		const scheduleRegen = () => {
			if (previewTimer) clearTimeout(previewTimer);
			previewTimer = setTimeout(async () => {
				previewTimer = null;
				const g = await generate(configStore.get());
				if (g.ok) {
					lastGen = g;
					setTimeout(() => apply(ctx, { quietOnFail: true }), 150);
				}
			}, 30);
		};

		return openConfigMenu<ThemeConfig>(
			tui,
			theme,
			() => done(),
			{
				config: configStore,
				buildRows,
				applyRows,
				sideEffect: scheduleRegen,
				title: "Omarchy theme",
			},
		);
	}
}
