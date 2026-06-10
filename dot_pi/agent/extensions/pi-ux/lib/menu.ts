/**
 * Declarative menu builder.
 *
 * Each settings-ui used to spell out:
 *   1. Build a `SettingItem[]` whose `currentValue` is read from config.
 *   2. Hand-write a giant `onChange` switch that maps each id back to the
 *      mutation that should fire.
 *
 * Same pattern, repeated everywhere, with the get/set divorced. This
 * helper inverts it: each field carries its own `get` and `set`, the
 * builder wires the SettingsList + dispatch, and the result is a
 * border-wrapped Component that picks up pi-ux's shared highlight.
 *
 * Keeps the per-page file focused on *what* each setting is, not the
 * boilerplate of how to wire it up.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type SettingItem,
  SettingsList,
} from "@earendil-works/pi-tui";
import { highlightTheme, type ThemeFg } from "./theme.ts";
import { getHighlightColor } from "./ui-config.ts";

export type ToggleField = {
  kind: "toggle";
  id: string;
  label: string;
  description?: string;
  get: () => boolean;
  set: (value: boolean) => void;
};

export type CycleField = {
  kind: "cycle";
  id: string;
  label: string;
  description?: string;
  values: readonly string[];
  get: () => string;
  set: (value: string) => void;
};

export type InfoField = {
  kind: "info";
  id: string;
  label: string;
  description?: string;
  value: () => string;
};

export type SubmenuField = {
  kind: "submenu";
  id: string;
  label: string;
  description?: string;
  currentValue?: () => string;
  build: (theme: ThemeFg, close: () => void) => Component;
};

export type MenuField = ToggleField | CycleField | InfoField | SubmenuField;

export type BuildMenuOptions = {
  maxVisible?: number;
};

function toSettingItem(field: MenuField, theme: ThemeFg): SettingItem {
  switch (field.kind) {
    case "toggle":
      return {
        id: field.id,
        label: field.label,
        description: field.description,
        currentValue: field.get() ? "on" : "off",
        values: ["on", "off"],
      };
    case "cycle":
      return {
        id: field.id,
        label: field.label,
        description: field.description,
        currentValue: field.get(),
        values: [...field.values],
      };
    case "info":
      return {
        id: field.id,
        label: field.label,
        description: field.description,
        currentValue: field.value(),
      };
    case "submenu":
      return {
        id: field.id,
        label: field.label,
        description: field.description,
        currentValue: field.currentValue?.() ?? "›",
        submenu: (_v, finish) => field.build(theme, () => finish()),
      };
  }
}

function dispatch(fields: readonly MenuField[], id: string, value: string): void {
  const field = fields.find((f) => f.id === id);
  if (!field) return;
  if (field.kind === "toggle") field.set(value === "on");
  else if (field.kind === "cycle") field.set(value);
  // info + submenu: no-op on cycle (SettingsList doesn't fire onChange for them)
}

/**
 * Returns a bare SettingsList. Callers compose borders / tabs / etc. as
 * they see fit — usually the outer container ( `/config:ux` hub) wraps
 * with borders once, and inner pages stay bare to avoid doubling them.
 */
export function buildMenu(
  fields: readonly MenuField[],
  theme: ThemeFg & { fg(color: ThemeColor, text: string): string },
  close: () => void,
  options: BuildMenuOptions = {},
): Component {
  const listTheme = highlightTheme(theme, getHighlightColor());
  const items = fields.map((f) => toSettingItem(f, theme));
  return new SettingsList(
    items,
    options.maxVisible ?? 12,
    listTheme,
    (id, value) => dispatch(fields, id, value),
    close,
  );
}
