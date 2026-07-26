/**
 * diag.mjs — inspect what OpenF1 actually returns for the track trace.
 * Run with:  node diag.mjs
 * Requires Node 18+ (built-in fetch). No install needed.
 */

const OPENF1 = "https://api.openf1.org/v1";
const JOLPICA = "https://api.jolpi.ca/ergast/f1";

const get = async (url, label) => {
  const t = Date.now();
  const res = await fetch(url);
  const ms = Date.now() - t;
  if (!res.ok) {
    console.log(`  ✗ ${label}: HTTP ${res.status} (${ms}ms)`);
    return null;
  }
  const data = await res.json();
  console.log(`  ✓ ${label}: ${Array.isArray(data) ? data.length + " rows" : "ok"} (${ms}ms)`);
  return data;
};

const stats = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return {
    min: s[0],
    med: s[Math.floor(s.length / 2)],
    p95: s[Math.floor(s.length * 0.95)],
    max: s[s.length - 1],
  };
};

console.log("=== 1. LATEST RACE (Jolpica) ===");
const last = await get(`${JOLPICA}/current/last/results.json?limit=1`, "last race");
const race = last?.MRData?.RaceTable?.Races?.[0];
if (!race) { console.log("no race — stopping"); process.exit(0); }
console.log(`  → ${race.raceName}  round ${race.round}  ${race.date}`);

console.log("\n=== 2. OPENF1 SESSION MATCH ===");
const sessions = await get(`${OPENF1}/sessions?year=${race.season}&session_name=Race`, "race sessions");
const raceMs = new Date(`${race.date}T${race.time || "14:00:00Z"}`).getTime();
const match = (sessions || []).find(
  (s) => Math.abs(new Date(s.date_start).getTime() - raceMs) < 2 * 86400000
);
if (!match) { console.log("  ✗ no session matched the race date — stopping"); process.exit(0); }
console.log(`  → session_key=${match.session_key}  ${match.location}  start=${match.date_start}`);
const KEY = match.session_key;

console.log("\n=== 3. LAPS ===");
const laps = await get(`${OPENF1}/laps?session_key=${KEY}&lap_number>=6&lap_number<=16`, "laps 6-16");
const clean = (laps || []).filter(
  (l) => l.date_start && l.lap_duration > 0 && !l.is_pit_out_lap &&
         l.duration_sector_1 && l.duration_sector_2 && l.duration_sector_3
);
console.log(`  → ${clean.length} clean candidate laps`);
if (!clean.length) { console.log("  ✗ none usable — stopping"); process.exit(0); }
clean.sort((a, b) => a.lap_duration - b.lap_duration);
const lap = clean[0];
console.log(`  → chosen: driver #${lap.driver_number} lap ${lap.lap_number}  ${lap.lap_duration}s`);
console.log(`     start=${lap.date_start}`);

console.log("\n=== 4. LOCATION FOR THAT LAP ===");
const t0 = new Date(lap.date_start).getTime();
const t1 = t0 + lap.lap_duration * 1000;
const iso = (ms) => new Date(ms).toISOString();
const url =
  `${OPENF1}/location?session_key=${KEY}&driver_number=${lap.driver_number}` +
  `&date>${encodeURIComponent(iso(t0))}&date<${encodeURIComponent(iso(t1))}`;
console.log(`  requested window: ${iso(t0)} → ${iso(t1)}  (${(lap.lap_duration).toFixed(1)}s)`);
const loc = await get(url, "location");
if (!loc?.length) { console.log("  ✗ empty — stopping"); process.exit(0); }

const drivers = [...new Set(loc.map((p) => p.driver_number))];
const times = loc.map((p) => new Date(p.date).getTime());
const spanS = (Math.max(...times) - Math.min(...times)) / 1000;
console.log(`  → drivers present: ${drivers.join(", ")}   ${drivers.length > 1 ? "⚠ MORE THAN ONE" : "(ok)"}`);
console.log(`  → actual time span: ${spanS.toFixed(1)}s   ${spanS > lap.lap_duration * 1.5 ? "⚠ DATE FILTER IGNORED" : "(ok)"}`);
console.log(`  → returned ${loc.length} points  (expect ~${Math.round(lap.lap_duration * 3.7)} at 3.7Hz)`);

const pts = loc
  .filter((p) => p.x != null && p.y != null && !(p.x === 0 && p.y === 0))
  .map((p) => ({ t: new Date(p.date).getTime(), x: p.x, y: p.y }))
  .sort((a, b) => a.t - b.t);
console.log(`  → usable (non-null, non-zero): ${pts.length}`);
const zeros = loc.filter((p) => p.x === 0 && p.y === 0).length;
if (zeros) console.log(`  ⚠ ${zeros} points at exactly (0,0)`);

console.log("\n=== 5. GEOMETRY ===");
const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
console.log(`  x: ${minX} … ${maxX}   (span ${(maxX - minX).toFixed(0)})`);
console.log(`  y: ${minY} … ${maxY}   (span ${(maxY - minY).toFixed(0)})`);

const steps = [];
for (let i = 1; i < pts.length; i++) {
  steps.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
}
const st = stats(steps);
console.log(`  step distance — min ${st.min.toFixed(0)}  median ${st.med.toFixed(0)}  p95 ${st.p95.toFixed(0)}  MAX ${st.max.toFixed(0)}`);
console.log(`  teleports (>6× median): ${steps.filter((d) => d > st.med * 6).length}   ${steps.filter((d) => d > st.med * 6).length ? "⚠ these draw chords across the map" : "(none)"}`);

const diag = Math.hypot(maxX - minX, maxY - minY);
const gap = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
console.log(`  loop closure gap: ${gap.toFixed(0)}  =  ${((gap / diag) * 100).toFixed(1)}% of diagonal   ${gap / diag <= 0.25 ? "(closes ✓)" : "⚠ DOES NOT CLOSE — this is why the trace is rejected"}`);

console.log("\n=== 6. WHERE ARE THE CARS AT RACE START? ===");
const lap1 = await get(`${OPENF1}/laps?session_key=${KEY}&lap_number=1`, "lap 1");
const starts = (lap1 || []).map((l) => l.date_start).filter(Boolean).map((d) => new Date(d).getTime());
if (starts.length) {
  const rs = Math.min(...starts);
  const grid = await get(
    `${OPENF1}/location?session_key=${KEY}&date>${encodeURIComponent(iso(rs))}&date<${encodeURIComponent(iso(rs + 4000))}`,
    "grid positions"
  );
  const g = (grid || []).filter((p) => p.x != null && !(p.x === 0 && p.y === 0));
  if (g.length) {
    const gx = g.map((p) => p.x), gy = g.map((p) => p.y);
    console.log(`  cars x: ${Math.min(...gx)} … ${Math.max(...gx)}`);
    console.log(`  cars y: ${Math.min(...gy)} … ${Math.max(...gy)}`);
    const inside =
      Math.min(...gx) >= minX - (maxX - minX) * 0.1 && Math.max(...gx) <= maxX + (maxX - minX) * 0.1 &&
      Math.min(...gy) >= minY - (maxY - minY) * 0.1 && Math.max(...gy) <= maxY + (maxY - minY) * 0.1;
    console.log(`  → cars inside the traced track's bounds? ${inside ? "YES ✓" : "NO ⚠ (different coordinate region)"}`);
  }
}
console.log("\n=== DONE — paste everything above ===");
