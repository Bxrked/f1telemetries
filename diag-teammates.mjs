/**
 * Teammate battles against the live season — prints every team's table.
 *   node diag-teammates.mjs [season]     (default: current)
 * Runs the same pure code the page uses (services/teammates.js).
 */
import { buildTeammateBattles, mergeRaces } from "./services/teammates.js";

const SEASON = process.argv[2] ?? "current";
const BASE = `https://api.jolpi.ca/ergast/f1/${SEASON}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function all(path, key) {
  const pages = [];
  for (let offset = 0, total = 1; offset < total; offset += 100) {
    const res = await fetch(`${BASE}/${path}.json?limit=100&offset=${offset}`);
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    const json = await res.json();
    total = +json.MRData.total;
    pages.push(json.MRData.RaceTable.Races);
    await sleep(300);
  }
  return mergeRaces(pages, key);
}

const [results, qualifying, sprints] = [
  await all("results", "Results"),
  await all("qualifying", "QualifyingResults"),
  await all("sprint", "SprintResults"),
];
const out = buildTeammateBattles({ results, qualifying, sprints });
console.log(`${out.season} after round ${out.afterRound} (${out.raceName}) — ${results.length} races, ${sprints.length} sprints\n`);
for (const t of out.teams) {
  console.log(`${t.name}  ·  ${t.a.code} ${t.score.a}–${t.score.b} ${t.b.code}  ·  ${t.together} races together`);
  for (const r of t.rows) {
    const mark = r.winner === "a" ? t.a.code : r.winner === "b" ? t.b.code : "—";
    console.log(`  ${r.label.padEnd(12)} ${String(r.a ?? "–").padStart(5)}  ${String(r.b ?? "–").padStart(5)}   ${mark}`);
  }
  if (t.others.length) console.log(`  also drove: ${t.others.map((d) => `${d.code} (${d.races})`).join(", ")}`);
  console.log();
}
