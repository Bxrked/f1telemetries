/**
 * Is the site waiting on Jolpica, and what would OpenF1 stand in with?
 *   node diag-bridge.mjs            the real situation right now
 *   node diag-bridge.mjs 15         pretend Jolpica has only published up to round 15
 * Runs the same pure code the site uses (services/raceBridge.js) against
 * the live APIs and prints the bridged classification. The second form is
 * how to exercise the bridge when Jolpica is not actually behind; it also
 * compares the bridge with Jolpica's own result if that exists by now.
 */
import { unpublishedRace, buildBridgedRace, gridFromPositions } from "./services/raceBridge.js";

const J = "https://api.jolpi.ca/ergast/f1/current";
const O = "https://api.openf1.org/v1";
const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status} ${(await res.text()).slice(0, 80)}`);
  return res.json();
};

const pretend = process.argv[2];
const last = (await get(`${J}/${pretend ? +pretend : "last"}/results.json?limit=30`)).MRData.RaceTable.Races[0];
if (pretend) console.log(`(pretending Jolpica has published nothing after round ${+pretend})`);
const schedule = (await get(`${J}.json?limit=100`)).MRData.RaceTable.Races;
console.log(`Jolpica's latest race: round ${last.round} ${last.raceName} (winner ${last.Results[0].Driver.code})`);

const next = unpublishedRace(schedule, last.round);
if (!next) {
  console.log("Jolpica is up to date — no race is waiting, the bridge is not used.");
  process.exit(0);
}
const hours = ((Date.now() - new Date(`${next.date}T${next.time}`).getTime()) / 3_600_000).toFixed(1);
console.log(`Waiting on: round ${next.round} ${next.raceName} — started ${hours} h ago, not in Jolpica's results.\n`);

const sessions = await get(`${O}/sessions?year=${next.season}&session_name=Race`);
const raceTime = new Date(`${next.date}T${next.time}`).getTime();
const session = sessions.find((s) => Math.abs(new Date(s.date_start).getTime() - raceTime) < 2 * 86_400_000);
if (!session) throw new Error("no OpenF1 session matches that race");
const rows = await get(`${O}/session_result?session_key=${session.session_key}`);
const qualifying = await get(`${J}/${+next.round}/qualifying.json?limit=100`).then((j) => j.MRData.RaceTable.Races[0]?.QualifyingResults ?? [], () => []);
const drivers = await get(`${O}/drivers?session_key=${session.session_key}`).catch(() => []);
const gridCut = new Date(new Date(session.date_start).getTime() + 120_000).toISOString().slice(0, 19);
/* OpenF1 allows 3 requests a second; this script makes four in a row. */
await new Promise((r) => setTimeout(r, 1200));
const startOrder = await get(`${O}/position?session_key=${session.session_key}&date<${gridCut}`).catch((err) => {
  console.log(`(start order unavailable — ${err.message.slice(-60)}; falling back to qualifying order)`);
  return null;
});

const race = buildBridgedRace({ race: next, rows, grid: gridFromPositions(startOrder), qualifying, previous: last.Results, drivers });
if (!race) {
  console.log("OpenF1 has no usable classification yet — the site keeps showing the previous race, with the notice.");
  process.exit(0);
}
console.log(`OpenF1 session ${session.session_key} (${session.location}) stands in · grid from ${race.provisional.grid} · ${qualifying.length} qualifying rows\n`);
console.log("Pos  No  Code  Driver                    Team             Grid  Laps  Pts  Status        Time");
for (const r of race.Results) {
  console.log(
    [
      r.positionText.padStart(3),
      r.number.padStart(3),
      (r.Driver.code ?? "").padEnd(5),
      `${r.Driver.givenName} ${r.Driver.familyName}`.padEnd(25),
      r.Constructor.name.slice(0, 16).padEnd(16),
      r.grid.padStart(4),
      r.laps.padStart(5),
      r.points.padStart(4),
      " " + r.status.padEnd(13),
      r.Time?.time ?? "",
    ].join(" ")
  );
}
const missing = race.Results.filter((r) => !r.Driver.nationality).map((r) => r.Driver.code);
if (missing.length) console.log(`\nNo Jolpica identity (OpenF1 names used, no flag): ${missing.join(", ")}`);

/* If Jolpica has the race after all, say how close the stand-in was. */
const real = await get(`${J}/${+next.round}/results.json?limit=30`).then((j) => j.MRData.RaceTable.Races[0], () => null);
if (real?.Results?.length) {
  const by = Object.fromEntries(real.Results.map((r) => [r.number, r]));
  const diff = (label, pick) => {
    const off = race.Results.filter((r) => by[r.number] && pick(r) !== pick(by[r.number]));
    console.log(`  ${label.padEnd(10)} ${off.length ? `${off.length} differ: ${off.slice(0, 8).map((r) => `${r.Driver.code} ${pick(r)}→${pick(by[r.number])}`).join(", ")}` : "identical"}`);
  };
  console.log(`\nJolpica has since published round ${real.round}. Bridge vs Jolpica (bridge→Jolpica):`);
  diff("position", (r) => r.position);
  diff("points", (r) => String(+r.points));
  diff("grid", (r) => r.grid);
  diff("laps", (r) => r.laps);
  diff("status", (r) => r.status);
  diff("time", (r) => r.Time?.time || "-"); // Jolpica gives a retired car an empty string
}
