/**
 * Tabs — composable tab strip + per-tab body, designed to sit inside a
 * Modal. Renders a tab bar across the top, then delegates body painting
 * to the active tab. Each tab carries its own `ModalKey[]`; combine
 * those with `tabsNavKeys(tabs)` and feed into Modal's `keys` (use the
 * function form so the bar tracks the active tab's bindings).
 *
 * Tab/Shift+Tab cycle the active tab. Bodies are passive Components,
 * same contract as Modal — interactivity goes through `keys`.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { type Component, matchesKey } from "@earendil-works/pi-tui";
import type { MenuTheme } from "./cycle-menu.ts";
import type { ModalBodyContext, ModalKey } from "./modal.ts";

export type Tab = {
  /** Label shown in the tab strip. */
  label: string;
  /** Body painted when this tab is active. Passive Component. */
  body: Component;
  /**
   * Optional bindings active only while this tab is selected. Function
   * form is re-evaluated on every dispatch and every shortcut-bar
   * paint, letting bodies expose state-dependent bindings (e.g. drill
   * vs back, select vs scroll) without re-registering.
   */
  keys?: readonly ModalKey[] | (() => readonly ModalKey[]);
};

// Same chrome tokens as cycle-menu / modal. Active tab inverts via
// SELECTED_BG so it pops against the modal border.
const ACTIVE: ThemeColor = "customMessageLabel";
const INACTIVE: ThemeColor = "muted";
const SELECTED_BG: ThemeColor = "selectedBg";

export class Tabs implements Component {
  private active = 0;

  constructor(
    private readonly tabs: readonly Tab[],
    private readonly mctx: ModalBodyContext,
  ) {}

  invalidate(): void {
    this.tabs[this.active]?.body.invalidate();
  }

  getActiveIndex(): number {
    return this.active;
  }

  getActiveTab(): Tab | undefined {
    return this.tabs[this.active];
  }

  getActiveKeys(): readonly ModalKey[] {
    const k = this.tabs[this.active]?.keys;
    if (!k) return [];
    return typeof k === "function" ? k() : k;
  }

  next(): void {
    this.switchTo((this.active + 1) % this.tabs.length);
  }

  prev(): void {
    this.switchTo((this.active - 1 + this.tabs.length) % this.tabs.length);
  }

  switchTo(i: number): void {
    if (i < 0 || i >= this.tabs.length) return;
    this.active = i;
    this.mctx.scrollTo(0);
    this.mctx.requestRender();
  }

  render(width: number): string[] {
    const theme = this.mctx.theme;
    const lines: string[] = [];
    lines.push(this.renderStrip(theme));
    lines.push("");
    const body = this.tabs[this.active]?.body;
    if (body) lines.push(...body.render(width));
    return lines;
  }

  private renderStrip(theme: MenuTheme): string {
    const cells = this.tabs.map((tab, i) => {
      const label = ` ${tab.label} `;
      if (i === this.active) {
        return theme.bg(SELECTED_BG, theme.bold(theme.fg(ACTIVE, label)));
      }
      return theme.fg(INACTIVE, label);
    });
    return cells.join(" ");
  }
}

/**
 * Standard Tab / Shift+Tab cycling. Combine with each tab's own keys
 * via Modal's function-form `keys`:
 *
 *   keys: () => [...tabsNavKeys(tabs), ...tabs.getActiveKeys(), ...closeKey],
 */
export function tabsNavKeys(tabs: Tabs): readonly ModalKey[] {
  // Use the SDK matcher so kitty / modifyOtherKeys / legacy CSI Z all
  // resolve correctly. Hardcoding "\x1b[Z" misses kitty-protocol
  // terminals (Ghostty, Kitty, recent Wezterm) where shift+tab arrives
  // as a CSI u sequence instead.
  return [
    {
      key: "tab",
      desc: "next tab",
      match: (d) => matchesKey(d, "tab"),
      action: () => {
        tabs.next();
      },
    },
    {
      key: "⇧tab",
      desc: "prev tab",
      match: (d) => matchesKey(d, "shift+tab"),
      action: () => {
        tabs.prev();
      },
    },
  ];
}
