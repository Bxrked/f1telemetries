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
 *  - Qualifying counts only sessions both took part in — the head-to-head
 *    and the Q2 / Q3 appearances alike, so a driver who missed a weekend
 *    isn't behind on a count they never had the chance to add to.
 *  - Sprints add to points, never to the race tally.
 *  - Points are each driver's own, with this team.
 * ------------------------------------------------------------------
 */

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
  { key: "quali", label: "Qualifying" },
  { key: "race", label: "Race" },
  { key: "q2", label: "Reached Q2" },
  { key: "q3", label: "Reached Q3" },
  { key: "points", label: "Points" },
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
        nationality: row.Driver.nationality || null,
        number: +(row.number ?? row.Driver.permanentNumber) || null,
        points: 0,
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
      round(t, race.round).race.set(d.id, { pos: classified(row) ? +row.position : null });
    }
  }
  for (const race of sprints) {
    for (const row of race.SprintResults ?? []) driver(team(row.Constructor), row).points += +row.points || 0;
  }
  for (const race of qualifying) {
    for (const row of race.QualifyingResults ?? []) {
      const t = team(row.Constructor);
      /* Jolpica includes a Q2 / Q3 field only for drivers who were IN that
         session (empty when they set no time) — presence is "reached". */
      round(t, race.round).quali.set(driver(t, row).id, { pos: +row.position, q2: "Q2" in row, q3: "Q3" in row });
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

    const tally = { race: [0, 0], quali: [0, 0], q2: [0, 0], q3: [0, 0] };
    for (const x of t.rounds.values()) {
      const ra = x.race.get(a.id), rb = x.race.get(b.id);
      if (ra?.pos != null && rb?.pos != null) tally.race[ra.pos < rb.pos ? 0 : 1]++;
      const qa = x.quali.get(a.id), qb = x.quali.get(b.id);
      if (qa && qb) {
        if (qa.pos !== qb.pos) tally.quali[qa.pos < qb.pos ? 0 : 1]++;
        [qa, qb].forEach((q, i) => {
          if (q.q2) tally.q2[i]++;
          if (q.q3) tally.q3[i]++;
        });
      }
    }

    /* [a, b, winner] per row. */
    const lead = (x, y) => (x === y ? null : x > y ? "a" : "b");
    const values = () => ({
      quali: [...tally.quali, lead(...tally.quali)],
      race: [...tally.race, lead(...tally.race)],
      q2: [...tally.q2, lead(...tally.q2)],
      q3: [...tally.q3, lead(...tally.q3)],
      points: [a.points, b.points, lead(a.points, b.points)],
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
      a: { id: a.id, code: a.code, name: a.name, given: a.given, family: a.family, number: a.number, nationality: a.nationality },
      b: { id: b.id, code: b.code, name: b.name, given: b.given, family: b.family, number: b.number, nationality: b.nationality },
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
