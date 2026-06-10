/**
 * Tabbed-page primitive.
 *
 * Mirrors Claude Code's Status / Config / Usage / Stats top bar. Each tab
 * declares an `id`, a `label`, and a `build(theme, close)` factory that
 * returns the body Component. Switch between tabs with Tab / Shift+Tab
 * or number keys 1-9. The currently-active tab's body receives all other
 * keyboard input; switching tabs rebuilds the body (cheap — no live
 * state lives in the tab, lives in the data it renders).
 *
 * Intended as a shared layout primitive across pi-ux pages: hub, future
 * statusline overview, future metrics dashboard, etc. Drop-in
 * `Component`, so works anywhere `ctx.ui.custom` does.
 *
 * Lazy tab bodies: the body Component is built on first activation and
 * cached for the lifetime of the TabsView. Switching back to a tab reuses
 * the previous instance (keeps cursor positions, etc.). Pass
 * `lazy: false` to eagerly build all tabs up-front.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { type ThemeFg } from "./theme.ts";
import { getHighlightColor } from "./ui-config.ts";

export type Tab = {
  id: string;
  label: string;
  /**
   * Build the body Component for this tab. Receives the live theme and a
   * close callback that should exit the entire tabs container (not just
   * this tab).
   */
  build: (theme: ThemeFg, close: () => void) => Component;
};

export type TabsKeys = {
  /** Keys that advance to the next tab. Default: ["\t"] (Tab). */
  next?: string[];
  /** Keys that go to the previous tab. Default: ["\x1b[Z"] (Shift+Tab). */
  prev?: string[];
  /** If true, "1"–"9" jump to that tab index. Default true for outer
   *  tabs, false for nested instances. */
  numericJump?: boolean;
};

export type TabsOptions = {
  /** Tab id to open initially. Defaults to the first tab. */
  initial?: string;
  /** If false, eagerly build every tab on construction. Default true. */
  lazy?: boolean;
  keys?: TabsKeys;
  /** Hint text rendered in the tab bar's right-hand corner. */
  hint?: string;
};

export class TabsView implements Component {
  private current: number;
  private bodies = new Map<string, Component>();
  private highlight: ThemeColor;
  private readonly nextKeys: string[];
  private readonly prevKeys: string[];
  private readonly numericJump: boolean;
  private readonly hint: string;

  constructor(
    private readonly tabs: Tab[],
    private readonly theme: ThemeFg & {
      fg(color: ThemeColor, text: string): string;
    },
    private readonly close: () => void,
    options: TabsOptions = {},
  ) {
    if (!tabs.length) throw new Error("TabsView requires at least one tab");
    const initialIndex =
      options.initial && tabs.findIndex((t) => t.id === options.initial);
    this.current =
      typeof initialIndex === "number" && initialIndex >= 0 ? initialIndex : 0;
    this.highlight = getHighlightColor();
    this.nextKeys = options.keys?.next ?? ["\t"];
    this.prevKeys = options.keys?.prev ?? ["\x1b[Z"];
    this.numericJump = options.keys?.numericJump ?? true;
    this.hint =
      options.hint ??
      `${this.nextKeys[0] === "\t" ? "⇥" : this.nextKeys[0]} next · ${
        this.prevKeys[0] === "\x1b[Z" ? "⇧⇥" : this.prevKeys[0]
      } prev${this.numericJump ? " · 1-9 jump" : ""}`;
    if (options.lazy === false) {
      for (const t of tabs) this.bodies.set(t.id, t.build(theme, close));
    }
  }

  private activeTab(): Tab {
    return this.tabs[this.current];
  }

  private activeBody(): Component {
    const tab = this.activeTab();
    let body = this.bodies.get(tab.id);
    if (!body) {
      body = tab.build(this.theme, this.close);
      this.bodies.set(tab.id, body);
    }
    return body;
  }

  /** Currently-active tab id. */
  get activeId(): string {
    return this.activeTab().id;
  }

  /** Programmatically switch to a tab. No-op for unknown ids. */
  selectTab(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx >= 0) this.current = idx;
  }

  invalidate(): void {
    this.bodies.forEach((b) => b.invalidate());
  }

  handleInput(data: string): void {
    const body = this.activeBody();
    const bodyHasHandler = typeof body.handleInput === "function";

    // Explicit tab keys (Tab / Shift+Tab) ALWAYS switch — never conflict
    // with menu input.
    if (this.nextKeys.includes(data)) {
      this.current = (this.current + 1) % this.tabs.length;
      return;
    }
    if (this.prevKeys.includes(data)) {
      this.current = (this.current - 1 + this.tabs.length) % this.tabs.length;
      return;
    }

    // When the body is static (no input handler), accept richer nav keys
    // and let Esc close the whole tabs view. Menu bodies (SettingsList)
    // get those keys forwarded so cycling / Esc-back works inside them.
    if (!bodyHasHandler) {
      // arrows + h/l switch tabs on static screens
      if (data === "\x1b[C" || data === "l") {
        this.current = (this.current + 1) % this.tabs.length;
        return;
      }
      if (data === "\x1b[D" || data === "h") {
        this.current = (this.current - 1 + this.tabs.length) % this.tabs.length;
        return;
      }
      // numeric jump on static screens
      if (
        this.numericJump &&
        data.length === 1 &&
        data >= "1" &&
        data <= "9"
      ) {
        const idx = Number.parseInt(data, 10) - 1;
        if (idx < this.tabs.length) {
          this.current = idx;
          return;
        }
      }
      // Esc / Ctrl+C: static body can't catch these — close instead.
      if (data === "\x1b" || data === "\x03") {
        this.close();
        return;
      }
      return; // static body ignores everything else
    }

    // Body has its own input handler — forward (its onCancel handles Esc,
    // its wrapWithBorders handles h/l for cycle, etc.).
    body.handleInput?.(data);
  }

  render(width: number): string[] {
    return [this.renderTabBar(width), "", ...this.activeBody().render(width)];
  }

  private renderTabBar(width: number): string {
    const parts: string[] = [];
    let visibleLen = 2; // leading "  "
    for (let i = 0; i < this.tabs.length; i++) {
      const label = this.tabs[i].label;
      const padded = ` ${label} `;
      if (i === this.current) {
        // Active tab: solid box via reverse-video painted in the highlight
        // colour. Inner padding gives it the spaced-block look from the
        // mockup; reverse-video swaps fg↔bg so the accent fills the cell
        // and the label is rendered in the terminal background colour.
        parts.push(`\x1b[7m${this.theme.fg(this.highlight, padded)}\x1b[27m`);
      } else {
        parts.push(this.theme.fg("dim", padded));
      }
      visibleLen += padded.length;
      if (i < this.tabs.length - 1) visibleLen += 1; // single-space gap
    }
    const hint = this.theme.fg("dim", this.hint);
    const line = `  ${parts.join(" ")}`;
    const hintLen = this.hint.length;
    return visibleLen + hintLen + 4 < width
      ? `${line}${" ".repeat(Math.max(0, width - visibleLen - hintLen - 2))}${hint}`
      : line;
  }
}
