// ANSI-aware visible width — strips CSI/SGR + OSC 8 hyperlinks, counts
// remaining codepoints as width-1 each. Adequate for ASCII + light Unicode
// (· ↑ ◔ ●).

const ANSI_RE = /\x1b(?:\[[0-9;?]*[ -\/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g;

export function visibleWidth(s: string): number {
  let n = 0;
  for (const _ of s.replace(ANSI_RE, "")) n++;
  return n;
}
