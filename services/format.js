/**
 * Shared timing formatters.
 * F1 convention: anything at or over a minute is m:ss.mmm; shorter
 * splits (sectors) stay as raw seconds. Monaco/Austria laps were ~70s
 * so raw seconds looked fine — Spa's 107s laps exposed the difference.
 */

/** 107.638 → "1:47.638" · 48.456 → "48.456" */
export function formatLapTime(seconds, decimals = 3) {
  if (seconds == null || !isFinite(seconds)) return "—";
  if (seconds < 60) return seconds.toFixed(decimals);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(decimals).padStart(decimals + 3, "0")}`;
}

/** Always m:ss.mmm, even under a minute (axis labels, pace charts). */
export function formatClock(seconds, decimals = 2) {
  if (seconds == null || !isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(decimals).padStart(decimals + 3, "0")}`;
}

/** Sector splits: raw seconds with an "s" suffix. */
export function formatSector(seconds, decimals = 3) {
  if (seconds == null || !isFinite(seconds)) return "—";
  return `${seconds.toFixed(decimals)}s`;
}

/**
 * Build an SVG path from traced points, breaking the line at dropouts.
 * A GPS hole leaves two valid points far apart; connecting them draws a
 * straight line across the circuit that isn't part of the track. Starting
 * a new subpath (M instead of L) leaves an honest gap instead.
 */
export function tracePath(points, gapFactor = 8) {
  if (!points || points.length < 2) return "";
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const steps = [];
  for (let i = 1; i < points.length; i++) steps.push(dist(points[i], points[i - 1]));
  const sorted = [...steps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const limit = median * gapFactor;

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const jump = dist(points[i], points[i - 1]) > limit;
    d += `${jump ? " M " : " L "}${points[i][0]} ${points[i][1]}`;
  }
  return d;
}
