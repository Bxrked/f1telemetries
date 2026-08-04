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
 *  - Bars are near-square. Generously rounded bars are a consumer-SaaS
 *    tell; instruments have hard edges.
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

/** Category axis ticks (driver codes, compounds) — brighter, bolder. */
export const TICK_CATEGORY = {
  fill: "#8B95A7",
  fontSize: 9.5,
  fontFamily: "var(--font-timing)",
  fontWeight: 700,
} as const;

export const AXIS_LINE = { stroke: "#1E2430" } as const;

/** Hover cursor wash — just enough to locate the row. */
export const CURSOR = { fill: "rgba(255,255,255,0.025)" } as const;

/** Bar geometry. Near-square corners, thin bars, high density. */
export const BAR = {
  radiusH: [0, 2, 2, 0] as [number, number, number, number],
  radiusV: [2, 2, 0, 0] as [number, number, number, number],
  maxSize: 11,
};

/** Neutral series colour for data with no team or status meaning. */
export const NEUTRAL = "#5B6678";

/** FIA timing-screen sector colours, reused by charts. */
export const SECTOR = { s1: "#E10600", s2: "#3B9BFF", s3: "#FFD644" } as const;

/** Tyre compound colours, matching the Tailwind tyre-* tokens. */
export const COMPOUND: Record<string, string> = {
  SOFT: "#FF3B30",
  MEDIUM: "#FFD644",
  HARD: "#E7EAF0",
  INTER: "#43D675",
  WET: "#3B9BFF",
};
