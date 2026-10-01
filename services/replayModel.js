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

/**
 * Neutralisation periods from race control.
 *
 * Race control writes the abbreviation ("VSC DEPLOYED", "VSC ENDING"),
 * not the spelled-out form — matching only "VIRTUAL SAFETY CAR" misses
 * every VSC. A full safety car's "IN THIS LAP" is an announcement; the
 * race actually goes green when the leader next crosses the line, so the
 * period is closed there. A red flag holds until the next green.
 */
export function buildTrackStatus(rcRows, leaderStarts, raceEnd) {
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
  const close = (type, to) => {
    if (open && open.type === type) {
      out.push({ ...open, to: Math.max(open.from, to) });
      open = null;
    }
  };

  for (const r of rows) {
    if (r.flag === "RED") {
      if (open) close(open.type, r.t);
      open = { type: "red", from: r.t };
      continue;
    }
    if (open?.type === "red" && r.flag === "GREEN") { close("red", r.t); continue; }

    if (r.msg.includes("SAFETY CAR") || /\bVSC\b/.test(r.msg)) {
      const vsc = isVsc(r.msg);
      if (r.msg.includes("DEPLOYED")) {
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
 */
export function createTimeline({ reference, laps, finishers, pits, grid = {}, classification = {} }) {
  const ref = reference;
  const nums = Object.keys(laps).map(Number);

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
  const lapNumbers = Object.keys(leaderStartByLap).map(Number).sort((a, b) => a - b);
  const leaderStarts = lapNumbers.map((n) => leaderStartByLap[n]);
  const totalLaps = lapNumbers[lapNumbers.length - 1] ?? 0;
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
  const gridBack = (num) => (slotOf(num) - 1) * ref.total * 0.00145;

  /** Lap distance for a moment inside lap `l` of a car. */
  function distInLap(num, l, t) {
    const end = l.end ?? l.start + medianOf[num];
    /* Warp sector-by-sector when both laps have splits; otherwise the
       whole lap onto the whole reference lap. */
    const bySector = l.b1 != null && ref.sectorBounds.length === 4;
    const tb = bySector ? [l.start, l.b1, l.b2, end] : [l.start, end];
    const rb = bySector ? ref.sectorBounds : [0, ref.lapMs];
    let k = tb.length - 2;
    for (let i = 0; i < tb.length - 1; i++) if (t < tb[i + 1]) { k = i; break; }
    const f = clamp01((t - tb[k]) / (tb[k + 1] - tb[k] || 1));
    return refDistAt(ref, lerp(rb[k], rb[k + 1], f));
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
      if (car.state === "grid" || car.state === "retired") return null;
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

  return { carAt, snapshot, gaps, lapAt, nums, leaderStarts, lapNumbers, totalLaps, raceStart, raceEnd, doneAt };
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
