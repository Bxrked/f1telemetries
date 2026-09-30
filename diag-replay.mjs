/**
 * diag-replay.mjs — checks replay LAP MODE against real GPS.
 *
 *   node diag-replay.mjs            # latest race
 *   node diag-replay.mjs 11377      # a specific OpenF1 session_key
 *
 * Builds the lap-mode timeline exactly as the app does (same model file),
 * then pulls short windows of real /location for the whole field at
 * several points in the race and reports how far each predicted car is
 * from where it actually was — measured ALONG the track, which is what
 * a viewer reads (lateral offset is just racing line vs reference line).
 *
 * Also scores two naive placements, so the speed-profile warp has to
 * earn its complexity:
 *   - "lap-linear":    constant speed over the whole lap
 *   - "sector-linear": constant speed within each sector
 *
 * Read-only, no install, no dev server. Paces itself under 3 req/s.
 */

import {
  buildReference, buildDriverLaps, createTimeline, buildTrackStatus,
  detectOvertakes, refDistAt, pointAtDist, floorIndex,
} from "./services/replayModel.js";

const B = "https://api.openf1.org/v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await sleep(400);
    const r = await fetch(B + path);
    if (r.status === 429) { await sleep(2000 * attempt); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
    return r.json();
  }
  throw new Error(`rate limited: ${path}`);
}
const iso = (ms) => new Date(ms).toISOString().slice(0, 23);

/* ---- Session ---- */
let key = process.argv[2];
if (!key) {
  const year = new Date().getUTCFullYear();
  const sessions = (await get(`/sessions?year=${year}&session_name=Race`))
    .filter((s) => Date.parse(s.date_end) < Date.now());
  key = sessions[sessions.length - 1].session_key;
  console.log(`latest race: ${sessions[sessions.length - 1].location} (session ${key})`);
}

const laps = await get(`/laps?session_key=${key}`);
const pits = await get(`/pit?session_key=${key}`);
const rc = await get(`/race_control?session_key=${key}`);
const positions = await get(`/position?session_key=${key}`);

/* ---- Reference lap: same selection rule as traceSessionCircuit ---- */
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const clean = laps.filter((l) => l.lap_number >= 5 && l.lap_number <= 30 && l.date_start && l.lap_duration > 0 &&
  !l.is_pit_out_lap && l.duration_sector_1 && l.duration_sector_2 && l.duration_sector_3);
const m = med(clean.map((l) => l.lap_duration));
const seen = new Set();
const candidates = clean.filter((l) => l.lap_duration <= m * 1.07 && !seen.has(l.driver_number) && seen.add(l.driver_number)).slice(0, 8);

let best = null;
for (const lap of candidates) {
  const t0 = Date.parse(lap.date_start);
  const raw = await get(`/location?session_key=${key}&driver_number=${lap.driver_number}&date>${iso(t0)}&date<${iso(t0 + lap.lap_duration * 1000)}`);
  const s = raw.filter((p) => p.x != null && !(p.x === 0 && p.y === 0)).map((p) => ({ t: Date.parse(p.date), x: p.x, y: p.y })).sort((a, b) => a.t - b.t);
  if (s.length < 50) continue;
  const xs = s.map((p) => p.x), ys = s.map((p) => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const err = Math.hypot(s[0].x - s.at(-1).x, s[0].y - s.at(-1).y) / diag;
  if (!best || err < best.err) best = { lap, samples: s, err };
  if (best.err <= 0.08) break;
}
const ref = buildReference(best.samples, best.lap);
console.log(`reference: car #${best.lap.driver_number} lap ${best.lap.lap_number}, closure ${(best.err * 100).toFixed(1)}%, ${ref.n} samples, lap length ${ref.total.toFixed(0)} units`);

/* ---- Timeline ---- */
const driverLaps = buildDriverLaps(laps);
const maxLap = Math.max(...laps.map((l) => l.lap_number));
const finishers = new Set(Object.entries(driverLaps).filter(([, ls]) => ls.at(-1).n >= maxLap - 3).map(([n]) => +n));
const pitRows = pits.filter((p) => p.date && p.pit_duration > 0).map((p) => ({ num: p.driver_number, t: Date.parse(p.date), lane: p.pit_duration, lap: p.lap_number }));
const tl = createTimeline({ reference: ref, laps: driverLaps, finishers, pits: pitRows });
console.log(`timeline: ${tl.nums.length} cars, ${tl.totalLaps} laps, race ${((tl.raceEnd - tl.raceStart) / 60000).toFixed(1)} min`);

/* ---- Pit timestamp semantics ----
   Compare pit.date with the end of the lap it's filed under. If it
   lands about one lane-time after the line, pit.date marks the EXIT. */
const offsets = pitRows
  .map((p) => {
    const l = driverLaps[p.num]?.find((x) => x.n === p.lap);
    return l?.end != null ? { after: (p.t - l.end) / 1000, lane: p.lane } : null;
  })
  .filter(Boolean);
const ratio = offsets.map((o) => o.after / o.lane).sort((a, b) => a - b);
console.log(`pit.date vs in-lap end: ${offsets.length} stops · (date − lap end) ÷ lane time: median ${ratio[Math.floor(ratio.length / 2)]?.toFixed(2)}, range ${ratio[0]?.toFixed(2)}…${ratio.at(-1)?.toFixed(2)}`);

/* ---- Track status + overtakes ---- */
const status = buildTrackStatus(rc, tl.leaderStarts, tl.raceEnd);
console.log(`track status: ${status.map((s) => `${s.type.toUpperCase()} L${tl.lapAt(s.from)}–L${tl.lapAt(s.to)} (${((s.to - s.from) / 1000).toFixed(0)}s)`).join(", ") || "none"}`);
const pitTimes = {};
pitRows.forEach((p) => (pitTimes[p.num] ??= []).push(p.t));
const passes = detectOvertakes(positions, { raceStart: tl.raceStart, pitTimes, excludeDuring: status });
console.log(`overtakes: ${passes.length}`);

/* ---- Accuracy vs real GPS ---- */
/* Nearest point on the reference path → lap distance. Brute force over
   ~400 samples is fine for a diagnostic. */
const along = (x, y) => {
  let bestD = Infinity, bestDist = 0;
  for (let i = 0; i < ref.n; i++) {
    const d = Math.hypot(ref.x[i] - x, ref.y[i] - y);
    if (d < bestD) { bestD = d; bestDist = ref.d[i]; }
  }
  let r = bestDist - ref.line;
  if (r < 0) r += ref.total;
  return { dist: r, lateral: bestD };
};
const wrapDiff = (a, b) => {
  let d = Math.abs(a - b) % ref.total;
  return Math.min(d, ref.total - d);
};

/* Naive baselines, from the same lap tables. */
const naive = (num, t, bySector) => {
  const ls = driverLaps[num];
  const i = floorIndex(ls.map((l) => l.start), t);
  if (i < 0) return null;
  const l = ls[i];
  if (l.end == null || t > l.end) return null;
  if (bySector && l.b1 != null && ref.sectorBounds.length === 4) {
    const tb = [l.start, l.b1, l.b2, l.end];
    const db = [0, refDistAt(ref, ref.sectorBounds[1]), refDistAt(ref, ref.sectorBounds[2]), ref.total];
    let k = 2;
    for (let s = 0; s < 3; s++) if (t < tb[s + 1]) { k = s; break; }
    return db[k] + (db[k + 1] - db[k]) * ((t - tb[k]) / (tb[k + 1] - tb[k]));
  }
  return ((t - l.start) / (l.end - l.start)) * ref.total;
};

const probes = [0.15, 0.35, 0.55, 0.8].map((f) => tl.raceStart + f * (tl.raceEnd - tl.raceStart));
/* Plus two probes inside every neutralisation, where behaviour differs. */
for (const s of status) probes.push(s.from + (s.to - s.from) * 0.35, s.from + (s.to - s.from) * 0.7);
const errs = { warp: [], sector: [], lap: [] };
const scErr = [], scSector = [];
const worst = [];
for (const t of probes) {
  const raw = await get(`/location?session_key=${key}&date>${iso(t - 1500)}&date<${iso(t + 1500)}`);
  const byCar = {};
  raw.forEach((p) => { if (p.x != null && !(p.x === 0 && p.y === 0)) (byCar[p.driver_number] ??= []).push({ t: Date.parse(p.date), x: p.x, y: p.y }); });
  const underSc = status.some((s) => t >= s.from && t <= s.to);
  for (const [numStr, pts] of Object.entries(byCar)) {
    const num = +numStr;
    const c = tl.carAt(num, t);
    if (!c || c.state !== "racing" || c.inPit || c.held) continue;
    pts.sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t));
    const actual = pts[0];
    if (Math.abs(actual.t - t) > 400) continue;
    const a = along(actual.x, actual.y);
    if (a.lateral > ref.total * 0.01) continue; // off the reference line: pit lane
    /* Compare at the sample's own timestamp. */
    const pc = tl.carAt(num, actual.t);
    const e = wrapDiff(pc.dist, a.dist);
    (underSc ? scErr : errs.warp).push(e);
    const lap = driverLaps[num].find((l) => l.n === pc.lap);
    worst.push({
      e, num, lap: pc.lap, underSc,
      pred: pc.dist, act: a.dist,
      into: lap ? ((actual.t - lap.start) / 1000).toFixed(1) : "?",
      lapLen: lap?.duration?.toFixed(1) ?? "open",
      sectors: lap?.b1 != null,
    });
    if (underSc) {
      const s = naive(num, actual.t, true);
      if (s != null) scSector.push(wrapDiff(s, a.dist));
    }
    if (!underSc) {
      const s = naive(num, actual.t, true), l = naive(num, actual.t, false);
      if (s != null) errs.sector.push(wrapDiff(s, a.dist));
      if (l != null) errs.lap.push(wrapDiff(l, a.dist));
    }
  }
}

/* OpenF1 world units: report as % of a lap and, using the known lap
   length if given (e.g. `LAP_M=6003`), in metres. */
const lapM = +process.env.LAP_M || null;
const fmt = (arr) => {
  if (!arr.length) return "n/a";
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const show = (v) => (lapM ? `${((v / ref.total) * lapM).toFixed(0)} m` : `${((v / ref.total) * 100).toFixed(2)}% lap`);
  return `median ${show(q(0.5))} · p90 ${show(q(0.9))} · max ${show(s.at(-1))} (n=${s.length})`;
};
console.log("\nalong-track error vs real GPS (green-flag running):");
console.log(`  speed-profile warp (app): ${fmt(errs.warp)}`);
console.log(`  sector-linear baseline:   ${fmt(errs.sector)}`);
console.log(`  lap-linear baseline:      ${fmt(errs.lap)}`);
if (scErr.length) {
  console.log(`  under safety car (warp):          ${fmt(scErr)}`);
  console.log(`  under safety car (sector-linear): ${fmt(scSector)}`);
}

/* Worst individual placements — where to look when a number above moves. */
const toM = (v) => (lapM ? `${((v / ref.total) * lapM).toFixed(0)}m` : `${((v / ref.total) * 100).toFixed(1)}%`);
console.log("\nworst placements:");
worst.sort((a, b) => b.e - a.e).slice(0, 6).forEach((w) =>
  console.log(`  #${w.num} L${w.lap}${w.underSc ? " (SC)" : ""}: off by ${toM(w.e)} · predicted ${toM(w.pred)} vs actual ${toM(w.act)} into lap · ${w.into}s into a ${w.lapLen}s lap${w.sectors ? "" : " · no sector splits"}`)
);
