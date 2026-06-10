/**
 * ANSI-aware text primitives shared across piedpi extensions.
 *
 * Everything in here uses pi's `visibleWidth` for sizing so that ANSI
 * escape codes (colour, bold, etc.) don't throw off the column math.
 * Pure functions, no theme/colour assumptions — composable with the
 * chart primitives in `lib/charts`.
 */

import { visibleWidth } from "@earendil-works/pi-tui";

/** Right-pad `text` with spaces to reach `target` visible columns.
 *  Leaves text unchanged if it already meets or exceeds the target. */
export function padVisible(text: string, target: number): string {
  return text + " ".repeat(Math.max(0, target - visibleWidth(text)));
}

/** Truncate `text` to fit in `width` visible columns, appending `…`
 *  when truncation occurs. Returns just `…` when there isn't even
 *  room for one content character. */
export function truncate(text: string, width: number): string {
  if (visibleWidth(text) <= width) return text;
  if (width <= 1) return "…";
  return text.slice(0, Math.max(0, width - 1)) + "…";
}

/**
 * Soft-wrap `text` to lines of at most `width` columns. Preserves
 * paragraph breaks (existing `\n`s become hard line breaks); within a
 * paragraph, breaks happen on whitespace where possible. A word that
 * exceeds the line width on its own is hard-split — better than
 * letting a giant URL or token blow the body's column alignment.
 */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [];
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para === "") {
      out.push("");
      continue;
    }
    if (visibleWidth(para) <= width) {
      out.push(para);
      continue;
    }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      if (visibleWidth(word) > width) {
        // Word longer than the line: flush the current line, then chop
        // the word into width-sized pieces.
        if (line) {
          out.push(line);
          line = "";
        }
        let rest = word;
        while (visibleWidth(rest) > width) {
          out.push(rest.slice(0, width));
          rest = rest.slice(width);
        }
        line = rest;
        continue;
      }
      const candidate = line + word;
      if (visibleWidth(candidate) <= width) {
        line = candidate;
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    if (line) out.push(line.trimEnd());
  }
  return out;
}
