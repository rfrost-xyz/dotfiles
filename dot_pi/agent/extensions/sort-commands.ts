import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type AutocompleteItem = {
	value?: string;
	label?: string;
	description?: string;
	[key: string]: unknown;
};

type Suggestions = {
	prefix?: string;
	items?: AutocompleteItem[];
	[key: string]: unknown;
};

type Group = "base" | "custom" | "installed";

type RankedItem = {
	item: AutocompleteItem;
	group: Group;
	packageName: string;
	commandName: string;
	index: number;
};

const GROUP_ORDER: Record<Group, number> = {
	base: 0,
	custom: 1,
	installed: 2,
};

function commandName(item: AutocompleteItem): string {
	return String(item.label ?? item.value ?? "").replace(/^\//, "");
}

function sourceTag(item: AutocompleteItem): string | undefined {
	return String(item.description ?? "").match(/^\[([^\]]+)\]/)?.[1];
}

function classify(item: AutocompleteItem): { group: Group; packageName: string } {
	const tag = sourceTag(item);

	// Built-in Pi commands currently have no source tag in their description.
	if (!tag) return { group: "base", packageName: "" };

	// Installed package resources are tagged like:
	//   [u:npm:pi-subagents]
	//   [p:npm:@scope/pkg]
	//   [u:git:github.com/user/repo]
	const npm = tag.match(/^[upt]:npm:(.+)$/);
	if (npm) return { group: "installed", packageName: `npm:${npm[1]}` };

	const git = tag.match(/^[upt]:git:(.+)$/);
	if (git) return { group: "installed", packageName: `git:${git[1]}` };

	// Local user/project resources are "my custom commands".
	return { group: "custom", packageName: tag };
}

function rank(item: AutocompleteItem, index: number): RankedItem {
	const classified = classify(item);
	return {
		item,
		group: classified.group,
		packageName: classified.packageName.toLocaleLowerCase(),
		commandName: commandName(item).toLocaleLowerCase(),
		index,
	};
}

function compareRanked(a: RankedItem, b: RankedItem): number {
	return (
		GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
		a.packageName.localeCompare(b.packageName, undefined, { sensitivity: "base" }) ||
		a.commandName.localeCompare(b.commandName, undefined, { sensitivity: "base" }) ||
		a.index - b.index
	);
}

function isSlashCommandCompletion(lines: string[], cursorLine: number, cursorCol: number, suggestions: Suggestions): boolean {
	const line = lines[cursorLine] ?? "";
	const beforeCursor = line.slice(0, cursorCol);
	return /^\/[\w:-]*$/.test(beforeCursor) || String(suggestions.prefix ?? "").startsWith("/");
}

export default function sortSlashCommands(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) => ({
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const suggestions = (await current.getSuggestions(lines, cursorLine, cursorCol, options)) as Suggestions | null;
				if (!suggestions?.items || !isSlashCommandCompletion(lines, cursorLine, cursorCol, suggestions)) {
					return suggestions;
				}

				return {
					...suggestions,
					items: suggestions.items
						.map(rank)
						.sort(compareRanked)
						.map((ranked) => ranked.item),
				};
			},

			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},

			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		}));
	});
}
