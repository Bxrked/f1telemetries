/**
 * Team colours — the ONE table every surface reads.
 * ------------------------------------------------------------------
 * Two APIs each ship their own idea of a team's colour (Jolpica has
 * none, so it used a hand-kept table that had drifted — Audi was still
 * Sauber green; OpenF1 sends a hex per driver). Resolving both through
 * this table means the replay, tower, standings, worm and head-to-head
 * all show the same team in the same colour.
 *
 * Tuned for a near-black background rather than copied from liveries:
 * teams that share a hue family are pushed apart so dots stay tellable
 * at a glance —
 *   Red Bull deep blue  vs  Williams mid blue  vs  Racing Bulls pale blue
 *   Ferrari bright red  vs  Audi dim crimson
 *   Haas near-white     vs  Cadillac grey
 * ------------------------------------------------------------------
 */

export const TEAM_COLORS = {
  red_bull: "#2743A8",
  ferrari: "#FF1801",
  audi: "#A1182E",
  haas: "#E6E8EB",
  alpine: "#FF87BC",
  mclaren: "#F47600",
  mercedes: "#00D7B6",
  aston_martin: "#229971",
  williams: "#1868DB",
  rb: "#6C98FF",
  cadillac: "#909090",
  sauber: "#52E252", // pre-2026 seasons
};

export const UNKNOWN_TEAM_COLOR = "#8B95A7";

/* OpenF1 team names (and older spellings) → table key. Jolpica's
   constructorIds are already keys, bar the Racing Bulls alias. */
const ALIASES = {
  "red bull racing": "red_bull",
  "red bull": "red_bull",
  "racing bulls": "rb",
  "visa cash app rb": "rb",
  "rb": "rb",
  "racing_bulls": "rb",
  "haas f1 team": "haas",
  "haas": "haas",
  "kick sauber": "sauber",
  "stake f1 team kick sauber": "sauber",
  "sauber": "sauber",
  "aston martin": "aston_martin",
  "cadillac": "cadillac",
  "cadillac f1 team": "cadillac",
};

/** Table key for a Jolpica constructorId or an OpenF1 team_name. */
export function teamKey(nameOrId) {
  if (!nameOrId) return null;
  const s = String(nameOrId).trim().toLowerCase();
  if (TEAM_COLORS[s]) return s;
  if (ALIASES[s]) return ALIASES[s];
  const slug = s.replace(/\s+/g, "_");
  return TEAM_COLORS[slug] ? slug : null;
}

/**
 * Colour for a team. `fallback` is used for a team this table doesn't
 * know yet (a new entrant): the API's own hex beats a generic grey.
 */
export function teamColorFor(nameOrId, fallback) {
  const key = teamKey(nameOrId);
  return (key && TEAM_COLORS[key]) || fallback || UNKNOWN_TEAM_COLOR;
}
