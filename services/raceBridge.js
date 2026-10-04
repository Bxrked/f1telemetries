/**
 * Race bridge — OpenF1's classification standing in for Jolpica's.
 * ------------------------------------------------------------------
 * Jolpica is the site's source for "the latest race" (classification,
 * grid, points, standings) and it stays that way. But it is run by
 * volunteers and can take most of a day to publish a race, while OpenF1
 * has the laps, GPS and a classification within the hour. Until Jolpica
 * catches up, this module builds a race in JOLPICA'S SHAPE from OpenF1's
 * `session_result`, so every getter downstream works unchanged — and the
 * moment Jolpica publishes, the site is back on Jolpica with no switch
 * to flip.
 *
 * Pure (no fetch, no React): `diag-bridge.mjs` runs the same code against
 * the live APIs.
 *
 * What OpenF1 cannot give, and the site therefore shows as missing while
 * bridged: the reason for a retirement (it only says "did not finish"),
 * the fastest-lap award, championship standings, and anything a steward
 * changes afterwards. The GRID it does have: the timing feed's first
 * position sample is the starting order with penalties applied (22/22
 * against Jolpica at Sepang 2026, where 14 cars started out of their
 * qualifying slot) — qualifying order is only the fallback.
 * ------------------------------------------------------------------
 */

import { teamKey } from "./teamColors.js"; // explicit .js: the diag script runs this under plain Node

/** A race that started this long ago is over (2 h limit, 3 h window with stoppages — plus margin). */
export const RACE_OVER_MS = 3.5 * 60 * 60 * 1000;
/** Past this, an unpublished round isn't "late" — it didn't happen (cancelled), so stop waiting for it. */
export const BRIDGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const startMs = (race) => new Date(race.time ? `${race.date}T${race.time}` : `${race.date}T14:00:00Z`).getTime();

/**
 * The newest round on the calendar that has finished but is not in
 * Jolpica's results yet — or null when Jolpica is up to date.
 * @param {any[]} scheduleRaces  Jolpica calendar, in round order
 * @param {number|string} publishedRound  round of Jolpica's latest result
 */
export function unpublishedRace(scheduleRaces, publishedRound, now = Date.now()) {
  const due = (scheduleRaces ?? []).filter((r) => {
    const t = startMs(r);
    return +r.round > +publishedRound && Number.isFinite(t) && t + RACE_OVER_MS < now && now - t < BRIDGE_WINDOW_MS;
  });
  return due.length ? due[due.length - 1] : null;
}

/**
 * Starting order from OpenF1 /position rows taken before the start: each
 * car's FIRST sample. Null unless it looks like a grid (most of a field,
 * every slot used once).
 * @returns {Record<number, number>|null}
 */
export function gridFromPositions(rows) {
  if (!Array.isArray(rows)) return null;
  const grid = {};
  [...rows]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((r) => {
      if (grid[r.driver_number] == null && r.position > 0) grid[r.driver_number] = r.position;
    });
  const slots = Object.values(grid);
  return slots.length >= 10 && new Set(slots).size === slots.length ? grid : null;
}

/** 6434.808 → "1:47:14.808" (Jolpica's format for the winner's time). */
function raceClock(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

/** Identity from OpenF1 alone — only for a car Jolpica has never listed this season. */
function identityFromOpenF1(d, num) {
  return {
    Driver: {
      driverId: `car_${num}`,
      permanentNumber: String(num),
      code: d?.name_acronym ?? String(num),
      givenName: d?.first_name ?? "",
      familyName: d?.last_name ?? `#${num}`,
      nationality: null,
    },
    Constructor: { constructorId: teamKey(d?.team_name) ?? "unknown", name: d?.team_name ?? "—" },
  };
}

/**
 * @param {object} o
 * @param {any}   o.race        the round's entry from the Jolpica calendar (season, round, raceName, Circuit, date, time)
 * @param {any[]} o.rows        OpenF1 /session_result rows
 * @param {Record<number, number>|null} [o.grid] starting slot per car number (gridFromPositions)
 * @param {any[]} [o.qualifying] Jolpica QualifyingResults for the round — identity, and the grid if `grid` is missing
 * @param {any[]} [o.previous]  Results of Jolpica's latest published race — identity for anyone not in qualifying
 * @param {any[]} [o.drivers]   OpenF1 /drivers rows — last-resort identity
 * @returns {any|null} a race in Jolpica's shape, or null if the rows aren't a usable classification
 */
export function buildBridgedRace({ race, rows, grid = null, qualifying = [], previous = [], drivers = [] }) {
  if (!race || !Array.isArray(rows) || rows.length < 2) return null;

  /* Who each car number is. Qualifying for THIS round wins (it has any
     mid-season driver change); the previous race covers the rest. */
  const who = {};
  for (const r of [...previous, ...qualifying]) {
    if (r?.Driver && r?.Constructor) who[+r.number] = { Driver: r.Driver, Constructor: r.Constructor };
  }
  const openf1 = {};
  drivers.forEach((d) => (openf1[d.driver_number] = d));
  /* Grid, best source first: the timing feed (penalties applied), then
     qualifying order (penalties NOT applied), then the finishing order —
     no invented gains. A car missing from the source started from the
     back (Jolpica's "0"). */
  const gridSource = grid ? "timing" : qualifying.length ? "qualifying" : "finish-order";
  const gridOf = {};
  if (grid) Object.entries(grid).forEach(([n, slot]) => (gridOf[+n] = +slot));
  else qualifying.forEach((q) => (gridOf[+q.number] = +q.position));

  /* Classified cars in order, then the unclassified by distance covered. */
  const classified = rows.filter((r) => r.position != null).sort((a, b) => a.position - b.position);
  const rest = rows.filter((r) => r.position == null).sort((a, b) => (b.number_of_laps ?? 0) - (a.number_of_laps ?? 0));
  const winner = classified[0];
  if (!winner || winner.position !== 1 || winner.dnf || !(winner.number_of_laps > 0)) return null;
  const leadLaps = winner.number_of_laps;

  const Results = [...classified, ...rest].map((r, i) => {
    const num = r.driver_number;
    const pos = i + 1;
    const out = !!(r.dnf || r.dns || r.dsq);
    const lapsDown = leadLaps - (r.number_of_laps ?? 0);
    const id = who[num] ?? identityFromOpenF1(openf1[num], num);
    const row = {
      number: String(num),
      position: String(pos),
      positionText: r.dsq ? "D" : r.dns ? "W" : r.dnf ? "R" : String(pos),
      points: String(r.points ?? 0),
      Driver: id.Driver,
      Constructor: id.Constructor,
      grid: gridSource === "finish-order" ? String(pos) : String(gridOf[num] ?? 0),
      laps: String(r.number_of_laps ?? 0),
      /* OpenF1 doesn't say why a car stopped. */
      status: r.dsq ? "Disqualified" : r.dns ? "Did not start" : r.dnf ? "Retired" : lapsDown > 0 ? `+${lapsDown} Lap${lapsDown > 1 ? "s" : ""}` : "Finished",
    };
    if (!out && lapsDown === 0 && typeof r.duration === "number" && r.duration > 0) {
      /* A missing gap is null, and +null is 0 — which would read as a dead heat. */
      const g = r.gap_to_leader;
      const gap = g != null && g !== "" && Number.isFinite(+g) ? +g : r.duration - winner.duration;
      if (pos === 1) row.Time = { millis: String(Math.round(r.duration * 1000)), time: raceClock(r.duration) };
      else if (Number.isFinite(gap) && gap >= 0) row.Time = { millis: String(Math.round(r.duration * 1000)), time: `+${gap.toFixed(3)}` };
    }
    return row;
  });

  return {
    season: race.season,
    round: race.round,
    url: race.url,
    raceName: race.raceName,
    Circuit: race.Circuit,
    date: race.date,
    time: race.time,
    Results,
    /* Marks the race as standing in for Jolpica's — see getPublisherLag(). */
    provisional: { source: "openf1", grid: gridSource },
  };
}
