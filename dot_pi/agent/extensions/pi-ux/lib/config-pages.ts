/**
 * Cross-extension config-page registry.
 *
 * Each extension that wants to appear in `/config:ux` calls
 * `registerConfigPage({ id, label, build })`. The build callback receives
 * the live `theme` and a `close` callback; it returns a Component
 * (typically a SettingsList) to render as the page.
 *
 * The hub (ux.ts) reads `getConfigPages()` when the user opens
 * `/config:ux`, and presents one submenu entry per registered page.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

export type PageBuilder = (
  theme: { fg(color: ThemeColor, text: string): string },
  close: () => void,
) => Component;

export type ConfigPage = {
  id: string;
  label: string;
  description?: string;
  build: PageBuilder;
};

declare global {
  // eslint-disable-next-line no-var
  var __piConfigPages: Map<string, ConfigPage> | undefined;
}

function registry(): Map<string, ConfigPage> {
  if (!globalThis.__piConfigPages)
    globalThis.__piConfigPages = new Map<string, ConfigPage>();
  return globalThis.__piConfigPages;
}

export function registerConfigPage(page: ConfigPage): void {
  registry().set(page.id, page);
}

export function getConfigPages(order?: string[]): ConfigPage[] {
  const all = [...registry().values()];
  if (!order) return all;
  const map = new Map(all.map((p) => [p.id, p]));
  const sorted: ConfigPage[] = [];
  for (const id of order) {
    const p = map.get(id);
    if (p) {
      sorted.push(p);
      map.delete(id);
    }
  }
  return [...sorted, ...map.values()];
}
