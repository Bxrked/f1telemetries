/**
 * diag-track.mjs — reproduces f1Service.getTrackOutline() + the replay's
 * grid-moment dot placement, then reports the geometry.
 *
 * Run:  node diag-track.mjs
 * Needs Node 18+ (global fetch). No dependencies.
 */

const OPENF1 = "https://api.openf1.org/v1";
const JOLPICA = "https://api.jolpi.ca/ergast/f1";

const j = async (url) => {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} :: ${url}`);
  return r.json();
};
const n1 = (v) => (typeof v === "number" ? v.toFixed(1) : String(v));
const hr = (t) => console.log("\n" + "─".repeat(64) + "\n" + t);

/* ── 1. Resolve the session exactly like the app does ─────────────── */
hr("1. SESSION");
const jd = await j(`${JOLPICA}/current/last/results.json`);
const race = jd.MRData.RaceTable.Races[0];
const raceIso = `${race.date}T${race.time ?? "00:00:00Z"}`;
console.log(`Jolpica latest race : ${race.raceName} (${race.season} R${race.round})`);
console.log(`Circuit             : ${race.Circuit.circuitName}`);
console.log(`Race date           : ${raceIso}`);

const sessions = await j(`${OPENF1}/sessions?year=${race.season}&session_name=Race`);
const raceTime = new Date(raceIso).getTime();
const session = sessions.find(
  (s) => Math.abs(new Date(s.date_start).getTime() - raceTime) < 2 * 86_400_000
);
if (!session) throw new Error("no OpenF1 session matched race date");
console.log(`OpenF1 session_key  : ${session.session_key}  (${session.location}, ${session.country_name})`);
console.log(`session.date_start  : ${session.date_start}`);

/* ── 2. The reference lap the app would pick ──────────────────────── */
hr("2. REFERENCE LAP (the one getTrackOutline traces)");
const laps = await j(`${OPENF1}/laps?session_key=${session.session_key}&lap_number>=8&lap_number<=14`);
const lap = laps.find(
  (l) => l.date_start && l.duration_sector_1 && l.duration_sector_2 && l.duration_sector_3 && !l.is_pit_out_lap
);
if (!lap) throw new Error(`no clean reference lap (got ${laps.length} rows)`);
const lapMs =
  (lap.lap_duration ?? lap.duration_sector_1 + lap.duration_sector_2 + lap.duration_sector_3) * 1000;
console.log(`driver_number       : ${lap.driver_number}`);
console.log(`lap_number          : ${lap.lap_number}`);
console.log(`date_start          : ${lap.date_start}`);
console.log(`lap_duration        : ${lap.lap_duration}s   (window used: ${(lapMs / 1000).toFixed(3)}s)`);
console.log(`sectors             : ${lap.duration_sector_1} / ${lap.duration_sector_2} / ${lap.duration_sector_3}`);
console.log(`is_pit_out_lap      : ${lap.is_pit_out_lap}`);
console.log(`>> NOTE: nothing here rejects a pit-IN lap. If this driver pitted on`);
console.log(`   this lap, the trace ends in the pit lane and the outline is wrong.`);

/* ── 3. The traced outline ────────────────────────────────────────── */
hr("3. OUTLINE TRACE (/location, one driver, one lap)");
const t0 = new Date(lap.date_start).getTime();
const iso = (ms) => new Date(ms).toISOString();
const raw = await j(
  `${OPENF1}/location?session_key=${session.session_key}` +
    `&driver_number=${lap.driver_number}` +
    `&date>${encodeURIComponent(iso(t0))}&date<${encodeURIComponent(iso(t0 + lapMs))}`
);
console.log(`rows returned       : ${raw.length}`);

const zeros = raw.filter((p) => p.x === 0 && p.y === 0).length;
const pts = raw
  .filter((p) => p.x != null && p.y != null)
  .map((p) => ({ t: new Date(p.date).getTime(), x: p.x, y: p.y }))
  .sort((a, b) => a.t - b.t);
console.log(`(0,0) rows          : ${zeros}   <- these blow up the bounding box`);
console.log(`usable samples      : ${pts.length}`);

const span = pts.length ? pts[pts.length - 1].t - pts[0].t : 0;
console.log(`time span covered   : ${(span / 1000).toFixed(2)}s of ${(lapMs / 1000).toFixed(2)}s  ` +
  `(${((span / lapMs) * 100).toFixed(1)}% of the lap)`);
if (span < lapMs * 0.9) console.log(`>> ⚠ TRACE IS PARTIAL — the outline cannot cover the whole circuit.`);

let maxGap = 0, maxJump = 0;
for (let i = 1; i < pts.length; i++) {
  maxGap = Math.max(maxGap, pts[i].t - pts[i - 1].t);
  maxJump = Math.max(maxJump, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
}
console.log(`largest time gap    : ${maxGap}ms  (normal ≈ 270ms @ 3.7Hz)`);
console.log(`largest spatial jump: ${n1(maxJump)} units  <- a huge value = the straight-line artifact`);

const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
console.log(`trace bbox          : x [${n1(minX)} .. ${n1(maxX)}]  y [${n1(minY)} .. ${n1(maxY)}]`);

const closure = pts.length ? Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) : 0;
console.log(`loop closure error  : ${n1(closure)} units (first vs last point; should be small)`);

/* The exact transform the app builds. */
const W = 660, H = 360, PAD = 30;
const scale = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxY - minY || 1));
const ox = (W - (maxX - minX) * scale) / 2;
const oy = (H - (maxY - minY) * scale) / 2;
const project = (x, y) => [ox + (x - minX) * scale, H - (oy + (y - minY) * scale)];
console.log(`transform           : scale=${scale.toFixed(5)} ox=${n1(ox)} oy=${n1(oy)}`);

/* ── 4. Where the cars actually are at lights-out ─────────────────── */
hr("4. GRID MOMENT (what the replay draws as dots)");
const lap1 = await j(`${OPENF1}/laps?session_key=${session.session_key}&lap_number=1`);
const starts = lap1.map((l) => (l.date_start ? new Date(l.date_start).getTime() : null)).filter(Boolean);
const raceStart = starts.length ? Math.min(...starts) : new Date(session.date_start).getTime();
const simTime = raceStart - 5_000;
console.log(`raceStart (lights)  : ${new Date(raceStart).toISOString()}`);
console.log(`replay opens at     : ${new Date(simTime).toISOString()} (raceStart - 5s)`);

const gridRows = await j(
  `${OPENF1}/location?session_key=${session.session_key}` +
    `&date>${encodeURIComponent(iso(simTime - 3000))}&date<${encodeURIComponent(iso(simTime + 3000))}`
);
console.log(`rows in that window : ${gridRows.length}`);

const byDriver = {};
for (const p of gridRows) {
  if (p.x == null || p.y == null) continue;
  (byDriver[p.driver_number] ??= []).push({ t: new Date(p.date).getTime(), x: p.x, y: p.y });
}
const cars = Object.entries(byDriver).map(([num, arr]) => {
  arr.sort((a, b) => a.t - b.t);
  const last = arr[arr.length - 1];
  return { num: +num, x: last.x, y: last.y, svg: project(last.x, last.y) };
});
console.log(`drivers with a fix  : ${cars.length}`);
console.log(`grid (0,0) fixes    : ${cars.filter((c) => c.x === 0 && c.y === 0).length}`);

if (cars.length) {
  const gx = cars.map((c) => c.x), gy = cars.map((c) => c.y);
  console.log(`grid bbox (world)   : x [${n1(Math.min(...gx))} .. ${n1(Math.max(...gx))}]  ` +
    `y [${n1(Math.min(...gy))} .. ${n1(Math.max(...gy))}]`);
  const outside = cars.filter((c) => c.x < minX || c.x > maxX || c.y < minY || c.y > maxY);
  console.log(`cars OUTSIDE the trace bbox : ${outside.length} / ${cars.length}`);
  const offCanvas = cars.filter((c) => c.svg[0] < 0 || c.svg[0] > W || c.svg[1] < 0 || c.svg[1] > H);
  console.log(`cars off the 660x360 canvas : ${offCanvas.length} / ${cars.length}`);
  console.log(`\n  #   world x      world y        -> svg x    svg y`);
  cars.sort((a, b) => a.num - b.num).slice(0, 25).forEach((c) => {
    console.log(`  ${String(c.num).padStart(2)}  ${n1(c.x).padStart(10)} ${n1(c.y).padStart(12)}` +
      `   ->  ${n1(c.svg[0]).padStart(7)} ${n1(c.svg[1]).padStart(7)}`);
  });
}

/* ── 5. Verdict ───────────────────────────────────────────────────── */
hr("5. VERDICT");
const v = [];
if (zeros > 0) v.push(`${zeros} zero-coordinate samples are inflating the outline bbox.`);
if (span < lapMs * 0.9) v.push(`Trace covers only ${((span / lapMs) * 100).toFixed(0)}% of the lap — outline is a partial circuit.`);
if (maxJump > (maxX - minX) * 0.25) v.push(`A ${n1(maxJump)}-unit jump means the polyline teleports — bad sample or pit detour.`);
if (closure > (maxX - minX) * 0.15) v.push(`Loop does not close (${n1(closure)} units) — reference lap is probably an in-lap.`);
if (cars.length) {
  const outside = cars.filter((c) => c.x < minX || c.x > maxX || c.y < minY || c.y > maxY).length;
  if (outside) v.push(`${outside} cars sit outside the traced bbox — dots MUST render off-track.`);
}
console.log(v.length ? v.map((s, i) => `${i + 1}. ${s}`).join("\n") : "No anomaly detected by these checks.");
console.log("");
