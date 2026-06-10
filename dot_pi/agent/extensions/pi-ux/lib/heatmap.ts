/**
 * Calendar heatmap (Claude Code / GitHub contribution-graph style).
 *
 * Renders weeks across, days down (Sun-Sat). Each cell encodes a density
 * value using ` ·░▒▓█` (6 levels). Caller provides a `valueAt(day)`
 * lookup. Optionally prepends a row of month labels at the top.
 */

// Level 0 uses a dim dot so the grid is visible on empty days (matches the
// GitHub / Claude-style contribution graph). Joined with single-space gaps,
// each week occupies 2 character columns in the rendered output.
const LEVELS = ["·", "·", "░", "▒", "▓", "█"];
const CELL_STRIDE = 2; // 1 char cell + 1 char gap (no trailing gap)

export type HeatmapOptions = {
  /** Earliest day shown (inclusive). */
  start: Date;
  /** Latest day shown (inclusive). */
  end: Date;
  /** Lookup value for a given YYYY-MM-DD. Return 0 / undefined for empty. */
  valueAt: (dayKey: string) => number | undefined;
  /** Override level cutoffs. Defaults to quartiles of the observed values. */
  thresholds?: number[];
  /** Day-of-week labels for the leftmost column. Defaults to Sun..Sat. */
  dayLabels?: string[];
  showMonthRow?: boolean;
};

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function heatmap(opts: HeatmapOptions): string[] {
  const dayLabels = opts.dayLabels ?? [
    "   ",
    "Mon",
    "   ",
    "Wed",
    "   ",
    "Fri",
    "   ",
  ];
  const labelWidth = Math.max(...dayLabels.map((l) => l.length));

  // Walk weeks from startOfWeek(start) to end. Build 7 rows.
  const firstWeek = startOfWeek(opts.start);
  const weeks: { weekStart: Date; values: (number | undefined)[] }[] = [];
  for (
    let w = new Date(firstWeek);
    w <= opts.end;
    w.setDate(w.getDate() + 7)
  ) {
    const values: (number | undefined)[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const d = new Date(w);
      d.setDate(d.getDate() + dow);
      if (d < opts.start || d > opts.end) {
        values.push(undefined);
      } else {
        values.push(opts.valueAt(dayKey(d)));
      }
    }
    weeks.push({ weekStart: new Date(w), values });
  }

  // Compute thresholds. Default: quartiles of positive values, with empty
  // mapped to level 0.
  let thresholds = opts.thresholds;
  if (!thresholds) {
    const positives = weeks
      .flatMap((wk) => wk.values)
      .filter((v): v is number => typeof v === "number" && v > 0)
      .sort((a, b) => a - b);
    if (positives.length === 0) thresholds = [1, 2, 3, 4, 5];
    else {
      const q = (p: number) =>
        positives[Math.floor(p * (positives.length - 1))];
      thresholds = [q(0.2), q(0.4), q(0.6), q(0.8), q(0.95)];
    }
  }

  function levelFor(v: number | undefined): string {
    if (v === undefined) return LEVELS[0];
    if (v <= 0) return LEVELS[0];
    const t = thresholds!;
    if (v < t[0]) return LEVELS[1];
    if (v < t[1]) return LEVELS[2];
    if (v < t[2]) return LEVELS[3];
    if (v < t[3]) return LEVELS[4];
    return LEVELS[5];
  }

  const lines: string[] = [];

  // Month label row. Each week occupies CELL_STRIDE columns; month labels
  // are written into a flat buffer at the byte offset of their first week,
  // so "Mar" reads as "Mar" (consecutive chars) rather than "M a r"
  // (spread across week-cell positions).
  if (opts.showMonthRow !== false) {
    const rowWidth = Math.max(0, weeks.length * CELL_STRIDE - 1);
    const monthBuf: string[] = Array.from({ length: rowWidth }, () => " ");
    let lastMonth = -1;
    for (let i = 0; i < weeks.length; i++) {
      const m = weeks[i].weekStart.getMonth();
      if (m !== lastMonth) {
        const label = MONTHS[m];
        const col = i * CELL_STRIDE;
        for (let k = 0; k < label.length && col + k < rowWidth; k++) {
          monthBuf[col + k] = label[k];
        }
        lastMonth = m;
      }
    }
    lines.push(`${" ".repeat(labelWidth)}  ${monthBuf.join("")}`);
  }

  // 7 day rows.
  for (let dow = 0; dow < 7; dow++) {
    const cells = weeks.map((wk) => levelFor(wk.values[dow])).join(" ");
    lines.push(`${dayLabels[dow].padStart(labelWidth)}  ${cells}`);
  }

  return lines;
}

export const HEATMAP_LEGEND = `Less ${LEVELS.slice(1).join(" ")} More`;
