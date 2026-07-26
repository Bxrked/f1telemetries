/**
 * diag2.mjs — test the NEW trace algorithm against live OpenF1 data.
 * Run:  node diag2.mjs
 * Node 18+, no install. Read-only; doesn't touch your app.
 */

const OPENF1 = "https://api.openf1.org/v1";
const JOLPICA = "https://api.jolpi.ca/ergast/f1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, label, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 429) { console.log(`  … rate limited, waiting (${i})`); await sleep(2000 * i); continue; }
    console.log(`  ✗ ${label}: HTTP ${res.status}`);
    return null;
  }
  console.log(`  ✗ ${label}: still rate limited`);
  return null;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* --- the exact functions now shipping in f1Service.js --- */
function despikeTrace(pts, factor = 6) {
  if (pts.length < 20) return pts;
  const steps = [];
  for (let i = 1; i < pts.length; i++) steps.push(dist(pts[i], pts[i - 1]));
  const sorted = [...steps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const limit = median * factor;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[i - 1], next = pts[i + 1];
    const farPrev = prev ? dist(pts[i], prev) > limit : false;
    const farNext = next ? dist(pts[i], next) > limit : false;
    const isolated = prev && next ? farPrev && farNext : farPrev || farNext;
    if (!isolated) out.push(pts[i]);
  }
  return out.length >= 20 ? out : pts;
}

function closeLoop(pts, minFraction = 0.6) {
  if (pts.length < 40) return null;
  const start = pts[0];
  const from = Math.floor(pts.length * minFraction);
  let bestIdx = -1, bestDist = Infinity;
  for (let i = from; i < pts.length; i++) {
    const d = dist(pts[i], start);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  if (bestIdx < 0) return null;
  const loop = pts.slice(0, bestIdx + 1);
  const xs = loop.map((p) => p[0]), ys = loop.map((p) => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const ratio = bestDist / diag;
  return { loop, ratio, accepted: diag > 0 && ratio <= 0.12, bestIdx };
}

console.log("=== resolving latest race ===");
const last = await get(`${JOLPICA}/current/last/results.json?limit=1`, "last race");
const race = last?.MRData?.RaceTable?.Races?.[0];
console.log(`  ${race.raceName} round ${race.round}`);

const sessions = await get(`${OPENF1}/sessions?year=${race.season}&session_name=Race`, "sessions");
const raceMs = new Date(`${race.date}T${race.time || "14:00:00Z"}`).getTime();
const match = sessions.find((s) => Math.abs(new Date(s.date_start).getTime() - raceMs) < 2 * 86400000);
const KEY = match.session_key;
console.log(`  session_key=${KEY} ${match.location}`);

await sleep(400);
const laps = await get(`${OPENF1}/laps?session_key=${KEY}&lap_number>=6&lap_number<=16`, "laps");
const clean = laps.filter(
  (l) => l.date_start && l.lap_duration > 0 && !l.is_pit_out_lap &&
         l.duration_sector_1 && l.duration_sector_2 && l.duration_sector_3
).sort((a, b) => a.lap_duration - b.lap_duration);

/* Try the three fastest clean laps — if one is unusable we want to know
   whether ANY lap works, not just the single fastest. */
for (const lap of clean.slice(0, 3)) {
  console.log(`\n=== driver #${lap.driver_number} lap ${lap.lap_number} (${lap.lap_duration}s) ===`);
  const t0 = new Date(lap.date_start).getTime();
  const t1 = t0 + lap.lap_duration * 1000 * 1.4; // over-fetch 1.4 laps
  const iso = (ms) => encodeURIComponent(new Date(ms).toISOString());
  await sleep(400);
  const raw = await get(
    `${OPENF1}/location?session_key=${KEY}&driver_number=${lap.driver_number}&date>${iso(t0)}&date<${iso(t1)}`,
    "location (1.4 laps)"
  );
  if (!raw?.length) continue;

  const pts = raw
    .filter((p) => p.x != null && p.y != null && !(p.x === 0 && p.y === 0))
    .map((p) => ({ t: new Date(p.date).getTime(), x: p.x, y: p.y }))
    .sort((a, b) => a.t - b.t)
    .map((p) => [p.x, p.y]);
  console.log(`  raw usable points: ${pts.length}`);

  const de = despikeTrace(pts);
  console.log(`  after despike:     ${de.length}  (removed ${pts.length - de.length} spikes)`);
  const stepsAfter = [];
  for (let i = 1; i < de.length; i++) stepsAfter.push(dist(de[i], de[i - 1]));
  const sortedSteps = [...stepsAfter].sort((a, b) => a - b);
  console.log(`  step median ${sortedSteps[Math.floor(sortedSteps.length / 2)].toFixed(0)}  max ${Math.max(...stepsAfter).toFixed(0)}`);

  const res = closeLoop(de);
  if (!res) { console.log("  ✗ closeLoop returned null"); continue; }
  console.log(`  closing point at index ${res.bestIdx} of ${de.length}  (${((res.bestIdx / de.length) * 100).toFixed(0)}% through)`);
  console.log(`  closure gap: ${(res.ratio * 100).toFixed(1)}% of diagonal  → ${res.accepted ? "ACCEPTED ✓✓✓" : "rejected (needs ≤12%)"}`);
  console.log(`  final loop points: ${res.loop.length}`);
  if (res.accepted) {
    const xs = res.loop.map((p) => p[0]), ys = res.loop.map((p) => p[1]);
    console.log(`  bounds x ${Math.min(...xs)}…${Math.max(...xs)}  y ${Math.min(...ys)}…${Math.max(...ys)}`);
    console.log("\n  >>> THIS LAP PRODUCES A VALID CLOSED CIRCUIT <<<");
    break;
  }
}
console.log("\n=== DONE — paste everything above ===");
