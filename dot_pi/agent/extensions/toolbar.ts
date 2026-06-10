import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Segment = "cwd" | "gitBranch" | "gitWorktree" | "gitAhead" | "gitBranchDiff" | "gitWorkDiff" | "usage" | "cost" | "codex5h" | "codexWeekly" | "context" | "model" | "thinking" | "statuses";
type ColorName = "dim" | "muted" | "accent" | "success" | "warning" | "error" | "text";
type QuotaWindow = { usedPercent: number; windowSeconds: number; resetAt?: number };
type CodexUsage = { fiveHour?: QuotaWindow; weekly?: QuotaWindow; fetchedAt?: number };

type ToolbarLine = { left: Segment[]; right: Segment[] };
type ToolbarConfig = {
	enabled: boolean;
	left: Segment[];
	right: Segment[];
	lines?: ToolbarLine[];
	showCost: boolean;
	showGitBranch: boolean;
	showGitDiffs: boolean;
	showGitBranchDiffs: boolean;
	showGitAheadBehind: boolean;
	gitDiffStyle: "numbers" | "symbols" | "symbolsNumbers";
	showWorktree: boolean;
	gitBase: string;
	codexWindow: "both" | "fiveHour" | "weekly";
	codexDisplay: "used" | "remaining";
	costCurrency: "USD" | "GBP";
	usdToGbp: number;
	codex5hWarning: number;
	codex5hError: number;
	codexWeeklyWarning: number;
	codexWeeklyError: number;
	contextWarning: number;
	contextError: number;
	colors: Record<string, ColorName>;
	disabledSegments: Segment[];
};

type GitStats = { branch?: string; added: number; deleted: number; dirty: boolean; base?: string; ahead: number; behind: number; branchAdded: number; branchDeleted: number; worktree?: string; worktreeCount: number };

const GIT_SEGMENTS: Segment[] = ["gitBranch", "gitWorktree", "gitAhead", "gitBranchDiff", "gitWorkDiff"];
const CODEX_SEGMENTS: Segment[] = ["codex5h", "codexWeekly"];
const SEGMENTS: Segment[] = ["cwd", ...GIT_SEGMENTS, "usage", "cost", ...CODEX_SEGMENTS, "context", "model", "thinking", "statuses"];
const STYLES: ColorName[] = ["text", "dim", "muted", "accent"];
const CONFIG_PATH = join(process.env.HOME ?? "", ".pi", "agent", "toolbar.json");
const CHATGPT_BASE_URL = (process.env.CHATGPT_BASE_URL || "https://chatgpt.com/backend-api").replace(/\/+$/, "");
const OPENAI_AUTH_CLAIM = "https://api.openai.com/auth";
const FIVE_HOUR_SECONDS = 5 * 60 * 60;
const WEEK_SECONDS = 7 * 24 * 60 * 60;

const DEFAULT_CONFIG: ToolbarConfig = {
	enabled: true,
	left: ["gitBranch", "gitAhead", "gitBranchDiff", "gitWorkDiff", "usage", "cost", "codex5h", "codexWeekly", "context"],
	right: ["model", "thinking", "statuses"],
	showCost: true,
	showGitBranch: true,
	showGitDiffs: true,
	showGitBranchDiffs: true,
	showGitAheadBehind: true,
	gitDiffStyle: "symbolsNumbers",
	showWorktree: true,
	gitBase: "origin/main",
	codexWindow: "both",
	codexDisplay: "used",
	costCurrency: "USD",
	usdToGbp: 0.79,
	codex5hWarning: 80,
	codex5hError: 90,
	codexWeeklyWarning: 80,
	codexWeeklyError: 90,
	contextWarning: 50,
	contextError: 80,
	colors: { cwd: "dim", gitBranch: "accent", gitWorktree: "accent", gitAhead: "accent", gitBranchDiff: "accent", gitWorkDiff: "accent", usage: "dim", cost: "dim", codex5h: "muted", codexWeekly: "muted", context: "dim", model: "dim", thinking: "dim", statuses: "dim" },
	disabledSegments: [],
};

function loadConfig(): ToolbarConfig {
	if (!existsSync(CONFIG_PATH)) return structuredClone(DEFAULT_CONFIG);
	try {
		const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<ToolbarConfig>;
		const migrate = (items: Segment[] | undefined): Segment[] | undefined => items?.flatMap((item) => {
			if (item === ("git" as Segment)) return GIT_SEGMENTS;
			if (item === ("codex" as Segment)) return CODEX_SEGMENTS;
			return [item];
		});
		const lines = parsed.lines?.map((line) => ({ left: migrate(line.left) ?? [], right: migrate(line.right) ?? [] }));
		const colors = { ...DEFAULT_CONFIG.colors, ...(parsed.colors ?? {}) };
		for (const segment of GIT_SEGMENTS) colors[segment] = colors[segment] ?? colors.git ?? "accent";
		for (const segment of CODEX_SEGMENTS) colors[segment] = colors[segment] ?? colors.codex ?? "muted";
		return { ...DEFAULT_CONFIG, ...parsed, left: migrate(parsed.left) ?? DEFAULT_CONFIG.left, right: migrate(parsed.right) ?? DEFAULT_CONFIG.right, lines, colors, disabledSegments: parsed.disabledSegments ?? [] };
	} catch {
		return structuredClone(DEFAULT_CONFIG);
	}
}

function saveConfig(config: ToolbarConfig): void {
	writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

function layout(config: ToolbarConfig): ToolbarLine[] {
	if (config.lines?.length) return config.lines;
	config.lines = [{ left: config.left, right: config.right }];
	return config.lines;
}

function syncLegacySides(config: ToolbarConfig): void {
	const first = layout(config)[0] ?? { left: [], right: [] };
	config.left = first.left;
	config.right = first.right;
}

function placedSegments(config: ToolbarConfig): Set<Segment> {
	return new Set(layout(config).flatMap((line) => [...line.left, ...line.right]));
}

function disabledSegments(config: ToolbarConfig): Set<Segment> {
	return new Set(config.disabledSegments ?? []);
}

function enabledSegments(config: ToolbarConfig): Set<Segment> {
	const disabled = disabledSegments(config);
	return new Set([...placedSegments(config)].filter((segment) => !disabled.has(segment)));
}

function setSegmentEnabled(config: ToolbarConfig, segment: Segment, enabled: boolean): void {
	const lines = layout(config);
	if (!placedSegments(config).has(segment)) lines[0].left = [...lines[0].left, segment];
	const disabled = disabledSegments(config);
	if (enabled) disabled.delete(segment);
	else disabled.add(segment);
	config.disabledSegments = [...disabled];
	syncLegacySides(config);
}

function toggleSegment(config: ToolbarConfig, segment: Segment): void {
	setSegmentEnabled(config, segment, !enabledSegments(config).has(segment));
}

function normalizeOrder(input: string, fallback: Segment[]): Segment[] {
	const seen = new Set<Segment>();
	const ordered: Segment[] = [];
	for (const raw of input.split(/[\s,]+/)) {
		if (!SEGMENTS.includes(raw as Segment)) continue;
		const segment = raw as Segment;
		if (!seen.has(segment)) ordered.push(segment);
		seen.add(segment);
	}
	return ordered.length ? ordered : fallback;
}

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(1)}m`;
}

function usageStats(ctx: any): { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number } {
	let input = 0, output = 0, cacheRead = 0, cacheWrite = 0, cost = 0;
	for (const e of ctx.sessionManager.getBranch()) {
		if (e.type !== "message" || e.message.role !== "assistant") continue;
		const m = e.message as AssistantMessage;
		input += m.usage?.input ?? 0;
		output += m.usage?.output ?? 0;
		cacheRead += m.usage?.cacheRead ?? 0;
		cacheWrite += m.usage?.cacheWrite ?? 0;
		cost += m.usage?.cost?.total ?? 0;
	}
	return { input, output, cacheRead, cacheWrite, cost };
}

function usageText(ctx: any): string {
	const { input, output, cacheRead, cacheWrite } = usageStats(ctx);
	return [`↑${fmtTokens(input)}`, `↓${fmtTokens(output)}`, `R${fmtTokens(cacheRead)}`, `W${fmtTokens(cacheWrite)}`].join(" ");
}

function costText(ctx: any, currency: ToolbarConfig["costCurrency"], usdToGbp: number): string {
	const usd = usageStats(ctx).cost;
	if (currency === "GBP") return `£${(usd * usdToGbp).toFixed(3)}`;
	return `$${usd.toFixed(3)}`;
}

function contextText(ctx: any): { text?: string; percent?: number } {
	const usage = ctx.getContextUsage?.();
	if (!usage || usage.percent === null || usage.percent === undefined) return {};
	const percent = Math.round(usage.percent);
	return { text: `ctx ${percent}%`, percent };
}

function decodeJwtPayload(token: string): any {
	try { return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")); } catch { return {}; }
}

function accountIdFromToken(token: string): string | undefined {
	const auth = decodeJwtPayload(token)?.[OPENAI_AUTH_CLAIM];
	return typeof auth?.chatgpt_account_id === "string" ? auth.chatgpt_account_id : undefined;
}

function asRecord(value: unknown): Record<string, any> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : undefined;
}

function normalizeWindow(value: unknown): QuotaWindow | undefined {
	const record = asRecord(value);
	if (!record || typeof record.used_percent !== "number" || typeof record.limit_window_seconds !== "number") return undefined;
	return { usedPercent: record.used_percent, windowSeconds: record.limit_window_seconds, resetAt: typeof record.reset_at === "number" ? record.reset_at : undefined };
}

function parseCodexUsage(data: unknown): CodexUsage {
	const rateLimit = asRecord(asRecord(data)?.rate_limit);
	const windows = [normalizeWindow(rateLimit?.primary_window), normalizeWindow(rateLimit?.secondary_window)].filter(Boolean) as QuotaWindow[];
	return {
		fiveHour: windows.find((w) => Math.abs(w.windowSeconds - FIVE_HOUR_SECONDS) <= 120),
		weekly: windows.find((w) => Math.abs(w.windowSeconds - WEEK_SECONDS) <= 120),
		fetchedAt: Date.now(),
	};
}

function percentColor(usedPercent: number | undefined, fallback: ColorName, warning = 80, error = 90): ColorName {
	if (usedPercent === undefined) return fallback;
	if (usedPercent >= error) return "error";
	if (usedPercent >= warning) return "warning";
	return fallback;
}

function codexPart(label: string, window: QuotaWindow | undefined, display: ToolbarConfig["codexDisplay"]): string | undefined {
	if (!window) return undefined;
	const used = Math.round(Math.max(0, Math.min(100, window.usedPercent)));
	return display === "remaining" ? `${label} ${100 - used}%` : `${label} ${used}%`;
}

async function toggleElements(ctx: any, config: ToolbarConfig, onChange: () => void): Promise<void> {
	await ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: (value: null) => void) => {
		let index = 0;
		const toggleCurrent = () => {
			const segment = SEGMENTS[index];
			setSegmentEnabled(config, segment, !enabledSegments(config).has(segment));
			onChange();
		};

		return {
			invalidate() {},
			handleInput(data: string) {
				if (matchesKey(data, Key.up)) index = Math.max(0, index - 1);
				else if (matchesKey(data, Key.down)) index = Math.min(SEGMENTS.length - 1, index + 1);
				else if (matchesKey(data, Key.enter) || data === " ") toggleCurrent();
				else if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) done(null);
				tui.requestRender();
			},
			render(width: number) {
				const enabled = enabledSegments(config);
				const lines = [
					theme.fg("accent", theme.bold("Toolbar elements")),
					theme.fg("dim", "↑↓ move • enter/space toggle • esc back"),
					"",
				];
				for (let i = 0; i < SEGMENTS.length; i++) {
					const segment = SEGMENTS[i];
					const prefix = i === index ? "› " : "  ";
					const mark = enabled.has(segment) ? "✓" : " ";
					const line = `${prefix}[${mark}] ${segment}`;
					lines.push(i === index ? theme.fg("accent", line) : line);
				}
				lines.push("");
				return lines.map((line) => truncateToWidth(line, width));
			},
		};
	});
}

async function alignElements(ctx: any, config: ToolbarConfig, onChange: () => void): Promise<void> {
	await ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: (value: null) => void) => {
		let row = 0;
		let side: "left" | "right" = layout(config)[0]?.left.length ? "left" : "right";
		let index = 0;
		const rows = () => layout(config);
		const currentLine = () => rows()[row] ?? rows()[0];
		const currentList = () => side === "left" ? currentLine().left : currentLine().right;
		const otherList = () => side === "left" ? currentLine().right : currentLine().left;
		const orderedForRow = (rowIndex: number) => {
			const line = rows()[rowIndex];
			return line ? [...line.left.map((item, i) => ({ item, side: "left" as const, index: i })), ...line.right.map((item, i) => ({ item, side: "right" as const, index: i }))] : [];
		};
		const cleanup = () => { config.lines = rows().filter((line) => line.left.length || line.right.length); if (!config.lines.length) config.lines = [{ left: [], right: [] }]; row = Math.min(row, config.lines.length - 1); syncLegacySides(config); };
		const clamp = () => { row = Math.max(0, Math.min(row, rows().length - 1)); index = Math.max(0, Math.min(index, Math.max(0, currentList().length - 1))); };
		const moveWithin = (delta: -1 | 1) => {
			const list = currentList();
			if (!list.length) return;
			const next = index + delta;
			if (next >= 0 && next < list.length) { [list[index], list[next]] = [list[next], list[index]]; index = next; }
			else {
				const [item] = list.splice(index, 1);
				const target = otherList();
				if (side === "left") { target.unshift(item); side = "right"; index = 0; }
				else { target.push(item); side = "left"; index = target.length - 1; }
			}
			cleanup(); onChange();
		};
		const moveRow = (delta: -1 | 1) => {
			const list = currentList(); if (!list.length) return;
			const [item] = list.splice(index, 1);
			let nextRow = row + delta;
			if (nextRow < 0) { rows().unshift({ left: [], right: [] }); nextRow = 0; }
			if (nextRow >= rows().length) rows().push({ left: [], right: [] });
			row = nextRow;
			const target = side === "left" ? rows()[row].left : rows()[row].right;
			target.push(item); index = target.length - 1;
			cleanup(); onChange();
		};
		const selectRow = (targetRow: number) => {
			if (targetRow < 0 || targetRow >= rows().length) return;
			row = targetRow;
			const ordered = orderedForRow(row);
			if (!ordered.length) { side = "left"; index = 0; return; }
			const next = ordered[0];
			side = next.side; index = next.index;
		};
		const cycleSelection = (delta: -1 | 1) => {
			const all = rows().flatMap((_line, rowIndex) => orderedForRow(rowIndex).map((entry) => ({ ...entry, row: rowIndex })));
			if (!all.length) return;
			const current = all.findIndex((entry) => entry.row === row && entry.side === side && entry.index === index);
			const next = all[(current + delta + all.length) % all.length];
			row = next.row; side = next.side; index = next.index;
		};
		return {
			invalidate() {},
			handleInput(data: string) {
				if (matchesKey(data, Key.left) || data === "h") moveWithin(-1);
				else if (matchesKey(data, Key.right) || data === "l") moveWithin(1);
				else if (matchesKey(data, Key.up) || data === "k") moveRow(-1);
				else if (matchesKey(data, Key.down) || data === "j") moveRow(1);
				else if (matchesKey(data, Key.tab) || data === "s") cycleSelection(1);
				else if (matchesKey(data, Key.shift("tab")) || data === "S") cycleSelection(-1);
				else if (/^[1-9]$/.test(data)) selectRow(Number(data) - 1);
				else if (data === "d" || data === "D") {
					const item = currentList()[index];
					if (item) { toggleSegment(config, item); onChange(); }
				}
				else if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) done(null);
				tui.requestRender();
			},
			render(width: number) {
				const lines = [
					theme.fg("accent", theme.bold("Toolbar alignment")),
					theme.fg("dim", "tab select • ←→/hl order • ↑↓/jk line • d toggle • esc"),
					"",
				];
				const disabled = disabledSegments(config);
				const renderItems = (items: Segment[], rowIndex: number, name: "left" | "right") => items.map((item, i) => {
					const selected = row === rowIndex && side === name && i === index;
					const text = `${selected ? ">" : " "}${item}`;
					if (selected) return theme.fg("accent", text);
					return disabled.has(item) ? theme.fg("dim", text) : text;
				}).join("  ");
				rows().forEach((line, rowIndex) => {
					const left = renderItems(line.left, rowIndex, "left") || theme.fg("dim", "empty");
					const right = renderItems(line.right, rowIndex, "right") || theme.fg("dim", "empty");
					const lineNo = theme.fg(rowIndex === row ? "accent" : "dim", `${rowIndex + 1}.`);
					lines.push(`${lineNo} ${left} ${theme.fg("dim", "|")} ${right}`);
				});
				lines.push("");
				return lines.map((line) => truncateToWidth(line, width));
			},
		};
	});
}

async function configureStyles(ctx: any, config: ToolbarConfig, onChange: () => void): Promise<void> {
	await ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: (value: null) => void) => {
		let index = 0;
		const cycle = (delta: -1 | 1) => {
			const segment = SEGMENTS[index];
			const current = STYLES.includes(config.colors[segment]) ? STYLES.indexOf(config.colors[segment]) : 0;
			config.colors[segment] = STYLES[(current + delta + STYLES.length) % STYLES.length];
			onChange();
		};
		return {
			invalidate() {},
			handleInput(data: string) {
				if (matchesKey(data, Key.up)) index = Math.max(0, index - 1);
				else if (matchesKey(data, Key.down)) index = Math.min(SEGMENTS.length - 1, index + 1);
				else if (matchesKey(data, Key.enter) || data === " " || matchesKey(data, Key.right)) cycle(1);
				else if (matchesKey(data, Key.left)) cycle(-1);
				else if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) done(null);
				tui.requestRender();
			},
			render(width: number) {
				const lines = [theme.fg("accent", theme.bold("Text style")), theme.fg("dim", "Uses your active theme. Semantic warning/error colours are reserved for thresholds and diffs."), theme.fg("dim", "↑↓ select • enter/space/→ cycle • ← previous • esc back"), ""];
				SEGMENTS.forEach((segment, i) => {
					const selected = i === index;
					const style = STYLES.includes(config.colors[segment]) ? config.colors[segment] : "text";
					const text = `${selected ? "›" : " "} ${segment}: ${style}`;
					lines.push(theme.fg(style, selected ? theme.bold(text) : text));
				});
				return lines.map((line) => truncateToWidth(line, width));
			},
		};
	});
}

async function settingsMenu(
	ctx: any,
	title: string,
	getItems: () => string[],
	onAction: (index: number, delta?: -1 | 1) => void | Promise<void>,
	onDisable?: (index: number) => void | Promise<void>,
): Promise<void> {
	await ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: (value: null) => void) => {
		let index = 0;
		return {
			invalidate() {},
			async handleInput(data: string) {
				const items = getItems();
				if (matchesKey(data, Key.up) || data === "k") index = Math.max(0, index - 1);
				else if (matchesKey(data, Key.down) || data === "j") index = Math.min(items.length - 1, index + 1);
				else if (matchesKey(data, Key.right) || data === "l" || matchesKey(data, Key.enter) || data === " ") await onAction(index);
				else if (matchesKey(data, Key.left) || data === "h") await onAction(index, -1);
				else if (data === "d" || data === "D") await onDisable?.(index);
				else if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) done(null);
				tui.requestRender();
			},
			render(width: number) {
				const lines = [theme.fg("accent", theme.bold(title)), theme.fg("dim", "↑↓/jk move • →/l inc/style • ←/h dec/toggle • d disable • esc"), ""];
				getItems().forEach((item, i) => {
					const line = `${i === index ? "›" : " "} ${item}`;
					const isOff = /:\s*disabled\b/.test(item);
					if (isOff) lines.push(theme.fg("dim", i === index ? theme.bold(line) : line));
					else lines.push(i === index ? theme.fg("accent", line) : line);
				});
				lines.push("");
				return lines.map((line) => truncateToWidth(line, width));
			},
		};
	});
}

function segmentMode(config: ToolbarConfig, segment: Segment): ColorName | "disabled" {
	return enabledSegments(config).has(segment) ? (config.colors[segment] as ColorName) : "disabled";
}

function cycleSegmentStyle(config: ToolbarConfig, segment: Segment, delta: -1 | 1 = 1): void {
	if (!enabledSegments(config).has(segment)) return;
	const current = STYLES.includes(config.colors[segment]) ? STYLES.indexOf(config.colors[segment]) : 0;
	config.colors[segment] = STYLES[(current + delta + STYLES.length) % STYLES.length];
}

async function configureCore(ctx: any, config: ToolbarConfig, onChange: () => void): Promise<void> {
	await settingsMenu(ctx, "Core", () => {
		const enabled = enabledSegments(config);
		return [
			`Folder: ${segmentMode(config, "cwd")}`,
			`Model: ${segmentMode(config, "model")}`,
			`Thinking: ${segmentMode(config, "thinking")}`,
			`Statuses: ${segmentMode(config, "statuses")}`,
		];
	}, (index, delta = 1) => {
		if (index === 0) cycleSegmentStyle(config, "cwd", delta);
		else if (index === 1) cycleSegmentStyle(config, "model", delta);
		else if (index === 2) cycleSegmentStyle(config, "thinking", delta);
		else if (index === 3) cycleSegmentStyle(config, "statuses", delta);
		onChange();
	}, (index) => {
		if (index === 0) toggleSegment(config, "cwd");
		else if (index === 1) toggleSegment(config, "model");
		else if (index === 2) toggleSegment(config, "thinking");
		else if (index === 3) toggleSegment(config, "statuses");
		onChange();
	});
}

async function configureGit(ctx: any, config: ToolbarConfig, onChange: () => void): Promise<void> {
	const styles: ToolbarConfig["gitDiffStyle"][] = ["symbols", "symbolsNumbers", "numbers"];
	await settingsMenu(ctx, "Git", () => [
		`Branch: ${segmentMode(config, "gitBranch")}`,
		`Worktree: ${segmentMode(config, "gitWorktree")}`,
		`Ahead/behind: ${enabledSegments(config).has("gitAhead") ? "on" : "disabled"}`,
		`Branch diff: ${enabledSegments(config).has("gitBranchDiff") ? "on" : "disabled"}`,
		`Working diff: ${enabledSegments(config).has("gitWorkDiff") ? "on" : "disabled"}`,
		`Diff display: ${config.gitDiffStyle}`,
	], (index, delta = 1) => {
		if (index === 0) cycleSegmentStyle(config, "gitBranch", delta);
		else if (index === 1) cycleSegmentStyle(config, "gitWorktree", delta);
		else if (index === 5) config.gitDiffStyle = styles[(styles.indexOf(config.gitDiffStyle) + 1) % styles.length];
		onChange();
	}, (index) => {
		if (index === 0) toggleSegment(config, "gitBranch");
		else if (index === 1) toggleSegment(config, "gitWorktree");
		else if (index === 2) toggleSegment(config, "gitAhead");
		else if (index === 3) toggleSegment(config, "gitBranchDiff");
		else if (index === 4) toggleSegment(config, "gitWorkDiff");
		onChange();
	});
}

async function configureUsage(ctx: any, config: ToolbarConfig, onChange: () => void): Promise<void> {
	await settingsMenu(ctx, "Usage", () => {
		const enabled = enabledSegments(config);
		return [
			`Tokens: ${segmentMode(config, "usage")}`,
			`Cost: ${segmentMode(config, "cost")}`,
			`Currency: ${config.costCurrency}`,
			`USD→GBP: ${config.usdToGbp.toFixed(2)}`,
			`Context: ${segmentMode(config, "context")}`,
			`Context warning: ${config.contextWarning}%`,
			`Context error: ${config.contextError}%`,
		];
	}, (index, delta = 1) => {
		if (index === 0) cycleSegmentStyle(config, "usage", delta);
		else if (index === 1) cycleSegmentStyle(config, "cost", delta);
		else if (index === 2) config.costCurrency = config.costCurrency === "USD" ? "GBP" : "USD";
		else if (index === 3) config.usdToGbp = Math.min(2, config.usdToGbp + 0.01);
		else if (index === 4) cycleSegmentStyle(config, "context", delta);
		else if (index === 5) config.contextWarning = bumpPercent(config.contextWarning, 5);
		else if (index === 6) config.contextError = bumpPercent(config.contextError, 5);
		onChange();
	}, (index) => {
		if (index === 0) toggleSegment(config, "usage");
		else if (index === 1) toggleSegment(config, "cost");
		else if (index === 3) config.usdToGbp = Math.max(0, config.usdToGbp - 0.01);
		else if (index === 4) toggleSegment(config, "context");
		else if (index === 5) config.contextWarning = bumpPercent(config.contextWarning, -5);
		else if (index === 6) config.contextError = bumpPercent(config.contextError, -5);
		onChange();
	});
}

function bumpPercent(value: number, delta: number): number {
	return Math.max(0, Math.min(100, value + delta));
}

async function configureOpenAI(ctx: any, config: ToolbarConfig, onChange: () => void): Promise<void> {
	const modes: ToolbarConfig["codexDisplay"][] = ["used", "remaining"];
	await settingsMenu(ctx, "Vendor › OpenAI", () => {
		return [
			`Codex 5h: ${segmentMode(config, "codex5h")}`,
			`5h warning: ${config.codex5hWarning}%`,
			`5h error: ${config.codex5hError}%`,
			`Codex weekly: ${segmentMode(config, "codexWeekly")}`,
			`Weekly warning: ${config.codexWeeklyWarning}%`,
			`Weekly error: ${config.codexWeeklyError}%`,
			`Mode: ${config.codexDisplay}`,
		];
	}, (index, delta = 1) => {
		if (index === 0) cycleSegmentStyle(config, "codex5h", delta);
		else if (index === 1) config.codex5hWarning = bumpPercent(config.codex5hWarning, 5);
		else if (index === 2) config.codex5hError = bumpPercent(config.codex5hError, 5);
		else if (index === 3) cycleSegmentStyle(config, "codexWeekly", delta);
		else if (index === 4) config.codexWeeklyWarning = bumpPercent(config.codexWeeklyWarning, 5);
		else if (index === 5) config.codexWeeklyError = bumpPercent(config.codexWeeklyError, 5);
		else if (index === 6) config.codexDisplay = modes[(modes.indexOf(config.codexDisplay) + 1) % modes.length];
		onChange();
	}, (index) => {
		if (index === 0) toggleSegment(config, "codex5h");
		else if (index === 1) config.codex5hWarning = bumpPercent(config.codex5hWarning, -5);
		else if (index === 2) config.codex5hError = bumpPercent(config.codex5hError, -5);
		else if (index === 3) toggleSegment(config, "codexWeekly");
		else if (index === 4) config.codexWeeklyWarning = bumpPercent(config.codexWeeklyWarning, -5);
		else if (index === 5) config.codexWeeklyError = bumpPercent(config.codexWeeklyError, -5);
		onChange();
	});
}

async function configureVendor(ctx: any, config: ToolbarConfig, onChange: () => void): Promise<void> {
	await configureOpenAI(ctx, config, onChange);
}

function isCodexProvider(provider: string | undefined): boolean {
	return provider === "openai-codex" || /^openai-codex-\d+$/.test(provider ?? "");
}

export default function (pi: ExtensionAPI) {
	let config = loadConfig();
	let requestRender: (() => void) | undefined;
	let applyFooter: ((enabled: boolean) => void) | undefined;
	let refreshGitForActive: (() => void) | undefined;
	let refreshCodexForActive: (() => void) | undefined;

	pi.registerCommand("toolbar", {
		description: "Customize the bottom toolbar",
		handler: async (_args, ctx) => {
			const persist = () => { saveConfig(config); requestRender?.(); };
			type TopAction = "core" | "git" | "usage" | "vendor" | "alignment" | "toggle" | "close";
			let topIndex = 0;
			const topItems = (): { label: string; action: TopAction }[] => [
				{ label: "Core", action: "core" },
				{ label: "Git", action: "git" },
				{ label: "Usage", action: "usage" },
				{ label: "Vendor", action: "vendor" },
				{ label: "Alignment", action: "alignment" },
				{ label: `Custom toolbar: ${config.enabled ? "on" : "off"}`, action: "toggle" },
			];
			const chooseTop = async (): Promise<TopAction> => ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: (value: TopAction) => void) => ({
				invalidate() {},
				handleInput(data: string) {
					const items = topItems();
					if (matchesKey(data, Key.up) || data === "k") topIndex = Math.max(0, topIndex - 1);
					else if (matchesKey(data, Key.down) || data === "j") topIndex = Math.min(items.length - 1, topIndex + 1);
					else if (matchesKey(data, Key.enter) || data === " " || matchesKey(data, Key.right) || data === "l") done(items[topIndex].action);
					else if (matchesKey(data, Key.left) || data === "h" || matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) done("close");
					tui.requestRender();
				},
				render(width: number) {
					const lines = [theme.fg("accent", theme.bold("Toolbar")), theme.fg("dim", "↑↓/jk move • →/l enter • ←/h/esc close"), ""];
					topItems().forEach((item, i) => {
						const line = `${i === topIndex ? "›" : " "} ${item.label}`;
						const isOff = /:\s*disabled\b/.test(item.label);
						if (isOff) lines.push(theme.fg("dim", i === topIndex ? theme.bold(line) : line));
						else lines.push(i === topIndex ? theme.fg("accent", line) : line);
					});
					lines.push("");
					return lines.map((line) => truncateToWidth(line, width));
				},
			}));
			while (true) {
				const action = await chooseTop();
				if (action === "close") break;
				if (action === "core") await configureCore(ctx, config, persist);
				else if (action === "git") await configureGit(ctx, config, persist);
				else if (action === "usage") await configureUsage(ctx, config, persist);
				else if (action === "vendor") await configureVendor(ctx, config, persist);
				else if (action === "alignment") await alignElements(ctx, config, persist);
				else if (action === "toggle") {
					config.enabled = !config.enabled;
					applyFooter?.(config.enabled);
					persist();
				}
			}
			ctx.ui.notify("Toolbar updated", "info");
		},
	});

	pi.on("session_start", (_event, ctx) => {
		let git: GitStats = { added: 0, deleted: 0, dirty: false, ahead: 0, behind: 0, branchAdded: 0, branchDeleted: 0, worktreeCount: 0 };
		let codex: CodexUsage | undefined;
		let disposed = false;

		const parseNumstat = (stdout: string | undefined): { added: number; deleted: number } => {
			let added = 0, deleted = 0;
			for (const line of (stdout ?? "").trim().split("\n")) {
				if (!line) continue;
				const [a, d] = line.split("\t");
				const parsedAdded = Number.parseInt(a ?? "", 10);
				const parsedDeleted = Number.parseInt(d ?? "", 10);
				if (Number.isFinite(parsedAdded)) added += parsedAdded;
				if (Number.isFinite(parsedDeleted)) deleted += parsedDeleted;
			}
			return { added, deleted };
		};

		const refreshGit = async () => {
			const base = config.gitBase;
			const [branchResult, statusResult, workDiffResult, branchDiffResult, aheadBehindResult, topLevelResult, worktreeResult] = await Promise.all([
				pi.exec("git", ["branch", "--show-current"], { cwd: ctx.cwd }).catch(() => undefined),
				pi.exec("git", ["status", "--porcelain"], { cwd: ctx.cwd }).catch(() => undefined),
				pi.exec("git", ["diff", "--numstat", "HEAD"], { cwd: ctx.cwd }).catch(() => undefined),
				pi.exec("git", ["diff", "--numstat", `${base}...HEAD`], { cwd: ctx.cwd }).catch(() => undefined),
				pi.exec("git", ["rev-list", "--left-right", "--count", `${base}...HEAD`], { cwd: ctx.cwd }).catch(() => undefined),
				pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd: ctx.cwd }).catch(() => undefined),
				pi.exec("git", ["worktree", "list", "--porcelain"], { cwd: ctx.cwd }).catch(() => undefined),
			]);
			const workDiff = parseNumstat(workDiffResult?.stdout);
			const branchDiff = parseNumstat(branchDiffResult?.stdout);
			const [behindRaw, aheadRaw] = (aheadBehindResult?.stdout.trim() ?? "").split(/\s+/);
			const topLevel = topLevelResult?.stdout.trim();
			const worktreeCount = (worktreeResult?.stdout.match(/^worktree /gm) ?? []).length;
			git = {
				branch: branchResult?.stdout.trim() || undefined,
				added: workDiff.added,
				deleted: workDiff.deleted,
				dirty: Boolean(statusResult?.stdout.trim()),
				base: branchDiffResult ? base : undefined,
				ahead: Number.parseInt(aheadRaw ?? "", 10) || 0,
				behind: Number.parseInt(behindRaw ?? "", 10) || 0,
				branchAdded: branchDiff.added,
				branchDeleted: branchDiff.deleted,
				worktree: topLevel ? topLevel.split("/").filter(Boolean).pop() : undefined,
				worktreeCount,
			};
			requestRender?.();
		};

		const refreshCodex = async () => {
			if (!isCodexProvider(ctx.model?.provider)) { codex = undefined; requestRender?.(); return; }
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model).catch(() => undefined);
			if (!auth?.ok || !auth.apiKey) { codex = undefined; requestRender?.(); return; }
			const accountId = accountIdFromToken(auth.apiKey);
			const response = await fetch(`${CHATGPT_BASE_URL}/wham/usage`, {
				headers: { Authorization: `Bearer ${auth.apiKey}`, Accept: "application/json", "User-Agent": "pi-toolbar", ...(accountId ? { "chatgpt-account-id": accountId } : {}) },
				signal: AbortSignal.timeout(15000),
			}).catch(() => undefined);
			codex = response?.ok ? parseCodexUsage(await response.json()) : undefined;
			requestRender?.();
		};

		refreshGitForActive = () => void refreshGit();
		refreshCodexForActive = () => void refreshCodex();

		const paintSegment = (theme: any, footerData: any, segment: Segment): string | undefined => {
			if (disabledSegments(config).has(segment)) return undefined;
			const paint = (color: ColorName, text: string) => theme.fg(color, text);
			const diffText = (kind: "branch" | "work", sign: "+" | "-", value: number): string => {
				const prefix = kind === "branch" ? "Δ" : "w";
				if (config.gitDiffStyle === "symbols") return `${prefix}${sign}`;
				if (config.gitDiffStyle === "numbers") return `${prefix}${value}`;
				return `${prefix}${sign}${value}`;
			};
			switch (segment) {
				case "cwd": return paint(config.colors.cwd, ctx.cwd);
				case "gitBranch": return (git.branch || git.dirty) ? paint(config.colors.gitBranch, `${git.branch ?? "git"}${git.dirty ? "*" : ""}`) : undefined;
				case "gitWorktree": return git.worktree ? paint(config.colors.gitWorktree, `wt:${git.worktree}${git.worktreeCount > 1 ? `/${git.worktreeCount}` : ""}`) : undefined;
				case "gitAhead": {
					const parts: string[] = [];
					if (git.ahead) parts.push(paint("success", `↑${git.ahead}`));
					if (git.behind) parts.push(paint("warning", `↓${git.behind}`));
					return parts.length ? parts.join(" ") : undefined;
				}
				case "gitBranchDiff": {
					const parts: string[] = [];
					if (git.branchAdded) parts.push(paint("success", diffText("branch", "+", git.branchAdded)));
					if (git.branchDeleted) parts.push(paint("error", diffText("branch", "-", git.branchDeleted)));
					return parts.length ? parts.join(" ") : undefined;
				}
				case "gitWorkDiff": {
					const parts: string[] = [];
					if (git.added) parts.push(paint("success", diffText("work", "+", git.added)));
					if (git.deleted) parts.push(paint("error", diffText("work", "-", git.deleted)));
					return parts.length ? parts.join(" ") : undefined;
				}
				case "usage": return paint(config.colors.usage, usageText(ctx));
				case "cost": return paint(config.colors.cost, costText(ctx, config.costCurrency, config.usdToGbp));
				case "codex5h": { const p = codexPart("5h", codex?.fiveHour, config.codexDisplay); return p ? paint(percentColor(codex?.fiveHour?.usedPercent, config.colors.codex5h, config.codex5hWarning, config.codex5hError), p) : undefined; }
				case "codexWeekly": { const p = codexPart("weekly", codex?.weekly, config.codexDisplay); return p ? paint(percentColor(codex?.weekly?.usedPercent, config.colors.codexWeekly, config.codexWeeklyWarning, config.codexWeeklyError), p) : undefined; }
				case "context": { const c = contextText(ctx); return c.text ? paint(percentColor(c.percent, config.colors.context, config.contextWarning, config.contextError), c.text) : undefined; }
				case "model": return paint(config.colors.model, ctx.model?.id ?? "no-model");
				case "thinking": return paint(config.colors.thinking, `think ${pi.getThinkingLevel()}`);
				case "statuses": { const statuses = [...footerData.getExtensionStatuses().values()]; return statuses.length ? paint(config.colors.statuses, statuses.join(" ")) : undefined; }
			}
		};

		const installFooter = () => {
			disposed = false;
			ctx.ui.setFooter((tui, theme, footerData) => {
				requestRender = () => tui.requestRender();
				const unsub = footerData.onBranchChange(() => { void refreshGit(); tui.requestRender(); });
				return { dispose: () => { unsub(); disposed = true; }, invalidate() {}, render(width: number): string[] {
					if (disposed) return [""];
					const sep = theme.fg("dim", " · ");
					return layout(config).map((line) => {
						const left = line.left.map((s) => paintSegment(theme, footerData, s)).filter(Boolean).join(sep);
						const right = line.right.map((s) => paintSegment(theme, footerData, s)).filter(Boolean).join(sep);
						const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
						return truncateToWidth(left + pad + right, width);
					});
				} };
			});
		};

		applyFooter = (enabled: boolean) => enabled ? installFooter() : ctx.ui.setFooter(undefined);
		void refreshGit();
		void refreshCodex();
		applyFooter(config.enabled);
	});

	pi.on("tool_execution_end", () => refreshGitForActive?.());
	pi.on("tool_result", () => refreshGitForActive?.());
	pi.on("turn_end", () => { refreshGitForActive?.(); requestRender?.(); });
	pi.on("agent_end", () => { refreshGitForActive?.(); refreshCodexForActive?.(); requestRender?.(); });
	pi.on("model_select", () => refreshCodexForActive?.());
	pi.on("session_shutdown", () => { requestRender = undefined; refreshGitForActive = undefined; refreshCodexForActive = undefined; });
}
