/**
 * CycleMenu — shared menu primitive styled to match pi's base UI.
 *
 * Layout:
 *   ─── (border, accent)
 *   Title                                       <- optional, bold text token
 *   j/k row · h/l cycle value · / filter · …    <- shortcut row (key+desc)
 *   › <filter>                                   <- only when filter is on
 *
 *     name      prefix   value text             <- normal row
 *   › name      prefix   value text             <- selected row: full-width
 *                                                  selectedBg background
 *   ─── (border, accent)
 *
 * Behaviour:
 *  - j/k or ↑/↓ moves row, h/l or ←/→ cycles the highlighted row's value.
 *  - Enter commits via onCommit, Esc reverts via onCancel.
 *  - `/` enters filter mode; typing narrows visible rows by case-insensitive
 *    substring on row.name. Enter accepts filter and returns to nav; Esc
 *    clears filter and returns to nav.
 *
 * Rows are heterogeneous — pass a `paintPrefix` callback to render swatches
 * or icons in the (visible-width-padded) prefix column. Value text aligns
 * across rows regardless of whether a row has a prefix.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { libPrefs } from "./prefs.ts";

export type CycleRow = ValueRow | HeadingRow;

export type ValueRow = {
  kind?: "value";
  name: string;
  values: readonly string[];
  initialIndex: number;
  /**
   * Render the prefix cell (e.g. a coloured swatch). Receives the current
   * value; return a single line (may include ANSI escapes). When omitted,
   * the prefix is empty and padded to align with prefixed rows.
   */
  paintPrefix?: (value: string) => string;
};

/**
 * Non-selectable section divider rendered as bold heading text. Scrolling
 * and filter mode include heading rows; j/k navigation skips them. Useful
 * for grouping a long row list (the statusline menu uses this).
 */
export type HeadingRow = {
  kind: "heading";
  name: string;
};

function isHeading(r: CycleRow): r is HeadingRow {
  return r.kind === "heading";
}

export type CycleMenuHandlers = {
  /** Fires on every h/l cycle change before commit. */
  onPreview?: (idxs: readonly number[]) => void;
  /** Fires on Enter. Caller is responsible for closing the menu. */
  onCommit: (idxs: readonly number[]) => void;
  /** Fires on Esc. Caller is responsible for closing the menu. */
  onCancel: () => void;
  /**
   * Fires on Ctrl+R. Caller should reload its config from disk and call
   * `menu.reset(buildNewRows())` to re-sync the menu's rows + indices.
   */
  onReload?: () => void;
};

export type CycleMenuOptions = {
  /** Title rendered at the top of the menu in the `text` token, bold. */
  title?: string;
  /**
   * Max rows shown before the list scrolls. Falls back to
   * lib.json → menu.maxVisible, then to 10.
   */
  maxVisible?: number;
};

interface TUIHandle {
  requestRender(): void;
}

/**
 * Minimum surface we need from pi's theme. The proxy returned by pi has
 * all of these; using a structural type lets callers cast a single value
 * through. Exported so extensions don't redeclare it.
 */
export type MenuTheme = {
  fg(color: ThemeColor, text: string): string;
  bg(color: ThemeColor, text: string): string;
  bold(text: string): string;
};

// Token map chosen so menu chrome can be re-themed via omarchy-theme without
// dragging unrelated pi surfaces with it. Trade-offs:
//   TITLE        → customMessageLabel  (also drives pi custom-message labels;
//                                       also used for the shortcut separator
//                                       dots so they follow the title colour)
//   KEY          → customMessageText   (also drives pi custom-message body
//                                       text — drives via omarchy "menu
//                                       keymaps" CATEGORY)
//   DESC         → muted               (also drives muted/thinkingText/
//                                       mdQuote/syntaxPunctuation)
//   PROMPT       → dim                 (filter prompt + no-rows placeholder;
//                                       follows the statusline / dim token)
//   CURSOR       → accent
//   BORDER/BG    → border / selectedBg
const ACCENT: ThemeColor = "accent";
const TITLE: ThemeColor = "customMessageLabel";
const KEY: ThemeColor = "customMessageText";
const DESC: ThemeColor = "muted";
const PROMPT: ThemeColor = "dim";
const BORDER: ThemeColor = "border";
const SELECTED_BG: ThemeColor = "selectedBg";

type Mode = "nav" | "filter";

type Shortcut = { key: string; desc: string };

const NAV_SHORTCUTS: readonly Shortcut[] = [
  { key: "j/k", desc: "row" },
  { key: "h/l", desc: "cycle value" },
  { key: "/", desc: "filter" },
  { key: "^R", desc: "reload" },
  { key: "enter", desc: "commit" },
  { key: "esc", desc: "revert" },
];

const FILTER_SHORTCUTS: readonly Shortcut[] = [
  { key: "type", desc: "filter" },
  { key: "enter", desc: "accept" },
  { key: "esc", desc: "clear" },
];

function padVisible(text: string, target: number): string {
  return text + " ".repeat(Math.max(0, target - visibleWidth(text)));
}

export class CycleMenu implements Component {
  private row = 0;
  private idxs: number[];
  private originalIdxs: readonly number[];
  private mode: Mode = "nav";
  private filter = "";
  private scrollOffset = 0;
  private readonly maxVisible: number;
  /** Held in a private field so reset() can swap it without violating
   * `readonly` semantics seen by callers. */
  private rows: CycleRow[];

  constructor(
    rows: CycleRow[],
    private readonly theme: MenuTheme,
    private readonly tui: TUIHandle,
    private readonly handlers: CycleMenuHandlers,
    private readonly options: CycleMenuOptions = {},
  ) {
    this.rows = rows;
    // Heading rows occupy an idxs slot too (always 0) so positions stay
    // aligned with `rows[]`. They're skipped by j/k navigation.
    this.idxs = rows.map((r) => (isHeading(r) ? 0 : r.initialIndex));
    this.originalIdxs = [...this.idxs];
    this.maxVisible = Math.max(
      1,
      options.maxVisible ?? libPrefs().get().menu.maxVisible,
    );
    // Land the cursor on the first selectable row (skip leading headings).
    const visible = this.visibleRows();
    this.row = visible.findIndex((i) => !isHeading(this.rows[i]!));
    if (this.row < 0) this.row = 0;
  }

  /**
   * Keep the cursor visually centred in the window. Pulls back to a top
   * or bottom anchor when the list end is closer than the centre would
   * otherwise allow.
   */
  private adjustScroll(visibleCount: number): void {
    const max = this.maxVisible;
    const centre = Math.floor(max / 2);
    const maxOffset = Math.max(0, visibleCount - max);
    this.scrollOffset = Math.max(0, Math.min(this.row - centre, maxOffset));
  }

  invalidate(): void {}

  indexes(): readonly number[] {
    return this.idxs;
  }

  /**
   * Replace the row list (and reset cursor/scroll/filter to defaults).
   * Used by Ctrl+R hot-reload: the host re-reads its config and feeds the
   * freshly-built rows here so menu state catches up with disk state.
   * Resets `originalIdxs` too, so a subsequent Esc reverts to the just-
   * reloaded disk state rather than the pre-reload snapshot.
   */
  reset(newRows: CycleRow[]): void {
    this.rows = newRows;
    this.idxs = newRows.map((r) => (isHeading(r) ? 0 : r.initialIndex));
    this.originalIdxs = [...this.idxs];
    this.filter = "";
    this.mode = "nav";
    this.scrollOffset = 0;
    const visible = this.visibleRows();
    this.row = visible.findIndex((i) => !isHeading(this.rows[i]!));
    if (this.row < 0) this.row = 0;
    this.tui.requestRender();
  }

  private visibleRows(): number[] {
    if (!this.filter) return this.rows.map((_, i) => i);
    const q = this.filter.toLowerCase();
    const out: number[] = [];
    this.rows.forEach((r, i) => {
      if (r.name.toLowerCase().includes(q)) out.push(i);
    });
    return out;
  }

  private renderShortcuts(list: readonly Shortcut[]): string {
    // Separator dots follow the desc token so they read together with the
    // shortcut descriptions rather than the bolder title.
    const sep = this.theme.fg(DESC, " · ");
    return list
      .map(
        ({ key, desc }) =>
          `${this.theme.fg(KEY, key)} ${this.theme.fg(DESC, desc)}`,
      )
      .join(sep);
  }

  render(width: number): string[] {
    const visible = this.visibleRows();
    const visibleRowObjs = visible.map((i) => this.rows[i]!);
    const totalVisible = visibleRowObjs.length;

    // Clamp scroll to keep selected row in window before slicing for render.
    this.adjustScroll(totalVisible);
    const sliceStart = this.scrollOffset;
    const sliceEnd = Math.min(sliceStart + this.maxVisible, totalVisible);
    const sliceIdx = visible.slice(sliceStart, sliceEnd);
    const sliceObjs = sliceIdx.map((i) => this.rows[i]!);

    // Column widths are computed from the FULL filtered list of VALUE rows
    // (headings excluded) so headings don't widen columns and the value
    // column doesn't shift when scrolling reveals shorter rows.
    const valueRowsVisible = visibleRowObjs.filter(
      (r): r is ValueRow => !isHeading(r),
    );
    const nameW = Math.max(0, ...valueRowsVisible.map((r) => r.name.length));
    const allPrefixes = visibleRowObjs.map((r, j) => {
      if (isHeading(r) || !r.paintPrefix) return "";
      const v = r.values[this.idxs[visible[j]!]!]!;
      return r.paintPrefix(v);
    });
    const prefixW = Math.max(0, ...allPrefixes.map(visibleWidth));
    const valueW = Math.max(
      0,
      ...valueRowsVisible.map((r) =>
        Math.max(0, ...r.values.map((v) => v.length)),
      ),
    );
    const slicePrefixes = allPrefixes.slice(sliceStart, sliceEnd);

    const border = this.theme.fg(BORDER, "─".repeat(Math.max(1, width)));
    const lines: string[] = [border];

    if (this.options.title) {
      lines.push(
        `  ${this.theme.bold(this.theme.fg(TITLE, this.options.title))}`,
      );
    }

    lines.push(
      `  ${this.renderShortcuts(
        this.mode === "filter" ? FILTER_SHORTCUTS : NAV_SHORTCUTS,
      )}`,
    );

    if (this.mode === "filter" || this.filter) {
      const prompt =
        this.mode === "filter"
          ? this.theme.fg(ACCENT, "›")
          : this.theme.fg(PROMPT, "/");
      const filterText =
        this.mode === "filter"
          ? this.theme.fg(KEY, this.filter)
          : this.theme.fg(PROMPT, this.filter);
      lines.push(`  ${prompt} ${filterText}`);
    }

    lines.push("");

    if (!totalVisible) {
      lines.push(this.theme.fg(PROMPT, "  (no rows match filter)"));
    } else {
      sliceObjs.forEach((r, k) => {
        const j = sliceStart + k;
        if (isHeading(r)) {
          // Bold, accent-coloured. No cursor, no value column.
          lines.push(
            truncateToWidth(
              `  ${this.theme.bold(this.theme.fg(TITLE, r.name))}`,
              width,
            ),
          );
          return;
        }
        const rowIdx = sliceIdx[k]!;
        const selected = j === this.row && this.mode === "nav";
        const cursor = selected ? this.theme.fg(ACCENT, "›") : " ";
        const namePad = padVisible(r.name, nameW);
        const prefix =
          prefixW > 0 ? padVisible(slicePrefixes[k]!, prefixW) : "";
        const value = r.values[this.idxs[rowIdx]!]!;
        const valuePad = padVisible(value, valueW);
        const prefixCol = prefixW > 0 ? `${prefix}  ` : "";
        const content = `  ${cursor} ${namePad}  ${prefixCol}${valuePad}`;
        if (selected) {
          lines.push(this.theme.bg(SELECTED_BG, padVisible(content, width)));
        } else {
          lines.push(truncateToWidth(content, width));
        }
      });
      // Counter — shown only when scrolling or filtered. Matches pi's
      // /settings convention: (visible-end/total) for plain truncation,
      // (start-end/total) when we're not anchored to the top.
      if (totalVisible > this.maxVisible || this.filter) {
        const counter =
          sliceStart === 0
            ? `(${sliceEnd}/${totalVisible})`
            : `(${sliceStart + 1}-${sliceEnd}/${totalVisible})`;
        lines.push(`  ${this.theme.fg(PROMPT, counter)}`);
      }
    }

    lines.push("");
    lines.push(border);
    return lines;
  }

  handleInput(data: string): void {
    if (this.mode === "filter") {
      this.handleFilterInput(data);
      return;
    }
    if (data === "/") {
      this.mode = "filter";
      this.row = 0; this.scrollOffset = 0;
      this.tui.requestRender();
      return;
    }
    if (data === "\x12") {
      // Ctrl+R — caller reloads its config and calls menu.reset() with
      // fresh rows. The handler is responsible for both steps.
      this.handlers.onReload?.();
      return;
    }
    const visible = this.visibleRows();
    if (!visible.length) {
      if (data === "\x1b") {
        this.idxs = [...this.originalIdxs];
        this.handlers.onPreview?.(this.idxs);
        this.handlers.onCancel();
      }
      return;
    }
    const navStep = (dir: 1 | -1) => {
      const total = visible.length;
      for (let step = 1; step <= total; step++) {
        const candidate = (this.row + step * dir + total) % total;
        if (!isHeading(this.rows[visible[candidate]!]!)) {
          this.row = candidate;
          return;
        }
      }
    };
    const rowIdx = visible[this.row]!;
    const currentRow = this.rows[rowIdx]!;
    if (data === "j" || data === "\x1b[B") {
      navStep(1);
      this.tui.requestRender();
    } else if (data === "k" || data === "\x1b[A") {
      navStep(-1);
      this.tui.requestRender();
    } else if (data === "h" || data === "\x1b[D") {
      if (isHeading(currentRow)) return;
      const len = currentRow.values.length;
      this.idxs[rowIdx] = (this.idxs[rowIdx]! - 1 + len) % len;
      this.handlers.onPreview?.(this.idxs);
      this.tui.requestRender();
    } else if (data === "l" || data === "\x1b[C") {
      if (isHeading(currentRow)) return;
      const len = currentRow.values.length;
      this.idxs[rowIdx] = (this.idxs[rowIdx]! + 1) % len;
      this.handlers.onPreview?.(this.idxs);
      this.tui.requestRender();
    } else if (data === "\r" || data === "\n") {
      this.handlers.onCommit(this.idxs);
    } else if (data === "\x1b") {
      this.idxs = [...this.originalIdxs];
      this.handlers.onPreview?.(this.idxs);
      this.handlers.onCancel();
    }
  }

  private handleFilterInput(data: string): void {
    if (data === "\x1b") {
      this.filter = "";
      this.mode = "nav";
      this.row = 0; this.scrollOffset = 0;
      this.tui.requestRender();
    } else if (data === "\r" || data === "\n") {
      this.mode = "nav";
      this.row = 0; this.scrollOffset = 0;
      this.tui.requestRender();
    } else if (data === "\x7f" || data === "\b") {
      this.filter = this.filter.slice(0, -1);
      this.row = 0; this.scrollOffset = 0;
      this.tui.requestRender();
    } else if (data.length === 1 && data >= " " && data <= "~") {
      this.filter += data;
      this.row = 0; this.scrollOffset = 0;
      this.tui.requestRender();
    }
  }
}
