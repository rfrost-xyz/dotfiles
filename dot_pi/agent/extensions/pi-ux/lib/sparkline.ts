/**
 * Sparklines & bar charts for the Stats tab.
 *
 * Two helpers:
 *   - sparkline(values, width): one-line dense chart using ▁..█ block chars.
 *   - barChart({ values, labels, height, ... }): multi-row bar chart with a
 *     y-axis labelled at min/max, x-axis labels at the bottom.
 *
 * Both are pure functions over numeric arrays; the caller picks colours
 * by passing the lines through theme.fg().
 */

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function sparkline(values: number[], _width?: number): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v) => {
      const idx = Math.round(((v - min) / range) * (SPARK.length - 1));
      return SPARK[Math.max(0, Math.min(SPARK.length - 1, idx))];
    })
    .join("");
}

export type BarChartOptions = {
  values: number[];
  labels?: string[];
  height: number;
  width: number;
  /** Format a y-axis tick. */
  formatY?: (value: number) => string;
};

/**
 * Multi-row vertical bar chart using █ + ▅ half-blocks for sub-row
 * precision. Returns array of rendered lines (top row first), including
 * y-axis labels and a separator before x-axis labels (if provided).
 */
export function barChart(opts: BarChartOptions): string[] {
  const { values, labels, height, width } = opts;
  if (!values.length) return [];
  const max = Math.max(...values, 1);
  const formatY = opts.formatY ?? ((v) => `${Math.round(v)}`);

  // Reserve y-axis label column. Width includes axis.
  const ySamples = [max, max * 0.75, max * 0.5, max * 0.25, 0];
  const yLabels = ySamples.map(formatY);
  const yWidth = Math.max(...yLabels.map((l) => l.length));
  const chartW = Math.max(8, width - yWidth - 2);
  const colsPerBar = Math.max(1, Math.floor(chartW / values.length));
  const totalCols = colsPerBar * values.length;

  const rows: string[][] = Array.from({ length: height }, () =>
    Array.from({ length: totalCols }, () => " "),
  );
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const fillRows = Math.round((v / max) * height);
    for (let r = 0; r < fillRows; r++) {
      const rowIdx = height - 1 - r;
      for (let c = 0; c < colsPerBar; c++) {
        // leave 1 col gap between bars when bar is wide
        if (colsPerBar > 1 && c === colsPerBar - 1) continue;
        rows[rowIdx][i * colsPerBar + c] = "█";
      }
    }
  }

  // Compose lines with y-axis labels.
  const lines: string[] = [];
  for (let r = 0; r < height; r++) {
    const ratio = (height - 1 - r) / (height - 1);
    const yTickVal = max * ratio;
    const ylabel =
      r === 0 || r === height - 1 || r === Math.floor(height / 2)
        ? formatY(yTickVal).padStart(yWidth)
        : " ".repeat(yWidth);
    lines.push(`${ylabel} │ ${rows[r].join("")}`);
  }
  // x-axis baseline
  lines.push(`${" ".repeat(yWidth)} └${"─".repeat(totalCols + 1)}`);

  // x-axis labels (sparsely)
  if (labels?.length) {
    const labelLine: string[] = Array.from({ length: totalCols }, () => " ");
    const stride = Math.max(1, Math.floor(values.length / 4));
    for (let i = 0; i < values.length; i += stride) {
      const lab = labels[i] ?? "";
      const startCol = i * colsPerBar;
      for (let k = 0; k < lab.length && startCol + k < totalCols; k++) {
        labelLine[startCol + k] = lab[k];
      }
    }
    lines.push(`${" ".repeat(yWidth)}   ${labelLine.join("")}`);
  }

  return lines;
}
