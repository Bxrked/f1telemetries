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
 * Plain continuous polyline through traced points.
 * Earlier versions tried to "break" the line at suspected GPS dropouts,
 * but distance-per-sample scales with speed, so every straight got cut
 * out of the map. Lap selection now handles bad data; drawing stays dumb.
 */
export function tracePath(points) {
  if (!points || points.length < 2) return "";
  return `M ${points.map((p) => p.join(" ")).join(" L ")}`;
}
