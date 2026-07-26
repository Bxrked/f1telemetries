"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Loader2, AlertTriangle, Swords, Flag, Radio as RadioIcon, ListOrdered } from "lucide-react";
import { getReplayContext, getReplayWindow, projectToTrack, buildTransform, getReplayEvents, getTeamRadio, getSessionTrackTrace, clearApiCache } from "@/services/f1Service";

const WINDOW_MS = 60_000; // 1-minute chunks: ~5k rows each → fast individual loads
const SPEEDS = [1, 5, 15, 30, 60];

const toPath = (pts: number[][]) =>
  pts.length ? `M ${pts.map((p) => p.join(" ")).join(" L ")}` : "";

const clockLabel = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Race Replay — broadcast mode.
 * Auto-loads on mount, buffers the lights-out chunk immediately, and
 * starts playing on its own. The clock HOLDS while a chunk is missing
 * (instead of racing ahead of the data), and prefetch depth scales with
 * playback speed so 60x never starves.
 */
export default function RaceReplay({ outline }: { outline: any }) {
  const [ctx, setCtx] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(15);
  const [simTime, setSimTime] = useState<number | null>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [radio, setRadio] = useState<any[]>([]);
  const [tab, setTab] = useState<"order" | "events" | "radio">("order");
  const [radioDriver, setRadioDriver] = useState<string>("ALL");
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [chunkTick, setChunkTick] = useState(0); // increments when a chunk lands
  const buffers = useRef(new Map<number, any>());
  const fetching = useRef(new Set<number>());
  const autoStarted = useRef(false);
  /* Holds the shared projection transform; dotFor() is declared before the
     transform is computed, but only *called* during render after it. */
  const tfRef = useRef<any>(null);
  const [trace, setTrace] = useState<any>(null);

  const t0 = ctx ? new Date(ctx.dateStart).getTime() : 0; // window-grid origin
  const tEnd = ctx ? ctx.raceEnd : 0;
  const lightsOut = ctx ? Math.max(t0, ctx.raceStart - 5_000) : 0;
  const windowStartFor = (t: number) => t0 + Math.floor((t - t0) / WINDOW_MS) * WINDOW_MS;

  /* ---- Load session context automatically on mount ---- */
  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await getReplayContext();
      if (!c) throw new Error("Replay data isn't available for this session yet — it appears ~30 minutes after a race ends.");
      setCtx(c);
      setSimTime(Math.max(new Date(c.dateStart).getTime(), c.raceStart - 5_000));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load replay.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Events + radio are small fetches; load them once context exists. */
  useEffect(() => {
    if (!ctx) return;
    getReplayEvents().then(setEvents).catch(() => setEvents([]));
    getTeamRadio().then(setRadio).catch(() => setRadio([]));
    /* Trace the circuit from THIS session's own stream — same coordinate
       frame as the car dots, so they can't diverge. */
    getSessionTrackTrace(ctx.sessionKey).then(setTrace).catch(() => setTrace(null));
  }, [ctx]);

  const jumpTo = useCallback((t: number) => {
    setSimTime(Math.max(t0, t - 8_000));
    setSpeed(5);
    setPlaying(true);
  }, [t0]);

  const playClip = useCallback((url: string) => {
    if (!audioRef.current) audioRef.current = new Audio();
    const el = audioRef.current;
    if (nowPlaying === url) {
      el.pause();
      setNowPlaying(null);
      return;
    }
    el.src = url;
    el.play().catch(() => {});
    setNowPlaying(url);
    el.onended = () => setNowPlaying(null);
  }, [nowPlaying]);

  /* Stop audio when leaving the page. */
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  /* ---- Chunk buffering, prefetch depth scaled to speed ---- */
  const ensureWindow = useCallback(
    (ws: number) => {
      if (!ctx || ws >= tEnd || ws < t0 || buffers.current.has(ws) || fetching.current.has(ws)) return;
      fetching.current.add(ws);
      getReplayWindow(ctx.sessionKey, ws, ws + WINDOW_MS)
        .then((w) => {
          buffers.current.set(ws, w);
          setChunkTick((x) => x + 1);
        })
        .catch(() => {})
        .finally(() => fetching.current.delete(ws));
    },
    [ctx, t0, tEnd]
  );

  useEffect(() => {
    if (!ctx || simTime == null) return;
    const ws = windowStartFor(simTime);
    const depth = speed >= 30 ? 4 : 2;
    for (let i = 0; i <= depth; i++) ensureWindow(ws + i * WINDOW_MS);
    for (const key of Array.from(buffers.current.keys())) {
      if (key < ws - WINDOW_MS || key > ws + (depth + 1) * WINDOW_MS) buffers.current.delete(key);
    }
  }, [simTime, speed, ctx, ensureWindow]);

  /* ---- Autoplay once the lights-out chunk is buffered ---- */
  useEffect(() => {
    if (!ctx || autoStarted.current || simTime == null) return;
    if (buffers.current.has(windowStartFor(simTime))) {
      autoStarted.current = true;
      setPlaying(true);
    }
  }, [chunkTick, ctx, simTime]); // eslint-disable-line

  /* ---- Playback clock: holds while the current chunk is buffering ---- */
  useEffect(() => {
    if (!playing || !ctx) return;
    let raf: number;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setSimTime((t) => {
        const cur = t ?? lightsOut;
        if (!buffers.current.has(windowStartFor(cur))) return cur; // hold: don't outrun data
        const next = Math.min(cur + dt * speed, tEnd);
        if (next >= tEnd) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, ctx, tEnd]); // eslint-disable-line

  /* ---- Standings board (2 Hz) ---- */
  useEffect(() => {
    if (!ctx || simTime == null) return;
    const compute = () => {
      const latestPos: Record<number, number> = {};
      for (const row of ctx.positions) {
        if (row.t > simTime) break;
        latestPos[row.n] = row.pos;
      }
      const ws = windowStartFor(simTime);
      const gapRows = [
        ...(buffers.current.get(ws - WINDOW_MS)?.gaps ?? []),
        ...(buffers.current.get(ws)?.gaps ?? []),
      ];
      const latestGap: Record<number, any> = {};
      for (const g of gapRows) {
        if (g.t > simTime) break;
        latestGap[g.n] = g.gap;
      }
      setStandings(
        Object.entries(latestPos)
          .map(([n, pos]) => {
            const id = ctx.drivers[+n] ?? {};
            const gap = latestGap[+n];
            return {
              n: +n,
              pos,
              code: id.code ?? n,
              color: id.teamColor ?? "#8B95A7",
              gap:
                pos === 1 ? "Leader"
                : typeof gap === "number" ? `+${gap.toFixed(1)}s`
                : typeof gap === "string" ? gap
                : "—",
            };
          })
          .sort((a, b) => a.pos - b.pos)
      );
    };
    compute();
    if (!playing) return;
    const id = setInterval(compute, 500);
    return () => clearInterval(id);
  }, [ctx, playing, simTime == null ? null : Math.floor(simTime / 500)]); // eslint-disable-line

  /* ---- Dot positions ---- */
  const dotFor = (num: number): number[] | null => {
    if (simTime == null || !tfRef.current) return null;
    const ws = windowStartFor(simTime);
    const samples = [
      ...(buffers.current.get(ws - WINDOW_MS)?.locations?.[num] ?? []),
      ...(buffers.current.get(ws)?.locations?.[num] ?? []),
    ];
    if (!samples.length) return null;
    let i = samples.length - 1;
    while (i > 0 && samples[i].t > simTime) i--;
    const a = samples[i];
    const b = samples[Math.min(i + 1, samples.length - 1)];
    if (simTime - a.t > 15_000) return null;
    const f = b.t === a.t ? 0 : Math.min(1, Math.max(0, (simTime - a.t) / (b.t - a.t)));
    return projectToTrack(tfRef.current, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
  };

  /* ---- Render states ---- */
  if (!outline?.transform && !trace) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-carbon-700 bg-carbon-900/60 px-4 py-3 text-xs text-carbon-400">
        <AlertTriangle size={13} className="text-sector-yellow" />
        Replay needs the live-traced circuit outline, which is unavailable right now.
      </p>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-carbon-700 bg-carbon-900/60 px-6 py-8">
        <p className="text-center text-xs text-f1red-bright">{error}</p>
        <button
          onClick={load}
          className="timing rounded-lg border border-carbon-600 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-carbon-300 transition hover:text-carbon-100"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-carbon-700 bg-carbon-900/60 px-6 py-10">
        <Loader2 size={14} className="animate-spin text-f1red-bright" />
        <span className="timing text-xs text-carbon-300">Loading session data…</span>
      </div>
    );
  }

  const buffering = simTime != null && !buffers.current.has(windowStartFor(simTime));
  const EVENT_HEX: Record<string, string> = {
    start: "#E7EAF0", overtake: "#2EE07C", sc: "#FFD644", "sc-end": "#8B95A7",
    vsc: "#FFD644", red: "#FF1E00", penalty: "#B44CFF",
  };
  const pct = (t: number) => `${(((t - t0) / (tEnd - t0)) * 100).toFixed(2)}%`;
  /* Ring the two dots involved in an overtake for ±5s around it. */
  const ringed = new Set<string>();
  if (simTime != null) {
    events.forEach((e) => {
      if (e.type === "overtake" && Math.abs(e.t - simTime) < 5_000) e.drivers.forEach((c: string) => ringed.add(c));
    });
  }
  const radioMarkers = radioDriver === "ALL" ? [] : radio.filter((r) => r.code === radioDriver);

  /* Dot positions + label de-collision.
     Cars bunch tightly (grid, pit exit, safety car) and 20 stacked codes
     become an unreadable blob. Labels are assigned greedily in running
     order — leaders and drivers in a highlighted overtake win priority,
     and a label is dropped if another label already sits within
     LABEL_MIN_DIST of it. The dot itself is always drawn. */
  /* ---- Shared coordinate space ----
     The outline transform came from ONE reference lap, so any car sitting
     outside that lap's bounding box (grid slots, pit lane, run-off) used
     to project outside the drawn circuit. We instead derive bounds from
     the union of the outline's raw points and the buffered replay points,
     then project BOTH the track path and the dots with it — so they are
     always in the same space by construction. */
  const view = outline?.viewBox ?? { W: 660, H: 360, PAD: 30 };
  const rawOutline: number[][] = trace?.points?.length
    ? trace.points
    : outline?.sectorsRaw
    ? [...outline.sectorsRaw.s1, ...outline.sectorsRaw.s2, ...outline.sectorsRaw.s3]
    : [];

  const bounds = (() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const eat = (x: number, y: number) => {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    };
    rawOutline.forEach(([x, y]) => eat(x, y));
    const outlineSpanX = maxX - minX, outlineSpanY = maxY - minY;
    // Fold in buffered car positions, ignoring absurd outliers (bad GPS).
    buffers.current.forEach((w: any) => {
      Object.values(w.locations ?? {}).forEach((arr: any) => {
        arr.forEach((s: any) => {
          if (!outlineSpanX || !outlineSpanY) return eat(s.x, s.y);
          const okX = s.x > minX - outlineSpanX && s.x < maxX + outlineSpanX;
          const okY = s.y > minY - outlineSpanY && s.y < maxY + outlineSpanY;
          if (okX && okY) eat(s.x, s.y);
        });
      });
    });
    return { minX, maxX, minY, maxY, valid: isFinite(minX) && maxX > minX };
  })();

  const tf = bounds.valid
    ? buildTransform(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, view)
    : outline?.transform;

  tfRef.current = tf;
  const project = (x: number, y: number) => projectToTrack(tf, x, y);

  const LABEL_MIN_DIST = 22;
  const orderOf: Record<string, number> = {};
  standings.forEach((r: any) => (orderOf[r.code] = r.pos));
  const dots = Object.keys(ctx.drivers)
    .map((numStr) => {
      const num = +numStr;
      const pt = dotFor(num);
      if (!pt) return null;
      const id = ctx.drivers[num];
      return { num, id, pt, pos: orderOf[id.code] ?? 99, label: false };
    })
    .filter(Boolean) as any[];
  dots.sort((a, b) => {
    const ra = ringed.has(a.id.code) ? -1 : 0;
    const rb = ringed.has(b.id.code) ? -1 : 0;
    return ra - rb || a.pos - b.pos;
  });
  const placed: number[][] = [];
  dots.forEach((d) => {
    const clash = placed.some(
      (p) => Math.hypot(p[0] - d.pt[0], p[1] - d.pt[1]) < LABEL_MIN_DIST
    );
    if (!clash) {
      d.label = true;
      placed.push(d.pt);
    }
  });
  /* Draw the circuit from raw coords with the shared transform (falls back
     to the pre-projected path if raw points aren't available). */
  const fullPath = rawOutline.length
    ? toPath(rawOutline.map(([x, y]: number[]) => project(x, y).map((n) => +n.toFixed(1))))
    : "";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
      <div>
        {/* Controls */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="grid h-8 w-8 place-items-center rounded-lg bg-f1red text-white transition hover:bg-f1red-bright"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={() => { setSimTime(lightsOut); }}
            className="grid h-8 w-8 place-items-center rounded-lg border border-carbon-600 text-carbon-300 transition hover:text-carbon-100"
            aria-label="Back to lights out"
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={() => { clearApiCache(); window.location.reload(); }}
            title="Clear cached data and reload (use if the map or timing looks stale)"
            className="timing rounded-md border border-carbon-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-carbon-400 transition hover:text-carbon-100"
          >
            reset
          </button>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`timing rounded-md px-2 py-1 text-[10px] font-bold transition
                ${speed === s ? "bg-carbon-600 text-carbon-100" : "text-carbon-400 hover:text-carbon-100"}`}
            >
              {s}x
            </button>
          ))}
          <span className="timing ml-auto flex items-center gap-2 text-xs text-carbon-300">
            {buffering && (
              <span className="flex items-center gap-1 text-sector-yellow">
                <Loader2 size={12} className="animate-spin" /> buffering
              </span>
            )}
            T+{clockLabel((simTime ?? lightsOut) - lightsOut)}
          </span>
        </div>

        {/* Seek bar + event markers */}
        <input
          type="range"
          min={t0}
          max={tEnd}
          step={1000}
          value={simTime ?? lightsOut}
          onChange={(e) => setSimTime(+e.target.value)}
          className="w-full accent-f1red"
          aria-label="Race timeline"
        />
        <div className="relative mb-2 h-3.5">
          {events.filter((e) => e.t >= t0 && e.t <= tEnd).map((e, i) => (
            <button
              key={`e${i}`}
              onClick={() => jumpTo(e.t)}
              title={`L${e.lap} · ${e.label}`}
              className="absolute top-0 h-2.5 w-[3px] -translate-x-1/2 rounded-sm transition-transform hover:scale-y-150"
              style={{ left: pct(e.t), background: EVENT_HEX[e.type] ?? "#8B95A7" }}
            />
          ))}
          {radioMarkers.map((r, i) => (
            <button
              key={`r${i}`}
              onClick={() => playClip(r.url)}
              title={`L${r.lap} · ${r.code} radio`}
              className="absolute top-0 h-2.5 w-[3px] -translate-x-1/2 rounded-sm opacity-70 transition-transform hover:scale-y-150"
              style={{ left: pct(r.t), background: r.color, top: "0.35rem" }}
            />
          ))}
        </div>

        {/* Track + dots */}
        <svg viewBox="0 0 660 360" className="w-full rounded-lg bg-carbon-900/40">
          <path d={fullPath} fill="none" stroke="#1E2430" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
          <path d={fullPath} fill="none" stroke="#2A3242" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {dots.map(({ num, id, pt, label }) => (
            <g key={num}>
              {ringed.has(id.code) && (
                <circle cx={pt[0]} cy={pt[1]} r="9" fill="none" stroke="#2EE07C" strokeWidth="1.5" opacity="0.85" />
              )}
              <circle cx={pt[0]} cy={pt[1]} r="4.5" fill={id.teamColor} stroke="#08090C" strokeWidth="1.2" />
              {label && (
                <text
                  x={pt[0]}
                  y={pt[1] - 7}
                  textAnchor="middle"
                  className="select-none"
                  style={{ fill: "#E7EAF0", fontSize: 8, fontFamily: "var(--font-timing)", fontWeight: 700, paintOrder: "stroke", stroke: "#08090C", strokeWidth: 2.5 }}
                >
                  {id.code}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Sidebar: Order / Events / Radio */}
      <div className="flex max-h-[470px] flex-col rounded-lg border border-carbon-700 bg-carbon-900/60 p-2">
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-carbon-950/60 p-1">
          {([
            ["order", ListOrdered, "Order"],
            ["events", Flag, "Events"],
            ["radio", RadioIcon, "Radio"],
          ] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`timing flex items-center justify-center gap-1 rounded-md px-1 py-1 text-[9px] font-bold uppercase tracking-wider transition
                ${tab === key ? "bg-f1red text-white" : "text-carbon-400 hover:text-carbon-100"}`}
            >
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>

        {tab === "order" && (
          <ul className="space-y-0.5 overflow-y-auto">
            {standings.map((r) => (
              <li key={r.n} className="timing flex items-center gap-2 rounded px-1.5 py-1 text-[11px]">
                <span className="w-5 text-right font-bold text-carbon-400">{r.pos}</span>
                <span className="h-3.5 w-[3px] rounded-full" style={{ background: r.color }} />
                <span className={`font-bold ${ringed.has(r.code) ? "text-sector-green" : "text-carbon-100"}`}>{r.code}</span>
                <span className="ml-auto text-carbon-400">{r.gap}</span>
              </li>
            ))}
            {!standings.length && (
              <li className="px-1.5 py-2 text-[11px] text-carbon-400">Waiting for position data…</li>
            )}
          </ul>
        )}

        {tab === "events" && (
          <ul className="space-y-0.5 overflow-y-auto">
            {events.map((e, i) => (
              <li key={i}>
                <button
                  onClick={() => jumpTo(e.t)}
                  className={`timing flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[10px] transition hover:bg-carbon-800/70
                    ${simTime != null && e.t <= simTime ? "text-carbon-100" : "text-carbon-400"}`}
                >
                  <span className="w-7 shrink-0 text-right text-carbon-400">L{e.lap}</span>
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: EVENT_HEX[e.type] ?? "#8B95A7" }} />
                  <span className="truncate">{e.label}</span>
                </button>
              </li>
            ))}
            {!events.length && <li className="px-1.5 py-2 text-[11px] text-carbon-400">No events available.</li>}
          </ul>
        )}

        {tab === "radio" && (
          <>
            <select
              value={radioDriver}
              onChange={(e) => setRadioDriver(e.target.value)}
              className="timing mb-2 w-full rounded-md border border-carbon-700 bg-carbon-950 px-2 py-1 text-[10px] text-carbon-100"
              aria-label="Filter radio by driver"
            >
              <option value="ALL">All drivers</option>
              {Object.values(ctx.drivers).map((d: any) => (
                <option key={d.code} value={d.code}>{d.code}</option>
              ))}
            </select>
            <ul className="space-y-0.5 overflow-y-auto">
              {radio
                .filter((r) => radioDriver === "ALL" || r.code === radioDriver)
                .map((r, i) => (
                  <li key={i}>
                    <button
                      onClick={() => playClip(r.url)}
                      className={`timing flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[10px] transition hover:bg-carbon-800/70
                        ${nowPlaying === r.url ? "bg-carbon-800 text-sector-green" : "text-carbon-300"}`}
                    >
                      <span className="w-7 shrink-0 text-right text-carbon-400">L{r.lap}</span>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                      <span className="font-bold">{r.code}</span>
                      {nowPlaying === r.url ? <Pause size={10} className="ml-auto" /> : <Play size={10} className="ml-auto" />}
                    </button>
                  </li>
                ))}
              {!radio.length && <li className="px-1.5 py-2 text-[11px] text-carbon-400">No radio clips available.</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
