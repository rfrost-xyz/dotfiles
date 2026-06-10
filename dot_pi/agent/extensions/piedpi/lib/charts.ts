/**
 * Unified terminal chart primitives for piedpi extensions.
 *
 * Four chart shapes covering what the suite actually renders today:
 *   - `columns`     multi-row vertical bars with sub-cell partials
 *   - `hbar`        single-row horizontal bar (fill + empty trailing)
 *   - `stack`       single-row segmented bar; segments may carry
 *                   nested children for two-level allocation
 *   - `markerRow`   column-aligned annotation row above a `columns`
 *
 * Theme-agnostic: every chart takes a `Painter` callback (a function
 * that wraps a string in ANSI escapes), so the lib has no knowledge
 * of `ThemeColor` tokens or omarchy hex values. Callers compose
 * painters from whatever colour vocabulary they own.
 *
 * Design contracts:
 *   - Cells obey `visibleWidth` (ANSI-aware).
 *   - Multi-row chart "background" defaults to plain space — stacked
 *     `░` reads as a solid block in some terminals and competes with
 *     the bars. Single-row bars keep `░` shading since isolated
 *     strips don't have the tiling issue.
 *   - Sub-cell precision: bar tips that don't fill a whole row use
 *     the 8-step block-bar family `▁▂▃▄▅▆▇` so growth reads smoothly.
 *   - Width adaptation: if a series has fewer values than columns,
 *     each value widens with largest-remainder distribution so bars
 *     stay chunky and the chart still fills width; if it has more,
 *     buckets are mean-averaged.
 *   - Allocation is strict-budget: total cells painted equals the
 *     requested cells. Sparse data with many segments drops the
 *     lowest-weight segments rather than overflowing past the budget.
 */

/** Wrap a string in ANSI escapes (or return it unchanged for plain
 *  output). Composed by the caller from theme tokens, RGB, etc. */
export type Painter = (text: string) => string;

export type Scale = "linear" | "log";

// Identity painter — useful as a default for empty cells so the
// terminal background shows through.
const identity: Painter = (s) => s;

// ── Common helpers ─────────────────────────────────────────────────

/**
 * Build a 0..1 scaler. `linear` is v/max; `log` compresses dynamic
 * range so a dominant value doesn't crush the rest into invisibility.
 */
export function scaleFn(mode: Scale, max: number): (v: number) => number {
  if (mode === "linear") {
    return (v) => (max <= 0 ? 0 : Math.max(0, Math.min(1, v / max)));
  }
  const denom = Math.log10(1 + Math.max(1, max));
  return (v) => (v <= 0 || denom <= 0 ? 0 : Math.log10(1 + v) / denom);
}

/**
 * Map a series of `values` onto exactly `width` column-values.
 * - identity when lengths match
 * - bucket-mean when there are more values than columns
 * - largest-remainder widening when there are fewer (bars stay chunky)
 */
export function columnValues(
  values: readonly number[],
  width: number,
): number[] {
  if (width <= 0) return [];
  if (values.length === 0) return new Array(width).fill(0);
  if (values.length === width) return [...values];
  if (values.length > width) {
    const out: number[] = [];
    const step = values.length / width;
    for (let i = 0; i < width; i++) {
      const start = Math.floor(i * step);
      const end = Math.max(start + 1, Math.floor((i + 1) * step));
      let sum = 0;
      let count = 0;
      for (let j = start; j < end && j < values.length; j++) {
        sum += values[j] ?? 0;
        count += 1;
      }
      out.push(count > 0 ? sum / count : 0);
    }
    return out;
  }
  const out: number[] = [];
  const base = Math.floor(width / values.length);
  const remainder = width - base * values.length;
  for (let i = 0; i < values.length; i++) {
    const cellWidth = base + (i < remainder ? 1 : 0);
    for (let k = 0; k < cellWidth; k++) out.push(values[i] ?? 0);
  }
  return out;
}

/**
 * Mirror of columnValues' upsample/downsample for marker overlays:
 * given a turn index and the total turn count, return the column it
 * lives in for a chart of `width` columns. -1 when out of range.
 */
export function turnToColumn(
  turnIdx: number,
  turns: number,
  width: number,
): number {
  if (turns === 0 || width <= 0) return -1;
  if (turns === width) return turnIdx;
  if (turns > width) {
    return Math.floor((turnIdx * width) / turns);
  }
  const base = Math.floor(width / turns);
  const remainder = width - base * turns;
  let col = 0;
  for (let i = 0; i < turnIdx; i++) {
    col += base + (i < remainder ? 1 : 0);
  }
  return col;
}

/**
 * How many chart columns a single turn occupies. Mirrors the
 * largest-remainder widening that `columnValues` does when there are
 * fewer turns than columns — the first `remainder` turns get
 * `floor(width/turns) + 1` cells, the rest get `floor(width/turns)`.
 * When `turns >= width` each turn collapses to a single cell (or
 * shares one), so this returns 1.
 */
export function turnSpan(
  turnIdx: number,
  turns: number,
  width: number,
): number {
  if (turns === 0 || width <= 0) return 0;
  if (turns >= width) return 1;
  const base = Math.floor(width / turns);
  const remainder = width - base * turns;
  return base + (turnIdx < remainder ? 1 : 0);
}

// Partial-row characters for the tip of a bar that doesn't fill a
// full cell. Indexed 1..7; 0 means "no partial" (i.e. background).
const PARTIAL_BAR = ["", "▁", "▂", "▃", "▄", "▅", "▆", "▇"] as const;

// ── Columns: vertical bar chart, multi-row ─────────────────────────

export type ColumnsOptions = {
  values: readonly number[];
  width: number;
  /** Chart height in rows. Default 3. */
  height?: number;
  /** Override the y-axis max (default = max(values)). Use a fixed
   *  value when comparing against an absolute scale — e.g. 100 for
   *  a percentage chart. */
  max?: number;
  mode?: Scale;
  /** Paint the filled portion of each bar. */
  fill: Painter;
  /** Paint the empty portion (above each bar). Defaults to identity
   *  (terminal background shows through) since stacked dim chars
   *  read as a solid block in some terminals. */
  empty?: Painter;
  /** Use `▁..▇` for bar tips that don't fill a full cell. Default true. */
  partial?: boolean;
  /**
   * Optional column-range highlight — every cell in
   * `[col, col + span)` across all chart rows gets painted by
   * `paint` instead of the channel's normal fill / empty painter.
   * The cell character (fill / partial / empty) is preserved, only
   * the wrap changes. `span` defaults to 1; use `turnSpan()` to get
   * the right width when a turn occupies more than one chart column.
   */
  highlight?: { col: number; span?: number; paint: Painter };
};

/**
 * Vertical bar chart. Each value occupies one or more columns;
 * baseline at the bottom of the chart. Returns one string per chart
 * row (top-down).
 */
export function columns(opts: ColumnsOptions): string[] {
  const height = opts.height ?? 3;
  const mode = opts.mode ?? "linear";
  const partial = opts.partial !== false;
  const empty = opts.empty ?? identity;
  const max =
    opts.max !== undefined ? opts.max : Math.max(...opts.values, 0);
  const cols = columnValues(opts.values, opts.width);
  const scale = scaleFn(mode, Math.max(max, 1));
  const heights = cols.map((v) => scale(v) * height);
  const hi = opts.highlight;

  const lines: string[] = [];
  for (let r = 0; r < height; r++) {
    const rowsFromBottom = height - r;
    // Build per-column cells first so a highlight override can swap
    // one column's paint without disturbing run-length grouping of
    // the rest. Adjacent same-paint cells collapse into one ANSI
    // span at emit time.
    type Cell = { char: string; paint: Painter };
    const cells: Cell[] = [];
    for (let i = 0; i < cols.length; i++) {
      const h = heights[i]!;
      const fullRows = Math.floor(h);
      const frac = h - fullRows;
      let char: string;
      let paint: Painter;
      if (rowsFromBottom <= fullRows) {
        char = "█";
        paint = opts.fill;
      } else if (partial && rowsFromBottom === fullRows + 1 && frac > 0) {
        const idx = Math.max(1, Math.min(7, Math.round(frac * 8)));
        char = PARTIAL_BAR[idx]!;
        paint = opts.fill;
      } else {
        char = " ";
        paint = empty;
      }
      if (hi && i >= hi.col && i < hi.col + (hi.span ?? 1)) {
        paint = hi.paint;
      }
      cells.push({ char, paint });
    }
    let out = "";
    let i = 0;
    while (i < cells.length) {
      let j = i + 1;
      while (
        j < cells.length &&
        cells[j]!.paint === cells[i]!.paint &&
        cells[j]!.char === cells[i]!.char
      )
        j++;
      out += cells[i]!.paint(cells[i]!.char.repeat(j - i));
      i = j;
    }
    lines.push(out);
  }
  return lines;
}

// ── HBar: single-row horizontal bar ────────────────────────────────

export type HBarOptions = {
  value: number;
  max: number;
  width: number;
  mode?: Scale;
  fill: Painter;
  /** Paints the trailing empty portion. Required since single-row
   *  bars need a visible baseline (typically `░` in DIM). */
  empty: Painter;
  /** Fill character. Default `█`. */
  fillChar?: string;
  /** Empty character. Default `░`. */
  emptyChar?: string;
};

export function hbar(opts: HBarOptions): string {
  if (opts.width <= 0) return "";
  const fillChar = opts.fillChar ?? "█";
  const emptyChar = opts.emptyChar ?? "░";
  if (opts.max <= 0) {
    return opts.empty(emptyChar.repeat(opts.width));
  }
  const scale = scaleFn(opts.mode ?? "linear", opts.max);
  const filled = Math.max(
    0,
    Math.min(opts.width, Math.round(scale(opts.value) * opts.width)),
  );
  const emptyN = opts.width - filled;
  return opts.fill(fillChar.repeat(filled)) + opts.empty(emptyChar.repeat(emptyN));
}

// ── Stack: single-row segmented bar ────────────────────────────────

export type StackSegment = {
  value: number;
  fill: Painter;
  /**
   * Optional sub-segments. When present, this segment's allocated
   * cells get subdivided among its children proportionally, and each
   * child is painted by its own `fill`. The parent's `fill` is only
   * used when there are no children (or when allocated cells = 0).
   *
   * Lets callers express a two-level layout — e.g. Overview's
   * attribution bar: top-level cells go to category groups in
   * proportion to their share of context, then within each group's
   * cells children show internal composition with tinted shades.
   */
  children?: readonly { value: number; fill: Painter }[];
};

export type StackOptions = {
  segments: readonly StackSegment[];
  width: number;
  /** If provided, segments fill segments.sum / total of the width,
   *  with the leftover painted by `empty`. If omitted, segments span
   *  the full width. */
  total?: number;
  empty?: Painter;
  fillChar?: string;
  emptyChar?: string;
  /**
   * Optional single-cell overlay (e.g. a "usable threshold" marker on
   * the Overview attribution bar). Replaces whatever segment or empty
   * cell sits at `col`. Replicating the same stack line N rows tall
   * gives a vertical line of `glyph` cells N rows high.
   */
  marker?: { col: number; glyph: string; paint: Painter };
};

/**
 * Distribute `cells` columns across `weights` using largest-remainder.
 * Strict-budget: total allocated cells always equals `cells` (or 0 if
 * cells / total are both 0). When there are more non-zero weights than
 * cells, only the top-cells weights get 1 cell each — the rest get 0.
 * This keeps the visualisation honest for sparse data (e.g. usage 5%
 * of window across 7 categories doesn't balloon into a 7-cell bar).
 */
function allocateCells(weights: readonly number[], cells: number): number[] {
  const out = new Array<number>(weights.length).fill(0);
  if (cells <= 0) return out;
  const nonZero = weights
    .map((w, i) => ({ i, w }))
    .filter((x) => x.w > 0);
  if (nonZero.length === 0) return out;

  // When we don't have enough cells for one each, hand 1 cell to the
  // top-cells-by-weight; everyone else stays at 0. Keeps the bar at
  // exactly `cells` wide instead of overflowing past it.
  if (nonZero.length > cells) {
    nonZero.sort((a, b) => b.w - a.w);
    for (let k = 0; k < cells; k++) {
      out[nonZero[k]!.i] = 1;
    }
    return out;
  }

  // Normal case: enough cells for at least one each.
  const total = nonZero.reduce((s, x) => s + x.w, 0);
  let allocated = 0;
  const remainders: { i: number; r: number }[] = [];
  nonZero.forEach(({ i, w }) => {
    const exact = (w / total) * cells;
    const n = Math.max(1, Math.floor(exact));
    out[i] = n;
    allocated += n;
    remainders.push({ i, r: exact - Math.floor(exact) });
  });
  while (allocated > cells) {
    let trim = -1;
    let smallest = Infinity;
    for (let k = 0; k < weights.length; k++) {
      if (out[k]! > 1 && weights[k]! < smallest) {
        smallest = weights[k]!;
        trim = k;
      }
    }
    if (trim < 0) break;
    out[trim]! -= 1;
    allocated -= 1;
  }
  remainders.sort((a, b) => b.r - a.r);
  let k = 0;
  while (allocated < cells && k < remainders.length) {
    out[remainders[k]!.i]! += 1;
    allocated += 1;
    k++;
  }
  return out;
}

export function stack(opts: StackOptions): string {
  if (opts.width <= 0) return "";
  const fillChar = opts.fillChar ?? "█";
  const emptyChar = opts.emptyChar ?? "░";
  const empty = opts.empty ?? identity;
  const sumSegs = opts.segments.reduce((s, x) => s + x.value, 0);
  const total = opts.total ?? sumSegs;
  if (total <= 0) {
    return empty(emptyChar.repeat(opts.width));
  }
  const filledCells = Math.min(
    opts.width,
    Math.round((sumSegs / total) * opts.width),
  );
  const emptyN = opts.width - filledCells;

  const segWeights = opts.segments.map((s) => s.value);
  const counts = allocateCells(segWeights, filledCells);

  // Build a per-column (char, painter) array first, then collapse
  // adjacent same-painter runs into one ANSI span. Going via cells
  // keeps the marker-overlay step simple — one slot replacement —
  // without breaking ANSI escape grouping mid-string.
  type Cell = { char: string; paint: Painter };
  const cells: Cell[] = [];
  opts.segments.forEach((s, i) => {
    const segCells = counts[i]!;
    const kids = s.children ?? [];
    if (segCells <= 0) return;
    // Subdivide only when there's room for at least one cell per
    // non-zero child. Otherwise the segment reads as the parent's
    // solid colour — tight bars stay clean rather than collapsing
    // into a barcode of 1-cell child stripes.
    const nonZeroKids = kids.filter((c) => c.value > 0);
    if (nonZeroKids.length === 0 || segCells < nonZeroKids.length) {
      for (let k = 0; k < segCells; k++) {
        cells.push({ char: fillChar, paint: s.fill });
      }
      return;
    }
    const childWeights = kids.map((c) => c.value);
    const childCounts = allocateCells(childWeights, segCells);
    kids.forEach((c, ci) => {
      const n = childCounts[ci]!;
      for (let k = 0; k < n; k++) {
        cells.push({ char: fillChar, paint: c.fill });
      }
    });
  });
  for (let k = 0; k < emptyN; k++) {
    cells.push({ char: emptyChar, paint: empty });
  }

  // Marker overlay — single-cell override at the requested column.
  if (
    opts.marker &&
    opts.marker.col >= 0 &&
    opts.marker.col < cells.length
  ) {
    cells[opts.marker.col] = {
      char: opts.marker.glyph,
      paint: opts.marker.paint,
    };
  }

  // Run-length collapse adjacent cells sharing painter + char so the
  // output emits one ANSI span per run rather than per cell.
  let out = "";
  let i = 0;
  while (i < cells.length) {
    let j = i + 1;
    while (
      j < cells.length &&
      cells[j]!.paint === cells[i]!.paint &&
      cells[j]!.char === cells[i]!.char
    )
      j++;
    out += cells[i]!.paint(cells[i]!.char.repeat(j - i));
    i = j;
  }
  return out;
}

// ── Marker row: column-aligned annotations ─────────────────────────

export type Mark = {
  col: number;
  glyph: string;
  paint: Painter;
};

export function markerRow(marks: readonly Mark[], width: number): string {
  if (width <= 0) return "";
  const cells = new Array<string>(width).fill(" ");
  const painters = new Array<Painter | null>(width).fill(null);
  for (const m of marks) {
    if (m.col < 0 || m.col >= width) continue;
    cells[m.col] = m.glyph;
    painters[m.col] = m.paint;
  }
  let out = "";
  for (let i = 0; i < width; i++) {
    const cell = cells[i]!;
    const painter = painters[i];
    out += painter !== null ? painter(cell) : " ";
  }
  return out;
}

