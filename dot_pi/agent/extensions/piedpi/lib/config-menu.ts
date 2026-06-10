/**
 * Helper for the common "open a CycleMenu over a Config<T>" pattern.
 *
 * Statusline and omarchy-theme both follow the same skeleton:
 *
 *   1. Snapshot `config.get()` at menu open (so off→on cycles can restore
 *      a segment's prior position, etc.).
 *   2. On every h/l preview, project the row indices back onto the
 *      snapshot via `applyRows()`, then mutate the cached config in place
 *      so the live render loop (footer / theme regen / etc.) reflects the
 *      preview without touching disk.
 *   3. On Enter, write the projected config to disk.
 *   4. On Esc, CycleMenu replays the original indices through onPreview
 *      so the cache is restored; we just close.
 *   5. On Ctrl+R, reload from disk and re-seed the menu rows.
 *
 * `openConfigMenu` wraps that skeleton. Pass `buildRows`, `applyRows`, and
 * an optional `sideEffect` callback for the bits that vary per consumer
 * (requesting a render, scheduling a theme regen, etc.).
 */

import type { Config } from "./config.ts";
import {
  CycleMenu,
  type CycleMenuOptions,
  type CycleRow,
  type MenuTheme,
} from "./cycle-menu.ts";

interface TUIHandle {
  requestRender(): void;
}

export type ConfigMenuOptions<T> = {
  config: Config<T>;
  /** Build the CycleMenu row list from the given config snapshot. */
  buildRows: (snapshot: T) => CycleRow[];
  /**
   * Project chosen row indices back onto a config. Receives the menu's
   * `original` snapshot so callers that need it for restore semantics
   * (e.g. statusline's setVisible layout preservation) can read from it.
   *
   * Callers may also use this hook to mutate auxiliary stores in place
   * (e.g. write libPrefs preview state). Combined with `onCommit` /
   * `onReload` below, that lets one menu edit values across two config
   * files — the cancel-by-replay-of-original-idxs flow restores the
   * auxiliary store the same way it restores the primary.
   */
  applyRows: (original: T, idxs: readonly number[]) => T;
  /**
   * Fired after every preview / commit / reload that produces a new
   * config. The new config is also mutated into `config.get()` so render
   * loops reading the live config pick it up automatically; the side
   * effect is for any non-config work (requestRender, scheduleRegen, …).
   */
  sideEffect?: (next: T) => void;
  /** Forwarded to CycleMenu. */
  title?: string;
  /** Forwarded to CycleMenu (e.g. `maxVisible`). */
  cycleMenuOptions?: Omit<CycleMenuOptions, "title">;
  /**
   * Fires AFTER the primary `config.save(next)` on Enter. Use it to
   * persist auxiliary stores that `applyRows` has been live-mutating.
   */
  onCommit?: () => void;
  /**
   * Fires AFTER the primary `config.reload()` on Ctrl+R, before the
   * menu rebuilds its rows. Use it to reload auxiliary stores so the
   * fresh rows reflect what's now on disk.
   */
  onReload?: () => void;
};

/**
 * Shallow merge of `next` into `cached` so that any consumer holding the
 * `cached` reference (footer renderers, regen schedulers, etc.) observes
 * the preview without us replacing the reference.
 */
function assignInto<T>(cached: T, next: T): void {
  for (const k of Object.keys(next as object) as (keyof T)[]) {
    cached[k] = next[k];
  }
}

export function openConfigMenu<T extends object>(
  tui: TUIHandle,
  theme: MenuTheme,
  done: () => void,
  opts: ConfigMenuOptions<T>,
): CycleMenu {
  const {
    config,
    buildRows,
    applyRows,
    sideEffect,
    title,
    cycleMenuOptions,
    onCommit,
    onReload,
  } = opts;
  let original = structuredClone(config.get());

  const preview = (idxs: readonly number[]) => {
    const next = applyRows(original, idxs);
    assignInto(config.get(), next);
    sideEffect?.(next);
  };

  const menu: CycleMenu = new CycleMenu(
    buildRows(original),
    theme,
    tui,
    {
      onPreview: preview,
      onCommit: (idxs) => {
        const next = applyRows(original, idxs);
        config.save(next);
        onCommit?.();
        sideEffect?.(next);
        done();
      },
      onCancel: () => done(),
      onReload: () => {
        config.reload();
        onReload?.();
        original = structuredClone(config.get());
        menu.reset(buildRows(original));
        sideEffect?.(config.get());
      },
    },
    title ? { ...cycleMenuOptions, title } : cycleMenuOptions,
  );
  return menu;
}
