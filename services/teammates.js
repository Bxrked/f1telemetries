/**
 * Teammate battles — season-long head-to-head inside each team.
 * ------------------------------------------------------------------
 * Pure maths over Jolpica race objects (no fetch, no React), so
 * `diag-teammates.mjs` runs the exact same code against the live season.
 *
 * Rules, chosen so a number never claims more than happened:
 *  - The PAIR for a team is the two drivers who started the most races
 *    together (a mid-season swap leaves the others listed, not compared).
 *  - Race result counts only races where BOTH were classified — a win
 *    over a retired teammate says nothing about pace.
 *  - Qualifying and fastest lap count only where both set one.
 *  - Sprints add to points, never to the race tally.
 *  - Points and best result are each driver's own, with this team.
 * ------------------------------------------------------------------
 */

/** "1:22.670" / "58.123" → seconds (null if unreadable). */
export function lapSeconds(str) {
  if (!str) return null;
  const parts = String(str).split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** Jolpica pages split a race across page boundaries — stitch by round. */
export function mergeRaces(pages, key) {
  const byRound = new Map();
  for (const race of pages.flat()) {
    const hit = byRound.get(race.round);
    if (hit) hit[key] = [...(hit[key] ?? []), ...(race[key] ?? [])];
    else byRound.set(race.round, { ...race, [key]: [...(race[key] ?? [])] });
  }
  return [...byRound.values()].sort((a, b) => +a.round - +b.round);
}

const classified = (row) => /^\d+$/.test(row?.positionText ?? "");
const codeOf = (d) => d.code ?? d.familyName.slice(0, 3).toUpperCase();

const ROWS = [
  { key: "points", label: "Points" },
  { key: "race", label: "Race result" },
  { key: "quali", label: "Qualifying" },
  { key: "fastest", label: "Fastest lap" },
  { key: "best", label: "Best result" },
];

/**
 * @param {{ results: any[], qualifying: any[], sprints: any[] }} season  merged Jolpica races
 * @returns {{ season: number, afterRound: number, teams: any[] }}
 */
export function buildTeammateBattles({ results, qualifying, sprints }) {
  /* constructorId → { name, drivers: Map(driverId → tally), rounds: Map(round → rows) } */
  const teams = new Map();
  const team = (c) => {
    let t = teams.get(c.constructorId);
    if (!t) teams.set(c.constructorId, (t = { id: c.constructorId, name: c.name, drivers: new Map(), rounds: new Map() }));
    return t;
  };
  const driver = (t, row) => {
    const id = row.Driver.driverId;
    let d = t.drivers.get(id);
    if (!d) {
      d = {
        id,
        code: codeOf(row.Driver),
        name: `${row.Driver.givenName} ${row.Driver.familyName}`,
        given: row.Driver.givenName,
        family: row.Driver.familyName,
        number: +(row.number ?? row.Driver.permanentNumber) || null,
        points: 0,
        best: null,
        races: 0,
      };
      t.drivers.set(id, d);
    }
    return d;
  };
  const round = (t, r) => {
    let x = t.rounds.get(r);
    if (!x) t.rounds.set(r, (x = { race: new Map(), quali: new Map() }));
    return x;
  };

  for (const race of results) {
    for (const row of race.Results ?? []) {
      const t = team(row.Constructor);
      const d = driver(t, row);
      d.points += +row.points || 0;
      d.races += 1;
      if (classified(row)) d.best = d.best == null ? +row.position : Math.min(d.best, +row.position);
      round(t, race.round).race.set(d.id, {
        pos: classified(row) ? +row.position : null,
        lap: lapSeconds(row.FastestLap?.Time?.time),
      });
    }
  }
  for (const race of sprints) {
    for (const row of race.SprintResults ?? []) driver(team(row.Constructor), row).points += +row.points || 0;
  }
  for (const race of qualifying) {
    for (const row of race.QualifyingResults ?? []) {
      const t = team(row.Constructor);
      round(t, race.round).quali.set(driver(t, row).id, +row.position);
    }
  }

  const out = [];
  for (const t of teams.values()) {
    /* The pair: most races started together; a tie goes to the later pairing. */
    const together = new Map();
    for (const [r, x] of t.rounds) {
      const ids = [...x.race.keys()].sort();
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const k = `${ids[i]}|${ids[j]}`;
          const hit = together.get(k) ?? { n: 0, last: 0 };
          together.set(k, { n: hit.n + 1, last: Math.max(hit.last, +r) });
        }
    }
    const top = [...together.entries()].sort((x, y) => y[1].n - x[1].n || y[1].last - x[1].last)[0];
    if (!top) continue; // never ran two cars in one race
    let [a, b] = top[0].split("|").map((id) => t.drivers.get(id));

    const tally = { race: [0, 0], quali: [0, 0], fastest: [0, 0] };
    for (const x of t.rounds.values()) {
      const ra = x.race.get(a.id), rb = x.race.get(b.id);
      if (ra && rb) {
        if (ra.pos != null && rb.pos != null) tally.race[ra.pos < rb.pos ? 0 : 1]++;
        if (ra.lap != null && rb.lap != null && ra.lap !== rb.lap) tally.fastest[ra.lap < rb.lap ? 0 : 1]++;
      }
      const qa = x.quali.get(a.id), qb = x.quali.get(b.id);
      if (qa != null && qb != null && qa !== qb) tally.quali[qa < qb ? 0 : 1]++;
    }

    /* [a, b, winner] per row; lower is better only for best result. */
    const lead = (x, y, lowerWins = false) => (x == null || y == null || x === y ? null : (lowerWins ? x < y : x > y) ? "a" : "b");
    const values = () => ({
      points: [a.points, b.points, lead(a.points, b.points)],
      race: [...tally.race, lead(...tally.race)],
      quali: [...tally.quali, lead(...tally.quali)],
      fastest: [...tally.fastest, lead(...tally.fastest)],
      best: [a.best, b.best, lead(a.best, b.best, true)],
    });
    let v = values();
    const wins = (side) => Object.values(v).filter((row) => row[2] === side).length;
    /* Left seat goes to whoever is ahead: rows won, then points. */
    if (wins("b") > wins("a") || (wins("b") === wins("a") && b.points > a.points)) {
      [a, b] = [b, a];
      for (const k of Object.keys(tally)) tally[k].reverse();
      v = values();
    }

    out.push({
      id: t.id,
      name: t.name,
      together: top[1].n,
      points: [...t.drivers.values()].reduce((s, d) => s + d.points, 0),
      a: { id: a.id, code: a.code, name: a.name, given: a.given, family: a.family, number: a.number },
      b: { id: b.id, code: b.code, name: b.name, given: b.given, family: b.family, number: b.number },
      score: { a: wins("a"), b: wins("b") },
      rows: ROWS.map(({ key, label }) => ({ key, label, a: v[key][0], b: v[key][1], winner: v[key][2] })),
      others: [...t.drivers.values()]
        .filter((d) => d.id !== a.id && d.id !== b.id)
        .map((d) => ({ code: d.code, name: d.name, races: d.races })),
    });
  }
  out.sort((x, y) => y.points - x.points);

  const last = results[results.length - 1];
  return { season: +(last?.season ?? 0), afterRound: +(last?.round ?? 0), raceName: last?.raceName ?? null, teams: out };
}
