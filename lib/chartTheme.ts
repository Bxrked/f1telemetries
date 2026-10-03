/**
 * Shared Recharts styling — one source of truth for chart chrome.
 *
 * Every chart previously re-declared its own axis ticks, grid dash and
 * cursor fill, each slightly different (fontSize 9 vs 10, two grid
 * colours, three axis-line weights). Individually invisible; collectively
 * it's the main reason the lower half of the dashboard read as a pile of
 * separate widgets rather than one instrument.
 *
 * Choices worth keeping:
 *  - Grid is barely there. On a timing screen the DATA is the signal;
 *    gridlines are a reading aid, not decoration.
 *  - Ticks are mono and small. Numbers on axes are read positionally, so
 *    they need to align, not shout.
 *
 * Only the two line charts (position chart, degradation) and the
 * Head-to-Head gap chart still use Recharts; every ranked comparison is
 * drawn as plain rows (see TelemetryExhibits).
 */

/** Faint dashed grid — reading aid only. */
export const GRID = {
  strokeDasharray: "2 4",
  stroke: "#171B23",
} as const;

/** Numeric axis ticks (values). */
export const TICK = {
  fill: "#5B6678",
  fontSize: 9.5,
  fontFamily: "var(--font-timing)",
} as const;

export const AXIS_LINE = { stroke: "#1E2430" } as const;

/** Tyre compound colours, matching the Tailwind tyre-* tokens. */
export const COMPOUND: Record<string, string> = {
  SOFT: "#FF3B30",
  MEDIUM: "#FFD644",
  HARD: "#E7EAF0",
  INTER: "#43D675",
  WET: "#3B9BFF",
};
