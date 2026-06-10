/**
 * Modal — overlay primitive sharing CycleMenu's chrome (bordered, title +
 * shortcut bar) but without the row-cycle semantics. Hosts a passive
 * `Component` as its body and provides:
 *
 *   - chrome: full hairline box border in borderAccent (┌─┐│└─┘),
 *     inset blank line, title in TITLE, shortcut row in KEY + DESC,
 *     blank separator, then body. Modal owns ALL padding: 1 column of
 *     border + 2 columns of inner pad on each side, so bodies receive
 *     `width - 6` and emit lines without their own gutter.
 *   - input via `keys[]` only. Bodies are passive renderers — Modal
 *     never calls `body.handleInput`. All interactivity (selection,
 *     drill-in, refresh, etc.) is declared as `ModalKey` entries; their
 *     actions mutate body state and call `mctx.requestRender()`. The
 *     shortcut bar lists `keys[]` in order; this is the single source of
 *     truth for what's bound.
 *   - built-in defaults: Esc-close, j/k or ↑/↓ scroll, PgUp/Dn, Home/End.
 *     Each is skipped when a caller-provided key matches the same input
 *     data, and its shortcut-bar hint is hidden in that case — the bar
 *     never contradicts the live bindings.
 *
 * Slice contract: Modal calls `body.render(innerWidth)` every paint
 * where `innerWidth = width - 6`. Bodies emit lines of that width
 * without any gutter — Modal adds the `│  ` left frame and `  │` right
 * frame. Selection-bg highlights span only the inner content area, not
 * the modal frame.
 *
 * Body construction is lazy: `openModal` passes a `ModalBodyContext` into
 * the build callback, exposing `tui`, `theme`, `close()`, scroll control,
 * and `requestRender()`. The body captures these to drive itself.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type OverlayOptions,
  truncateToWidth,
  type TUI,
} from "@earendil-works/pi-tui";
import type { MenuTheme } from "./cycle-menu.ts";
import { libPrefs } from "./prefs.ts";

// Kept in step with cycle-menu.ts so the two surfaces re-theme together
// when omarchy-theme drives the menu chrome category. If you split these
// out to a shared lib later, update both files at the same time. Note
// the border token diverges from CycleMenu's: a modal sits *over* chat
// content and needs the stronger borderAccent to read as separate.
const ACCENT: ThemeColor = "accent";
const TITLE: ThemeColor = "customMessageLabel";
const KEY: ThemeColor = "customMessageText";
const DESC: ThemeColor = "muted";
const PROMPT: ThemeColor = "dim";
const BORDER: ThemeColor = "borderAccent";

interface TUIHandle {
  requestRender(): void;
}

/** Surface exposed to body factories + key actions. */
export type ModalBodyContext = {
  tui: TUIHandle;
  theme: MenuTheme;
  /** Dismiss the modal. Safe to call from a key action. */
  close(): void;
  /** Move the body viewport by `delta` rows (positive = down). Clamped. */
  scrollBy(delta: number): void;
  /** Jump the body viewport to row `row` (clamped). */
  scrollTo(row: number): void;
  /** Current body row visible at the top of the viewport. */
  getScrollOffset(): number;
  /** Number of body rows visible in the viewport. */
  getMaxBodyRows(): number;
  /** Request a re-render after mutating body state. */
  requestRender(): void;
};

export type ModalKey = {
  /** Display label, e.g. "d", "enter". */
  key: string;
  /**
   * Shortcut-bar description. Function form is re-evaluated each paint
   * so bindings whose meaning changes with view state (e.g. "back" vs
   * "close" for esc) can stay accurate without re-registering.
   */
  desc: string | (() => string);
  /** Match against raw input data (the same `data` Component#handleInput sees). */
  match: (data: string) => boolean;
  /**
   * Return "close" to dismiss the modal after the action runs. `data` is
   * the matched input so a single entry can dispatch on direction
   * (e.g. j vs k) without registering twice.
   */
  action: (mctx: ModalBodyContext, data: string) => "close" | void;
};

export type ModalDefinition = {
  title?: string;
  body: Component;
  /**
   * Caller's key bindings. Function form is re-evaluated on every input
   * dispatch and every shortcut-bar paint, so callers composing
   * tab-aware or state-aware bindings (e.g. swapping between an
   * overview tab's keys and a breakdown tab's keys) can keep both the
   * dispatcher and the bar accurate without re-registering.
   */
  keys?: readonly ModalKey[] | (() => readonly ModalKey[]);
  /**
   * Max body lines visible before the viewport scrolls. Falls back to
   * `libPrefs().get().menu.maxVisible * 2`, then to 18.
   */
  maxBodyRows?: number;
};

const DEFAULT_OVERLAY: OverlayOptions = {
  anchor: "center",
  width: "70%",
  minWidth: 60,
  // External margin sets the minimum gap between modal and terminal
  // edges. Two-row top/bottom gap means we use almost the full height
  // for content on short terminals where every row counts.
  margin: { top: 2, bottom: 2, left: 0, right: 0 },
};

// Built-in shortcut hints. Each is suppressed when the same input data is
// claimed by a caller-provided `ModalKey`, so the bar never lists a key
// that doesn't actually fire its built-in.
const ESC_DATA = "\x1b";
const SCROLL_DOWN_DATA = ["j", "\x1b[B"];
const SCROLL_UP_DATA = ["k", "\x1b[A"];
const PAGE_DOWN_DATA = "\x1b[6~";
const PAGE_UP_DATA = "\x1b[5~";
const HOME_DATA = "\x1b[H";
const END_DATA = "\x1b[F";

export class Modal implements Component {
  private scrollOffset = 0;
  private bodyLines: string[] = [];
  private closed = false;
  private readonly maxBodyRows: number;

  constructor(
    private readonly def: ModalDefinition,
    private readonly theme: MenuTheme,
    private readonly tui: TUIHandle,
    /** Invoked when the modal dismisses; the caller resolves `ctx.ui.custom`. */
    private readonly onClose: () => void,
  ) {
    this.maxBodyRows = Math.max(
      1,
      def.maxBodyRows ?? libPrefs().get().menu.maxVisible * 2,
    );
  }

  invalidate(): void {
    this.def.body.invalidate?.();
  }

  /** Public surface for keys + body. */
  scrollBy(delta: number): void {
    this.scrollTo(this.scrollOffset + delta);
  }

  scrollTo(row: number): void {
    const max = Math.max(0, this.bodyLines.length - this.maxBodyRows);
    this.scrollOffset = Math.max(0, Math.min(row, max));
    this.tui.requestRender();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }

  getScrollOffset(): number {
    return this.scrollOffset;
  }

  getMaxBodyRows(): number {
    return this.maxBodyRows;
  }

  private currentKeys(): readonly ModalKey[] {
    const k = this.def.keys;
    if (!k) return [];
    return typeof k === "function" ? k() : k;
  }

  private anyKeyMatches(data: string): boolean {
    return this.currentKeys().some((k) => k.match(data));
  }

  private buildShortcutRow(): string {
    const sep = this.theme.fg(DESC, " · ");
    const hints: { key: string; desc: string }[] = [];

    const scrollDownOverridden = SCROLL_DOWN_DATA.some((d) =>
      this.anyKeyMatches(d),
    );
    const scrollUpOverridden = SCROLL_UP_DATA.some((d) =>
      this.anyKeyMatches(d),
    );
    if (!scrollDownOverridden && !scrollUpOverridden) {
      hints.push({ key: "j/k", desc: "scroll" });
    }

    for (const k of this.currentKeys()) {
      const desc = typeof k.desc === "function" ? k.desc() : k.desc;
      // Empty desc = caller signals the binding isn't active in the
      // current state. Skip the hint so the bar doesn't grow stale
      // entries while state-dependent keys are masked.
      if (!desc) continue;
      hints.push({ key: k.key, desc });
    }

    if (!this.anyKeyMatches(ESC_DATA)) {
      hints.push({ key: "esc", desc: "close" });
    }

    return hints
      .map(
        ({ key, desc }) =>
          `${this.theme.fg(KEY, key)} ${this.theme.fg(DESC, desc)}`,
      )
      .join(sep);
  }

  render(width: number): string[] {
    // Box border + symmetric inner padding. Modal owns all padding so
    // every body / chrome row reads with the same gutters:
    //
    //   │  <content area, width = innerWidth>  │
    //
    // Border (1 col) + pad (2 cols) on each side → innerWidth = W - 6.
    // Bodies emit lines of that width with no gutter of their own;
    // Modal wraps them.
    const w = Math.max(8, width);
    const innerWidth = Math.max(1, w - 6);
    const sideBar = this.theme.fg(BORDER, "│");
    const pad = "  ";
    const fitInner = (line: string) =>
      truncateToWidth(line, innerWidth, "", true);
    const wrap = (line: string) =>
      `${sideBar}${pad}${fitInner(line)}${pad}${sideBar}`;
    const blank = wrap("");

    this.bodyLines = this.def.body.render(innerWidth);
    const total = this.bodyLines.length;
    const max = Math.max(0, total - this.maxBodyRows);
    if (this.scrollOffset > max) this.scrollOffset = max;

    const sliceStart = this.scrollOffset;
    const sliceEnd = Math.min(sliceStart + this.maxBodyRows, total);
    const slice = this.bodyLines.slice(sliceStart, sliceEnd);

    const topBorder = this.theme.fg(
      BORDER,
      `┌${"─".repeat(Math.max(1, w - 2))}┐`,
    );
    const bottomBorder = this.theme.fg(
      BORDER,
      `└${"─".repeat(Math.max(1, w - 2))}┘`,
    );
    const lines: string[] = [topBorder];

    // Inset blank inside the border before the title — vertical pad.
    lines.push(blank);
    if (this.def.title) {
      lines.push(
        wrap(this.theme.bold(this.theme.fg(TITLE, this.def.title))),
      );
    }
    lines.push(wrap(this.buildShortcutRow()));
    lines.push(blank);

    for (const line of slice) {
      lines.push(wrap(line));
    }

    if (total === 0) {
      lines.push(wrap(this.theme.fg(PROMPT, "(empty)")));
    }

    // Pad to maxBodyRows so the modal stays a constant height.
    const bodyShown = sliceEnd - sliceStart;
    for (let i = bodyShown; i < this.maxBodyRows; i++) {
      lines.push(blank);
    }

    if (total > this.maxBodyRows) {
      const counter =
        sliceStart === 0
          ? `(${sliceEnd}/${total})`
          : `(${sliceStart + 1}-${sliceEnd}/${total})`;
      const arrows =
        (sliceStart > 0 ? "↑" : " ") + (sliceEnd < total ? "↓" : " ");
      lines.push(
        wrap(
          `${this.theme.fg(PROMPT, counter)} ${this.theme.fg(ACCENT, arrows)}`,
        ),
      );
    } else {
      lines.push(blank);
    }

    lines.push(blank);
    lines.push(bottomBorder);
    return lines;
  }

  handleInput(data: string): void {
    // Custom keys win — caller can override any built-in.
    for (const k of this.currentKeys()) {
      if (k.match(data)) {
        const result = k.action(this.buildBodyContext(), data);
        if (result === "close") this.close();
        return;
      }
    }

    // Built-in defaults — only when no custom key matched the same input.
    if (data === ESC_DATA) {
      this.close();
      return;
    }
    if (SCROLL_DOWN_DATA.includes(data)) {
      this.scrollBy(1);
      return;
    }
    if (SCROLL_UP_DATA.includes(data)) {
      this.scrollBy(-1);
      return;
    }
    if (data === PAGE_DOWN_DATA) {
      this.scrollBy(this.maxBodyRows);
      return;
    }
    if (data === PAGE_UP_DATA) {
      this.scrollBy(-this.maxBodyRows);
      return;
    }
    if (data === HOME_DATA) {
      this.scrollTo(0);
      return;
    }
    if (data === END_DATA) {
      this.scrollTo(this.bodyLines.length);
      return;
    }
  }

  private buildBodyContext(): ModalBodyContext {
    return {
      tui: this.tui,
      theme: this.theme,
      close: () => this.close(),
      scrollBy: (n) => this.scrollBy(n),
      scrollTo: (n) => this.scrollTo(n),
      getScrollOffset: () => this.scrollOffset,
      getMaxBodyRows: () => this.maxBodyRows,
      requestRender: () => this.tui.requestRender(),
    };
  }
}

/**
 * Open a Modal via `ctx.ui.custom`. Resolves when the modal closes (via
 * Esc, a key action returning "close", or `mctx.close()` from the body).
 *
 * `build` receives a ModalBodyContext (theme + tui + close + scroll
 * control). Construct the body Component inside the callback so it can
 * capture all of it.
 */
export async function openModal(
  ctx: {
    ui: {
      custom<T>(
        factory: (
          tui: TUI,
          theme: unknown,
          keybindings: unknown,
          done: (result: T) => void,
        ) => Component,
        options?: {
          overlay?: boolean;
          overlayOptions?: OverlayOptions | (() => OverlayOptions);
        },
      ): Promise<T>;
    };
  },
  build: (mctx: ModalBodyContext) => ModalDefinition,
  overlayOptions?: OverlayOptions,
): Promise<void> {
  await ctx.ui.custom<void>(
    (tui, theme, _kb, done) => {
      let modal: Modal | undefined;
      const close = () => done();
      const stub: ModalBodyContext = {
        tui,
        theme: theme as MenuTheme,
        close,
        scrollBy: (n) => modal?.scrollBy(n),
        scrollTo: (n) => modal?.scrollTo(n),
        getScrollOffset: () => modal?.getScrollOffset() ?? 0,
        getMaxBodyRows: () =>
          modal?.getMaxBodyRows() ?? libPrefs().get().menu.maxVisible * 2,
        requestRender: () => tui.requestRender(),
      };
      const def = build(stub);
      modal = new Modal(def, theme as MenuTheme, tui, () => done());
      return modal;
    },
    { overlay: true, overlayOptions: { ...DEFAULT_OVERLAY, ...overlayOptions } },
  );
}
