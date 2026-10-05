/**
 * replayModel.js — pure maths behind the race replay.
 * ------------------------------------------------------------------
 * No fetching, no React: everything here takes plain OpenF1 rows and
 * returns plain values, so it runs identically in the browser and in
 * `node diag-replay.mjs`, which checks it against real GPS.
 *
 * LAP MODE — how a car is placed without streaming its GPS:
 *   Lap timing gives every driver's lap start and two sector splits:
 *   three anchors per lap. Moving at constant speed between anchors
 *   would crawl through straights and fly through hairpins. Instead we
 *   take the ONE real GPS lap already fetched to draw the circuit (the
 *   "reference lap") and use its time→distance curve as a speed profile.
 *   Each driver's sector is time-warped onto the reference's same sector,
 *   so cars brake where the reference braked and accelerate where it
 *   accelerated, while still hitting every official timing line exactly.
 *
 * Distances are in OpenF1 world units along the reference trace, with
 * 0 at the timing line. Nothing here projects to screen space — callers
 * use projectToTrack() with the outline's transform, the same one the
 * map uses, so dots and outline can't drift apart.
 * ------------------------------------------------------------------
 */

const lerp = (a, b, f) => a + (b - a) * f;
const clamp01 = (f) => (f < 0 ? 0 : f > 1 ? 1 : f);

/** Largest index i with arr[i] <= v, or -1. `arr` ascending. */
export function floorIndex(arr, v) {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/* ================================================================
 * SMOOTHING PRIMITIVES
 * ================================================================ */

/**
 * Centripetal Catmull-Rom point between p1 and p2 at u ∈ [0, 1].
 * Centripetal (α = 0.5) because it never overshoots into loops or cusps
 * on uneven spacing — GPS samples bunch in slow corners and spread on
 * straights, which is exactly the case uniform Catmull-Rom mangles.
 */
export function catmullRom(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, u) {
  const knot = (ax, ay, bx, by) => Math.max(1e-6, Math.sqrt(Math.hypot(bx - ax, by - ay)));
  const t1 = knot(p0x, p0y, p1x, p1y);
  const t2 = t1 + knot(p1x, p1y, p2x, p2y);
  const t3 = t2 + knot(p2x, p2y, p3x, p3y);
  const t = t1 + (t2 - t1) * u;
  const mix = (ax, ay, bx, by, ta, tb) => {
    const f = (t - ta) / (tb - ta);
    return [ax + (bx - ax) * f, ay + (by - ay) * f];
  };
  const [a1x, a1y] = mix(p0x, p0y, p1x, p1y, 0, t1);
  const [a2x, a2y] = mix(p1x, p1y, p2x, p2y, t1, t2);
  const [a3x, a3y] = mix(p2x, p2y, p3x, p3y, t2, t3);
  const [b1x, b1y] = mix(a1x, a1y, a2x, a2y, 0, t2);
  const [b2x, b2y] = mix(a2x, a2y, a3x, a3y, t1, t3);
  return mix(b1x, b1y, b2x, b2y, t1, t2);
}

/**
 * Monotone cubic (Fritsch–Carlson) slopes for y(x). Gives a curve with
 * continuous first derivative that never overshoots — for distance over
 * time that means continuous SPEED and a car that never runs backwards,
 * which plain linear interpolation (speed steps every sample) can't give.
 */
function monotoneSlopes(xs, ys) {
  const n = xs.length;
  const m = new Float64Array(n);
  const dk = new Float64Array(n - 1);
  for (let k = 0; k < n - 1; k++) dk[k] = (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k] || 1);
  m[0] = dk[0];
  m[n - 1] = dk[n - 2];
  for (let k = 1; k < n - 1; k++) m[k] = dk[k - 1] * dk[k] <= 0 ? 0 : (dk[k - 1] + dk[k]) / 2;
  for (let k = 0; k < n - 1; k++) {
    if (dk[k] === 0) { m[k] = 0; m[k + 1] = 0; continue; }
    const a = m[k] / dk[k], b = m[k + 1] / dk[k];
    const h = a * a + b * b;
    if (h > 9) { const tau = 3 / Math.sqrt(h); m[k] = tau * a * dk[k]; m[k + 1] = tau * b * dk[k]; }
  }
  return m;
}

function hermite(xs, ys, ms, x) {
  const k = Math.max(0, Math.min(xs.length - 2, floorIndex(xs, x)));
  const h = xs[k + 1] - xs[k] || 1;
  const u = (x - xs[k]) / h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * ys[k] + (u3 - 2 * u2 + u) * h * ms[k] + (-2 * u3 + 3 * u2) * ys[k + 1] + (u3 - u2) * h * ms[k + 1];
}

/* ================================================================
 * REFERENCE LAP — the racing line and its speed profile
 * ================================================================ */

/* Spline sub-points per GPS interval: ~14 m spacing at race speed → ~2 m,
   fine enough that a car's heading turns continuously through a corner
   instead of kinking at every sample. */
const SUBDIV = 8;

/**
 * @param samples  [{t, x, y}] GPS of one clean lap, time-sorted
 * @param lap      the OpenF1 /laps row for that lap
 *
 * Geometry: a closed centripetal Catmull-Rom loop through the samples,
 * resampled densely (x, y, d arrays). Timing: the moment the reference
 * car passed each sample, against that sample's distance along the loop,
 * interpolated monotone-cubic — so position AND speed are continuous.
 */
export function buildReference(samples, lap) {
  const t0 = Date.parse(lap.date_start);
  const lapMs = lap.lap_duration * 1000;
  const pts = samples.filter((s) => s.t >= t0 && s.t <= t0 + lapMs);
  const n = pts.length;
  if (n < 50) throw new Error("reference lap too sparse");

  /* Dense closed path. Segment i runs sample i → i+1 (the last closes
     back to sample 0). */
  const N = n * SUBDIV;
  const x = new Float64Array(N + 1), y = new Float64Array(N + 1), d = new Float64Array(N + 1);
  /* Elevation (3D view) along the same dense path. GPS height has the odd
     glitch sample, so median-filter it (window 5) before interpolating. */
  const zr = pts.map((p) => p.z ?? 0);
  const zs = zr.map((_, i) => {
    const w = [-2, -1, 0, 1, 2].map((o) => zr[((i + o) % n + n) % n]).sort((a, b) => a - b);
    return w[2];
  });
  const z = new Float64Array(N + 1);
  const at = (i) => pts[((i % n) + n) % n];
  const sampleDist = new Float64Array(n + 1); // arc distance at each sample
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    sampleDist[i] = acc;
    for (let k = 0; k < SUBDIV; k++) {
      const j = i * SUBDIV + k;
      const [px, py] = catmullRom(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, k / SUBDIV);
      if (j) acc += Math.hypot(px - x[j - 1], py - y[j - 1]);
      x[j] = px; y[j] = py; d[j] = acc;
      z[j] = zs[i] + (zs[(i + 1) % n] - zs[i]) * (k / SUBDIV);
    }
  }
  /* Close the loop back onto the first point. */
  acc += Math.hypot(x[0] - x[N - 1], y[0] - y[N - 1]);
  x[N] = x[0]; y[N] = y[0]; d[N] = acc; z[N] = z[0];
  const total = acc;
  sampleDist[n] = total;

  /* Time → raw distance knots. The extra knot is sample 0 again, one lap
     later, which spans the closing gap where the timing line sits. */
  const tk = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) tk[i] = pts[i].t - t0;
  tk[n] = tk[0] + lapMs;
  const mk = monotoneSlopes(tk, sampleDist);

  const ref = { x, y, z, d, n: N + 1, tk, dk: sampleDist, mk, total, lapMs, line: 0, sectorBounds: [0, lapMs] };
  /* The timing line: where the reference car was at the lap's start. */
  ref.line = rawDistAt(ref, 0) % total;

  const s1 = lap.duration_sector_1 * 1000;
  const s2 = lap.duration_sector_2 * 1000;
  ref.sectorBounds = s1 > 0 && s2 > 0 && s1 + s2 < lapMs ? [0, s1, s1 + s2, lapMs] : [0, lapMs];
  return ref;
}

/** Raw distance along the loop (from sample 0) at `ms` into the reference lap. */
function rawDistAt(ref, ms) {
  const { tk } = ref;
  if (ms < tk[0]) ms += ref.lapMs; // before the first sample: still in the closing gap
  return hermite(tk, ref.dk, ref.mk, Math.min(ms, tk[tk.length - 1]));
}

/** Lap distance (0 at the line, `total` at the next line) at `ms` into the reference lap. */
export function refDistAt(ref, ms) {
  if (ms <= 0) return 0;
  if (ms >= ref.lapMs) return ref.total;
  const r = (rawDistAt(ref, ms) % ref.total) - ref.line;
  return r < 0 ? r + ref.total : r;
}

/** World [x, y] at a lap distance. Wraps, so any real number is safe. */
export function pointAtDist(ref, dist) {
  const { x, y, d, n, total } = ref;
  let r = (dist + ref.line) % total;
  if (r < 0) r += total;
  const i = Math.max(0, Math.min(n - 2, floorIndex(d, r)));
  const f = (r - d[i]) / (d[i + 1] - d[i] || 1);
  return [lerp(x[i], x[i + 1], f), lerp(y[i], y[i + 1], f)];
}

/** World [x, y, z] at a lap distance. */
export function pointAtDist3(ref, dist) {
  const { x, y, z, d, n, total } = ref;
  let r = (dist + ref.line) % total;
  if (r < 0) r += total;
  const i = Math.max(0, Math.min(n - 2, floorIndex(d, r)));
  const f = (r - d[i]) / (d[i + 1] - d[i] || 1);
  return [lerp(x[i], x[i + 1], f), lerp(y[i], y[i + 1], f), lerp(z[i], z[i + 1], f)];
}

/* ================================================================
 * DRIVER LAPS
 * ================================================================ */

/**
 * OpenF1 /laps rows → per-driver lap tables with absolute timestamps.
 * `end` comes from lap_duration, or the next lap's start when the
 * duration is missing (OpenF1 routinely omits it on lap 1). A lap with
 * neither is left open; the timeline decides what that means.
 * Sector anchors are kept only when they're internally consistent.
 */
export function buildDriverLaps(rows) {
  const byDriver = {};
  for (const l of rows ?? []) {
    if (!l.date_start || !(l.lap_number > 0)) continue;
    (byDriver[l.driver_number] ??= []).push(l);
  }
  const out = {};
  for (const [num, list] of Object.entries(byDriver)) {
    list.sort((a, b) => a.lap_number - b.lap_number);
    const laps = list.map((l, i) => {
      const start = Date.parse(l.date_start);
      const next = list[i + 1];
      const end =
        l.lap_duration > 0
          ? start + l.lap_duration * 1000
          : next && next.lap_number === l.lap_number + 1
            ? Date.parse(next.date_start)
            : null;
      const s1 = l.duration_sector_1 * 1000;
      const s2 = l.duration_sector_2 * 1000;
      const ok = end != null && s1 > 0 && s2 > 0 && start + s1 + s2 < end;
      return {
        n: l.lap_number,
        start,
        end,
        b1: ok ? start + s1 : null,
        b2: ok ? start + s1 + s2 : null,
        pitOut: !!l.is_pit_out_lap,
        duration: end != null ? (end - start) / 1000 : null,
      };
    });
    out[num] = laps;
  }
  return out;
}

/* ================================================================
 * TRACK STATUS — SC / VSC / red flag periods
 * ================================================================ */

const isVsc = (msg) => /\bVSC\b/.test(msg) || msg.includes("VIRTUAL SAFETY CAR");
/* A red flag is usually a row with flag "RED" — but not always: Zandvoort
   and Monza 2026 have only the text "RED FLAG - RACE SUSPENDED", with no
   flag at all. Anchored, so a stewards' note that mentions a red flag
   can't stop the race. */
const isRedFlag = (r) => r.flag === "RED" || /^RED FLAG\b/.test(r.msg);

/** How long after the lights the pole car reaches the line (1.9 s at Sepang 2026, from car speed data). */
const LAUNCH_TO_LINE_MS = 1900;

/**
 * How the race got under way, when it WASN'T lights-out on lap 1.
 *
 * In the wet a race can start behind the safety car: the opening laps are
 * run behind it and count as race laps (the official race time runs from
 * there), then race control announces how the racing will begin —
 *   "STANDING START": the field lines up on the grid again and the lights
 *       go out at the start of the next lap (Sepang 2026: laps 1–2 behind
 *       the safety car, lights out for lap 3, 6½ minutes in), or
 *   "ROLLING START": racing begins when the leader next crosses the line
 *       (Spa 2025: four laps, green for lap 5).
 * Race control never says "SAFETY CAR DEPLOYED" for these laps, so
 * without this the replay showed lights out at the first of them and two
 * oddly slow "racing" laps.
 *
 * The same two messages also announce a restart after a red flag — that
 * is not a start, so a red flag between the session starting and the
 * message rules it out. (Lap timing can't tell: at Monaco 2024 the lap
 * data itself begins at the restart, forty minutes after the red flag. A
 * red flag BEFORE the session started is only a suspended start
 * procedure, as at Spa 2025.)
 *
 * @param rcRows OpenF1 /race_control rows
 * @param laps   buildDriverLaps() output
 * @returns null for an ordinary start, else
 *   { kind: "standing" | "rolling", behindSafetyCar: true, lap, t, announcedAt }
 *   — `lap` is the first racing lap, `t` the moment racing begins (lights
 *   out, or the leader at the line).
 */
export function detectStart(rcRows, laps) {
  const startsByLap = {};
  for (const list of Object.values(laps ?? {})) for (const l of list) (startsByLap[l.n] ??= []).push(l.start);
  Object.values(startsByLap).forEach((s) => s.sort((a, b) => a - b));
  const raceStart = startsByLap[1]?.[0];
  if (raceStart == null) return null;
  const field = startsByLap[1].length;

  const rows = (rcRows ?? [])
    .filter((r) => r.date)
    .map((r) => ({ t: Date.parse(r.date), msg: (r.message ?? "").toUpperCase().trim(), flag: r.flag ?? null }))
    .sort((a, b) => a.t - b.t);
  const began = Math.min(raceStart, rows.find((r) => r.msg === "SESSION STARTED" || r.msg === "RACE START")?.t ?? raceStart);
  let call = null;
  for (const r of rows) {
    if (r.t < began) continue;
    if (r.t > raceStart + 45 * 60_000) break;
    if (isRedFlag(r) || r.msg === "SESSION ABORTED") return null;
    if (r.t > raceStart && /^(STANDING|ROLLING) START\b/.test(r.msg)) { call = r; break; }
  }
  if (!call) return null;
  const kind = call.msg.startsWith("ROLLING") ? "rolling" : "standing";

  /* The first racing lap: the first one most of the field begins after
     the call (median, so a car already in the pit lane can't pull it
     forward). */
  const median = (s) => s[Math.floor(s.length / 2)];
  const lap = Object.keys(startsByLap).map(Number).sort((a, b) => a - b).find((n) => n >= 2 && median(startsByLap[n]) > call.t);
  if (!lap || lap > 12) return null;
  const starts = startsByLap[lap];
  const base = { kind, behindSafetyCar: true, lap, announcedAt: call.t };

  if (kind === "rolling") return { ...base, t: starts[0] };

  /* Off a grid the whole field crosses the line within a few seconds of
     each other (5.5 s for 17 cars at Sepang); cars starting from the pit
     lane crossed it long before. The pack's first crossing is the pole
     car, just after the lights. No such pack → not a grid start we can
     place, so say nothing. */
  for (let i = 0; i < starts.length; i++) {
    const inPack = starts.filter((s) => s >= starts[i] && s <= starts[i] + 10_000).length;
    if (inPack >= Math.max(4, field / 2)) return { ...base, t: starts[i] - LAUNCH_TO_LINE_MS };
  }
  return null;
}

/**
 * Neutralisation periods from race control.
 *
 * Race control writes the abbreviation ("VSC DEPLOYED", "VSC ENDING"),
 * not the spelled-out form — matching only "VIRTUAL SAFETY CAR" misses
 * every VSC. A full safety car's "IN THIS LAP" is an announcement; the
 * race actually goes green when the leader next crosses the line, so the
 * period is closed there. A red flag holds until the next green flag, or
 * until the session is started again.
 *
 * A VSC can be upgraded: "SAFETY CAR DEPLOYED" arrives with no "VSC
 * ENDING" before it. The VSC period ends there (`upgraded: true`) and a
 * safety car period begins — ignoring the second deployment left the
 * VSC running to the flag (Sepang 2026, laps 43–55), since only "VSC
 * ENDING" could close it.
 *
 * @param start detectStart() output (with `scEnd` from the timeline), or
 *   null. Laps behind the safety car before the start become a period of
 *   their own (`start: true`), and nothing said before racing began is read.
 */
export function buildTrackStatus(rcRows, leaderStarts, raceEnd, start = null) {
  const rows = (rcRows ?? [])
    .filter((r) => r.date)
    .map((r) => ({ t: Date.parse(r.date), msg: (r.message ?? "").toUpperCase(), flag: r.flag ?? null }))
    .sort((a, b) => a.t - b.t);
  const nextLine = (t) => {
    const i = floorIndex(leaderStarts, t);
    return leaderStarts[i + 1] ?? null;
  };

  const out = [];
  let open = null;
  const close = (type, to, extra) => {
    if (open && open.type === type) {
      out.push({ ...open, ...extra, to: Math.max(open.from, to) });
      open = null;
    }
  };
  const racingFrom = start?.behindSafetyCar ? start.t : null;
  if (racingFrom != null) out.push({ type: "sc", from: leaderStarts[0], to: start.scEnd ?? start.t, start: true });

  for (const r of rows) {
    if (racingFrom != null && r.t < racingFrom) continue;
    if (isRedFlag(r)) {
      if (open?.type === "red") continue; // said twice: as a flag and as text
      if (open) close(open.type, r.t);
      open = { type: "red", from: r.t };
      continue;
    }
    if (open?.type === "red" && (r.flag === "GREEN" || r.msg.trim() === "SESSION STARTED")) { close("red", r.t); continue; }

    if (r.msg.includes("SAFETY CAR") || /\bVSC\b/.test(r.msg)) {
      const vsc = isVsc(r.msg);
      if (r.msg.includes("DEPLOYED")) {
        if (open?.type === "vsc" && !vsc) close("vsc", r.t, { upgraded: true });
        if (!open) open = { type: vsc ? "vsc" : "sc", from: r.t };
      } else if (vsc && r.msg.includes("ENDING")) {
        close("vsc", r.t);
      } else if (!vsc && r.msg.includes("IN THIS LAP")) {
        close("sc", nextLine(r.t) ?? r.t + 90_000);
      }
    }
  }
  if (open) out.push({ ...open, to: raceEnd });
  return out;
}

/* ================================================================
 * TIMELINE — where every car is at time t
 * ================================================================ */

/**
 * @param reference   buildReference() output
 * @param laps        buildDriverLaps() output
 * @param finishers   Set of driver numbers classified as finishing
 * @param pits        [{num, t, lane}] — lane = pit-lane seconds
 * @param grid        {num: grid slot, 1 = pole}; 0/missing = back of the field
 * @param classification {num: {pos, millis}} official result — the order
 *                    and gaps once cars take the flag
 * @param start       detectStart() output, or null for lights-out on lap 1
 */
export function createTimeline({ reference, laps, finishers, pits, grid = {}, classification = {}, start = null }) {
  const ref = reference;
  const nums = Object.keys(laps).map(Number);
  /* A grid start that isn't on lap 1: after laps behind the safety car. */
  const late = start?.kind === "standing" && start.lap > 1 ? start : null;

  /* Per-driver lap-start index for binary search, and a median lap to
     close an open final lap. */
  const startsOf = {};
  const medianOf = {};
  for (const num of nums) {
    startsOf[num] = laps[num].map((l) => l.start);
    const durs = laps[num].map((l) => l.duration).filter((v) => v > 0).sort((a, b) => a - b);
    medianOf[num] = durs.length ? durs[Math.floor(durs.length / 2)] * 1000 : ref.lapMs;
  }

  /* Leader line crossings: earliest start of each lap across the field. */
  const leaderStartByLap = {};
  for (const num of nums) {
    for (const l of laps[num]) {
      if (leaderStartByLap[l.n] == null || l.start < leaderStartByLap[l.n]) leaderStartByLap[l.n] = l.start;
    }
  }
  /* The lap of a late grid start begins at the lights, as lap 1 does —
     not when a car bound for the pit lane crossed the line a minute
     earlier. */
  if (late && leaderStartByLap[late.lap] != null) leaderStartByLap[late.lap] = late.t;
  const lapNumbers = Object.keys(leaderStartByLap).map(Number).sort((a, b) => a - b);
  const leaderStarts = lapNumbers.map((n) => leaderStartByLap[n]);
  const totalLaps = lapNumbers[lapNumbers.length - 1] ?? 0;
  /* The official start — the race clock runs from here even when the
     racing begins later (`start.t`). */
  const raceStart = leaderStarts[0] ?? 0;

  /* When each car's race is over. Finishers: end of their last lap.
     Retirements: the start of the lap they never completed — where
     they stopped on that lap isn't in the timing data, so we stop the
     dot at the last line they're known to have crossed. */
  const doneAt = {};
  for (const num of nums) {
    const ls = laps[num];
    const last = ls[ls.length - 1];
    if (finishers.has(num)) doneAt[num] = last.end ?? last.start + medianOf[num];
    else doneAt[num] = last.end ?? last.start;
  }
  const raceEnd = Math.max(...nums.filter((n) => finishers.has(n)).map((n) => doneAt[n]), raceStart);

  /* OpenF1's pit `date` marks the EXIT: measured over 36 stops (Baku
     2026) it lands 0.88–0.95 lane-times after the in-lap's line crossing.
     So the car is in the lane for the `lane` seconds BEFORE that stamp. */
  const pitsOf = {};
  for (const p of pits ?? []) (pitsOf[p.num] ??= []).push(p);
  const inPitAt = (num, t) => (pitsOf[num] ?? []).some((p) => t >= p.t - p.lane * 1000 && t <= p.t);

  /* Grid slots: ~8 m apart, expressed as a fraction of the lap so it
     holds on any circuit. Cars sit in their slot before lights out and
     close the gap to the line over lap 1 — lap-1 timing starts at the
     lights for everyone, so without this the whole field stacks on the
     line until the first sector splits pull them apart. */
  const fieldSize = nums.length;
  const slotOf = (num) => (grid[num] > 0 ? grid[num] : fieldSize);
  const slotLen = ref.total * 0.00145;
  const gridBack = (num) => (slotOf(num) - 1) * slotLen;

  /**
   * Lap distance for a moment inside lap `l` of a car. `from` / `to`
   * replace the lap's own start and end when the car wasn't actually
   * lapping for all of it (see the late grid start below).
   */
  function distInLap(num, l, t, from = l.start, to = l.end ?? l.start + medianOf[num]) {
    /* Warp sector-by-sector when both laps have splits; otherwise the
       whole lap onto the whole reference lap. */
    const bySector = l.b1 != null && ref.sectorBounds.length === 4 && from < l.b1 && l.b2 < to;
    const tb = bySector ? [from, l.b1, l.b2, to] : [from, to];
    const rb = bySector ? ref.sectorBounds : [0, ref.lapMs];
    let k = tb.length - 2;
    for (let i = 0; i < tb.length - 1; i++) if (t < tb[i + 1]) { k = i; break; }
    const f = clamp01((t - tb[k]) / (tb[k + 1] - tb[k] || 1));
    return refDistAt(ref, lerp(rb[k], rb[k + 1], f));
  }

  /* ---- A grid start after laps behind the safety car ----------------
     The lap before it ends in a grid slot, not at the line: each car
     drives round to its slot, waits, and leaves when the lights go out.
     Lap timing doesn't say when it stopped (that lap has no third sector
     — it ends at the line, after the launch), so the run to the slot is
     paced from the car's own first two sectors.
       back  — how far behind the line the car waits
       park  — when it gets there
       go    — when it leaves: the lights, or the pit exit opening
     Measured against GPS at Sepang 2026 (17 cars on the grid):
       - pole waits 33 m behind the timing line, the rest 8.3 m apart
         behind it — hence the four extra slot lengths;
       - behind the safety car and forming up, the third sector took 1.3x
         what the first two would suggest (1.13–1.43).
     With those, every car waiting on the grid is drawn within 7 m of
     where it really was (median 4 m).
     A car that pitted on that lap starts from the pit lane: it crossed
     the line (in the lane) before the lights and is released once the
     grid has gone. It is drawn at the line, where the lane is, but ranked
     behind the last grid slot until then. */
  const GRID_TO_LINE_SLOTS = 4;
  const FORMING_UP_PACE = 1.3;
  const lateOf = {};
  let scEnd = null;
  if (late) {
    const sb = ref.sectorBounds;
    const s3Share = sb.length === 4 ? ((sb[3] - sb[2]) / sb[2]) * FORMING_UP_PACE : null;
    const fromPit = [];
    let gridGone = late.t;
    for (const num of nums) {
      const prev = laps[num].find((l) => l.n === late.lap - 1);
      const first = laps[num].find((l) => l.n === late.lap);
      if (!prev) continue;
      if (first && first.start < late.t - 1000) { fromPit.push({ num, first }); continue; }
      const lineAt = prev.b2 != null && s3Share != null ? prev.b2 + (prev.b2 - prev.start) * s3Share : late.t - 20_000;
      const park = Math.max(prev.start, Math.min(lineAt, late.t - 3000));
      const cross = first?.start ?? prev.end ?? late.t;
      lateOf[num] = { back: gridBack(num) + GRID_TO_LINE_SLOTS * slotLen, park, go: late.t, cross };
      if (scEnd == null || park < scEnd) scEnd = park;
      if (cross > gridGone) gridGone = cross;
    }
    fromPit
      .sort((a, b) => a.first.start - b.first.start)
      .forEach(({ num }, k) => {
        const exit = (pitsOf[num] ?? []).find((p) => p.t > late.t && p.t - p.lane * 1000 < late.t)?.t;
        lateOf[num] = { back: (fieldSize + GRID_TO_LINE_SLOTS + k) * slotLen, go: Math.max(gridGone, exit ?? 0), pit: true };
      });
  }
  /** The car's place in the start procedure at t, or null once it is simply lapping. */
  function lateStart(num, l, t) {
    const s = lateOf[num];
    if (!s) return null;
    /* `rank` is the distance the running order uses, when that isn't
       where the car is drawn (a car waiting in the pit lane). */
    const at = (dist, onGrid, rank = dist) => ({ num, state: "racing", progress: l.n - 1 + rank / ref.total, lap: l.n, dist, inPit: inPitAt(num, t), onGrid });
    const slot = ref.total - s.back;
    if (s.pit) {
      if (l.n === late.lap - 1) {
        const end = l.end ?? l.start + medianOf[num];
        if (t >= end) return at(0, true, -s.back + ref.total);
        const dist = distInLap(num, l, t);
        return at(dist, false, Math.min(dist, slot));
      }
      if (l.n !== late.lap) return null;
      if (t < s.go) return at(0, true, -s.back);
      return at(distInLap(num, l, t, s.go), false);
    }
    if (l.n !== late.lap - 1) return null;
    if (t < s.park) return at(Math.min(slot, distInLap(num, l, t, l.start, s.park)), false);
    if (t < s.go) return at(slot, true);
    /* Away: from the slot to the line, gathering speed. */
    const f = clamp01((t - s.go) / Math.max(1, s.cross - s.go));
    return at(slot + s.back * f * f, false);
  }

  /**
   * State of one car at time t.
   * state: "grid" before lights out, "racing", "finished", "retired".
   * progress: laps completed as a real number — the running-order key.
   */
  function carAt(num, t) {
    const ls = laps[num];
    if (!ls?.length) return null;
    if (t < ls[0].start) {
      const dist = -gridBack(num);
      return { num, state: "grid", progress: dist / ref.total, lap: 1, dist, inPit: false };
    }
    if (t >= doneAt[num]) {
      const last = ls[ls.length - 1];
      const fin = finishers.has(num);
      return {
        num,
        state: fin ? "finished" : "retired",
        progress: fin ? last.n : last.n - 1,
        lap: last.n,
        dist: 0,
        inPit: false,
        at: doneAt[num],
      };
    }
    const i = floorIndex(startsOf[num], t);
    const l = ls[i];
    const staged = late ? lateStart(num, l, t) : null;
    if (staged) return staged;
    const end = l.end ?? l.start + medianOf[num];
    /* Between the end of one lap and the start of the next (red flag, or
       a hole in the data): hold at the line rather than extrapolate. */
    if (t >= end) {
      return { num, state: "racing", progress: l.n, lap: l.n, dist: 0, inPit: inPitAt(num, t), held: true };
    }
    let dist = distInLap(num, l, t);
    if (l.n === 1) dist -= gridBack(num) * (1 - clamp01((t - l.start) / (end - l.start)));
    return {
      num,
      state: "racing",
      progress: l.n - 1 + dist / ref.total,
      lap: l.n,
      dist,
      inPit: inPitAt(num, t),
    };
  }

  /** Every car at time t, in running order, with world coordinates. */
  function snapshot(t) {
    const cars = [];
    for (const num of nums) {
      const c = carAt(num, t);
      if (!c) continue;
      const [x, y] = pointAtDist(ref, c.dist);
      c.x = x;
      c.y = y;
      cars.push(c);
    }
    /* Running order is race distance. A finisher's distance is whole laps,
       so a lapped car that has taken the flag still sits behind a lead-lap
       car finishing its last lap. Retirements drop to the back, ordered by
       how far they got; the grid is in grid order. */
    const rank = (c) =>
      c.state === "retired" ? c.progress - 1e6 : c.state === "grid" ? -1e3 - slotOf(c.num) : c.progress;
    cars.sort((a, b) => rank(b) - rank(a));

    /* Cars that have taken the flag take the OFFICIAL order among
       themselves. OpenF1 lap stamps are only good to ~0.2 s: at Baku 2026
       they put VER over the line 3 ms before RUS, who officially won by
       0.196 s. Finishers keep the slots they hold; only their order
       within those slots follows the classification. */
    const slots = [];
    cars.forEach((c, i) => c.state === "finished" && slots.push(i));
    const fin = slots.map((i) => cars[i]).sort((a, b) => (classification[a.num]?.pos ?? 99) - (classification[b.num]?.pos ?? 99));
    slots.forEach((slot, k) => (cars[slot] = fin[k]));
    return cars;
  }

  /** Race distance (laps, real) of a car at time t. Never decreases. */
  const progressOf = (num, t) => carAt(num, t)?.progress ?? -Infinity;

  /**
   * How long ago `other` was where `car` is now — a time gap that moves
   * continuously with the cars, instead of stepping at timing lines.
   * Binary search, since race distance only ever increases with time.
   * Null if `other` was already there more than LOOKBACK ago (a lap or
   * more ahead, or a long neutralisation).
   */
  const LOOKBACK = 300_000;
  function timeBehind(other, car, t) {
    const p = car.progress;
    let lo = t - LOOKBACK, hi = t;
    if (progressOf(other.num, lo) > p) return null;
    for (let k = 0; k < 28; k++) {
      const mid = (lo + hi) / 2;
      if (progressOf(other.num, mid) >= p) hi = mid; else lo = mid;
    }
    return Math.max(0, (t - hi) / 1000);
  }

  /** Official gap between two finishers, from the classification's race times. */
  const officialGap = (a, b) => {
    const ma = classification[a.num]?.millis, mb = classification[b.num]?.millis;
    return ma != null && mb != null ? Math.max(0, (ma - mb) / 1000) : null;
  };

  /**
   * Gap to leader and interval to the car ahead, in seconds, for a
   * snapshot's running order. Continuous while racing; the official
   * result's times once both cars have finished. Lapped cars report whole
   * laps instead of seconds.
   */
  function gaps(ordered, t) {
    const leader = ordered[0];
    const one = (car, other) => {
      /* Waiting for the lights: there is no gap to speak of yet. */
      if (car.state === "grid" || car.onGrid || car.state === "retired") return null;
      if (car.state === "finished" && other.state === "finished") return officialGap(car, other);
      return timeBehind(other, car, t);
    };
    return ordered.map((car, i) => {
      if (i === 0) return { num: car.num, gap: null, interval: null, lapsDown: 0, lapsToAhead: 0 };
      const ahead = ordered[i - 1];
      const lapsDown = Math.max(0, Math.floor(leader.progress - car.progress));
      const lapsToAhead = Math.max(0, Math.floor(ahead.progress - car.progress));
      return {
        num: car.num,
        gap: lapsDown >= 1 ? null : one(car, leader),
        interval: lapsToAhead >= 1 ? null : one(car, ahead),
        lapsDown,
        lapsToAhead,
      };
    });
  }

  /** Leader's lap at time t, clamped to the race. */
  function lapAt(t) {
    const i = floorIndex(leaderStarts, t);
    return i < 0 ? 1 : Math.min(lapNumbers[i], totalLaps);
  }

  /* When racing begins. `scEnd`: the laps behind the safety car are over
     once the first car is in its grid slot (the safety car has gone by
     then); for a rolling start they last until the green at the line. */
  const began = start ? { ...start, scEnd: (late ? scEnd : null) ?? start.t } : { kind: "standing", behindSafetyCar: false, lap: 1, t: raceStart };

  return { carAt, snapshot, gaps, lapAt, nums, leaderStarts, lapNumbers, totalLaps, raceStart, raceEnd, doneAt, start: began };
}

/* ================================================================
 * EVENTS
 * ================================================================ */

/**
 * On-track overtakes from the position stream. Deliberately conservative
 * — a missed pass is better than an invented one:
 *  - only ±1 swaps count (multi-place jumps are pit cycles),
 *  - nothing in the first 90 s (lap-1 shuffle is one "Lights out" event),
 *  - swaps within 35 s of either car's pit stop are excluded,
 *  - repeat swaps of the same pair within 45 s (DRS ping-pong) merge.
 */
export function detectOvertakes(positionRows, { raceStart, pitTimes, excludeDuring = [] }) {
  const stream = (positionRows ?? [])
    .filter((p) => p.date)
    .map((p) => ({ t: Date.parse(p.date), n: p.driver_number, pos: p.position }))
    .sort((a, b) => a.t - b.t);
  const nearPit = (num, t) => (pitTimes[num] ?? []).some((pt) => Math.abs(pt - t) < 35_000);
  /* Places changing behind a safety car are procedure (unlapping,
     pit cycles), not racing. */
  const neutralised = (t) => excludeDuring.some((p) => t >= p.from && t <= p.to);

  const out = [];
  const latest = {}, holder = {}, lastPair = {};
  for (const p of stream) {
    const prev = latest[p.n];
    if (prev != null && p.pos === prev - 1 && p.t > raceStart + 90_000 && !neutralised(p.t)) {
      const displaced = holder[p.pos];
      if (displaced != null && displaced !== p.n && !nearPit(p.n, p.t) && !nearPit(displaced, p.t)) {
        const key = [p.n, displaced].sort().join("-");
        if (!lastPair[key] || p.t - lastPair[key] > 45_000) {
          lastPair[key] = p.t;
          out.push({ t: p.t, nums: [p.n, displaced], pos: p.pos });
        }
      }
    }
    if (prev != null && holder[prev] === p.n) delete holder[prev];
    holder[p.pos] = p.n;
    latest[p.n] = p.pos;
  }
  return out;
}

/** Penalties actually handed out — not investigations or "no further action". */
export const isPenalty = (msg) =>
  /\bPENALTY\b/.test(msg) && !/NO (FURTHER )?(ACTION|INVESTIGATION)|NO PENALTY|UNDER INVESTIGATION|NOTED/.test(msg);

/* ================================================================
 * GPS DETAIL BUFFER — real positions, one lap at a time
 * ================================================================ */

/** Raw /location rows → per-car typed arrays, time-sorted. */
export function parseGpsRows(rows) {
  const tmp = {};
  for (const p of rows ?? []) {
    if (p.x == null || p.y == null || (p.x === 0 && p.y === 0) || !p.date) continue;
    (tmp[p.driver_number] ??= []).push([Date.parse(p.date), p.x, p.y]);
  }
  const out = {};
  for (const [num, list] of Object.entries(tmp)) {
    list.sort((a, b) => a[0] - b[0]);
    const n = list.length;
    const t = new Float64Array(n), x = new Float32Array(n), y = new Float32Array(n);
    for (let i = 0; i < n; i++) { t[i] = list[i][0]; x[i] = list[i][1]; y[i] = list[i][2]; }
    out[num] = { t, x, y };
  }
  return out;
}

/**
 * Lap-aligned GPS windows with look-ahead.
 *
 * A window spans one leader lap plus PAD seconds either side, so
 * neighbouring windows overlap and there's never a seam at the line.
 * `want(t)` keeps the window under t AND the next one loading — the next
 * lap starts downloading the moment the current one begins, so one to
 * two laps are always buffered ahead of the playhead. Only KEEP windows
 * are held (~1 MB each); older ones are dropped.
 *
 * `sampleAt` returns null whenever GPS can't answer honestly (not loaded
 * yet, or a gap in the car's samples) — the caller falls back to lap mode,
 * so a slow download never freezes or hides a car.
 */
export function createGpsBuffer({ fetchWindow, leaderStarts, raceEnd, pad = 4000, keep = 4, onLoad = null }) {
  const windows = new Map(); // lap index → { from, to, cars }
  const loading = new Set();
  const order = []; // LRU of loaded indices

  const bounds = (k) => ({
    from: leaderStarts[k] - pad,
    to: (leaderStarts[k + 1] ?? raceEnd) + pad,
  });
  const indexAt = (t) => floorIndex(leaderStarts, t);

  function load(k) {
    if (k < 0 || k >= leaderStarts.length || windows.has(k) || loading.has(k)) return;
    loading.add(k);
    const { from, to } = bounds(k);
    fetchWindow(from, to)
      .then((rows) => {
        windows.set(k, { from, to, cars: parseGpsRows(rows) });
        order.push(k);
        while (order.length > keep) windows.delete(order.shift());
        onLoad?.(k);
      })
      .catch(() => {}) // lap mode covers it; a later want() retries
      .finally(() => loading.delete(k));
  }

  function want(t) {
    const k = indexAt(t);
    load(k);
    load(k + 1);
    /* Touch the current window so it isn't the one evicted. */
    const i = order.indexOf(k);
    if (i >= 0 && i !== order.length - 1) { order.splice(i, 1); order.push(k); }
  }

  function sampleIn(win, num, t) {
    const car = win?.cars[num];
    if (!car || t < win.from || t > win.to) return null;
    const i = floorIndex(car.t, t);
    if (i < 0 || i >= car.t.length - 1) return null;
    const dt = car.t[i + 1] - car.t[i];
    if (dt > 1500) return null; // dropout: don't draw a line across it
    const f = (t - car.t[i]) / (dt || 1);
    /* Curve through the neighbouring samples rather than a straight line
       between two, so heading turns continuously at ~4 Hz GPS. At the
       window's ends the missing neighbour is the endpoint itself. */
    const a = Math.max(0, i - 1), b = Math.min(car.t.length - 1, i + 2);
    return catmullRom(car.x[a], car.y[a], car.x[i], car.y[i], car.x[i + 1], car.y[i + 1], car.x[b], car.y[b], f);
  }

  function sampleAt(num, t) {
    const k = indexAt(t);
    return sampleIn(windows.get(k), num, t) ?? sampleIn(windows.get(k - 1), num, t);
  }

  const has = (t) => windows.has(indexAt(t));
  return { want, sampleAt, has };
}
