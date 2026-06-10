/**
 * SettingsList navigation helpers.
 *
 * - activeList walks a chain of submenuComponent properties to find the
 *   deepest live SettingsList.
 * - cycleCurrent rotates the highlighted item's value by ±1 (used to bind
 *   h/l keys onto pi's stock SettingsList).
 * - wrapWithBorders composes a SettingsList Component with top + bottom
 *   horizontal rules, matching pi's own /settings appearance.
 */

import type { Component, SettingItem } from "@earendil-works/pi-tui";
import type { ThemeFg } from "./theme.ts";

type SettingsListInternals = {
  selectedIndex: number;
  items: SettingItem[];
  onChange: (id: string, value: string) => void;
  submenuComponent: Component | null;
};

export function activeList(list: Component): Component {
  const sub = (list as unknown as { submenuComponent?: Component | null })
    .submenuComponent;
  return sub ? activeList(sub) : list;
}

export function cycleCurrent(list: Component, direction: 1 | -1): void {
  const a = activeList(list) as unknown as SettingsListInternals;
  if (!a.items || typeof a.selectedIndex !== "number") return;
  const item = a.items[a.selectedIndex];
  if (!item?.values || item.values.length < 2) return;
  const cur = item.values.indexOf(item.currentValue);
  const next = (cur + direction + item.values.length) % item.values.length;
  item.currentValue = item.values[next];
  a.onChange(item.id, item.values[next]);
}

/**
 * Wrap a SettingsList (or any Component) with horizontal rules above and
 * below, intercepting h/l / arrow-left / arrow-right to cycle values on the
 * currently-active SettingsList. Forwards everything else to the wrapped
 * component.
 */
export function wrapWithBorders(
  inner: Component,
  theme: ThemeFg,
): Component {
  return {
    render(width: number): string[] {
      const sep = theme.fg("border", "─".repeat(Math.max(1, width)));
      return [sep, ...inner.render(width), sep];
    },
    invalidate: () => inner.invalidate(),
    handleInput: (data: string) => {
      const a = activeList(inner) as unknown as {
        items?: unknown;
        selectedIndex?: unknown;
      };
      const looksLikeSettingsList =
        typeof a.selectedIndex === "number" && Array.isArray(a.items);
      if (looksLikeSettingsList) {
        if (data === "h" || data === "\x1b[D") return cycleCurrent(inner, -1);
        if (data === "l" || data === "\x1b[C") return cycleCurrent(inner, 1);
      }
      return inner.handleInput?.(data);
    },
  };
}
