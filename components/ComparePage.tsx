"use client";

import { useEffect, useMemo, useState } from "react";
import { Swords } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { getDriverComparison, getFeedStatus } from "@/services/f1Service";
import { formatClock } from "@/services/format";
import MockDataBanner from "./MockDataBanner";
import { GRID, TICK, AXIS_LINE, COMPOUND } from "@/lib/chartTheme";
import TyreStintTimeline from "./TyreStintTimeline";

const A_HEX = "#B44CFF"; // driver A accent (sector purple)
const B_HEX = "#2EE07C"; // driver B accent (sector green)

const fmtLap = (s: number | null) => (s == null ? "—" : formatClock(s, 3));

/** Three best sectors added together — the lap the driver was capable of. */
const theoretical = (d: any) =>
  d?.s1 != null && d?.s2 != null && d?.s3 != null ? +(d.s1 + d.s2 + d.s3).toFixed(3) : null;

/**
 * Time never strung together into one lap. Clamped at zero: sector and lap
 * timing come from separate OpenF1 fields and can disagree by a few
 * thousandths, which would otherwise surface as a nonsensical negative.
 */
const leftOnTable = (d: any) => {
  const t = theoretical(d);
  return t == null || d?.bestLap == null ? null : Math.max(0, +(d.bestLap - t).toFixed(3));
};

/**
 * Standard deviation of clean laps — separates a quick-but-erratic driver
 * from a slower metronome, which "best lap" alone cannot.
 *
 * Excludes lap 1 (standing start) and anything more than 7% over the
 * driver's median (pit laps, safety car) — the same threshold the service
 * uses for pace and degradation, so the definition of "clean" stays
 * consistent across the app.
 */
/** Net places made up. Grid 0 (pit-lane start) is already normalised upstream. */
const placesGained = (d: any) =>
  d?.grid == null || d?.finish == null ? null : d.grid - d.finish;

/** Total time spent in the pit lane across every stop — the strategic cost. */
const pitLaneTotal = (d: any) => {
  const stops = d?.pits ?? [];
  return stops.length ? +stops.reduce((s: number, p: any) => s + (p.laneTime ?? 0), 0).toFixed(1) : null;
};

/** Longest unbroken stint in laps — how far a set was made to last. */
const longestStint = (d: any) => {
  const stints = d?.stints ?? [];
  if (!stints.length) return null;
  return Math.max(...stints.map((s: any) => (s.to ?? 0) - (s.from ?? 0) + 1));
};

/** Which lap the best time was set on — early = low fuel never came, late = it did. */
const bestLapNumber = (d: any) => {
  const laps = (d?.laps ?? []).filter((l: any) => l.d > 0);
  if (!laps.length) return null;
  return laps.reduce((best: any, l: any) => (l.d < best.d ? l : best), laps[0]).n;
};

/**
 * Laps within half a second of the driver's own best — how often they were
 * genuinely on the limit rather than managing. Counts against clean laps
 * only, so a slow in-lap can't inflate or deflate it.
 */
const lapsAtLimit = (d: any) => {
  const laps = (d?.laps ?? []).filter((l: any) => l.n > 1 && l.d > 0).map((l: any) => l.d);
  if (laps.length < 5 || d?.bestLap == null) return null;
  return laps.filter((v: number) => v <= d.bestLap + 0.5).length;
};

/**
 * Lap-time trace. Hand-rolled SVG rather than a chart library: it's one
 * polyline, it needs no axes, and drawing it directly avoids depending on
 * a render pipeline for something this simple.
 *
 * Y is scaled to the PAIR's shared range so the two traces can be compared
 * by eye — scaling each to its own min/max would make a metronome and a
 * wild driver look identical. Outliers past 7% over the median are clamped
 * so one safety-car lap can't flatten the whole trace.
 */
function LapTrace({ laps, color, code, lo, hi, mirror = false }: any) {
  const pts = (laps ?? []).filter((l: any) => l.d > 0);
  if (pts.length < 5) return null;
  const W = 100, H = 26;
  const span = hi - lo || 1;
  const path = pts
    .map((l: any, i: number) => {
      const x = (i / (pts.length - 1)) * W;
      const clamped = Math.min(Math.max(l.d, lo), hi);
      const t = (clamped - lo) / span;
      /* The lower trace is flipped so the pair mirrors around the shared
         edge between them — both lines grow AWAY from that axis as the lap
         gets slower. Drawn the same way up, they'd read as two unrelated
         charts stacked; mirrored, they read as one comparison. */
      const y = mirror ? t * H : H - t * H;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    /* flex-1 + min-h-0 so the pair of traces expands to whatever height the
       panel has spare — the section is height-matched to the stats column
       beside it, and this is what absorbs the difference instead of leaving
       dead space at the bottom. */
    <div className="flex min-h-0 flex-1 items-stretch gap-2">
      <span className="timing w-8 shrink-0 self-center text-micro font-bold" style={{ color }}>
        {code}
      </span>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full min-h-[28px] w-full rounded-row bg-carbon-900/40"
        fill="none"
      >
        <path d={path} stroke={color} strokeWidth="1.25" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/**
 * Per-lap delta bars for the full race. Hand-rolled SVG for the same
 * reason as LapTrace — it's rectangles around a zero line, and a chart
 * library would add a render pipeline for no benefit.
 *
 * Scale is clamped to ±3s: pit-stop laps produce 20s+ spikes that would
 * otherwise squash every genuine on-track difference into a flat line.
 * Clipped bars are drawn at full height, which reads correctly as "off the
 * scale" rather than silently vanishing.
 */
function LapDelta({ a, b, aHex, bHex }: any) {
  const bLap: Record<number, number> = {};
  (b?.laps ?? []).forEach((l: any) => (bLap[l.n] = l.d));
  const rows = (a?.laps ?? [])
    .filter((l: any) => l.d > 0 && bLap[l.n] > 0)
    .map((l: any) => ({ n: l.n, delta: +(bLap[l.n] - l.d).toFixed(3) }));
  if (rows.length < 5) return null;

  const CLAMP = 3;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-[70px] flex-1 items-center gap-px">
        {/* Zero line */}
        <span className="absolute inset-x-0 top-1/2 h-px bg-carbon-600" />
        {rows.map((r: any) => {
          const mag = Math.min(Math.abs(r.delta), CLAMP) / CLAMP;
          const aQuicker = r.delta >= 0;
          return (
            <span
              key={r.n}
              title={`Lap ${r.n}: ${aQuicker ? a.code : b.code} quicker by ${Math.abs(r.delta).toFixed(3)}s`}
              className="relative flex-1"
              style={{ height: "100%" }}
            >
              <span
                className="absolute left-0 right-0 rounded-[1px]"
                style={{
                  background: aQuicker ? aHex : bHex,
                  height: `${Math.max(mag * 50, 1)}%`,
                  bottom: aQuicker ? "50%" : undefined,
                  top: aQuicker ? undefined : "50%",
                  opacity: 0.85,
                }}
              />
            </span>
          );
        })}
      </div>
      <div className="timing mt-1 flex shrink-0 justify-between text-micro text-carbon-500">
        <span>L{rows[0].n}</span>
        <span>±{CLAMP}s scale</span>
        <span>L{rows[rows.length - 1].n}</span>
      </div>
    </div>
  );
}

/** Final cumulative gap at the flag — who actually finished ahead, by how much. */
const gapAtFlag = (series: any[]) => (series.length ? series[series.length - 1].gap : null);

/** Laps on which each driver held the cumulative advantage. */
const lapsAhead = (series: any[], side: "a" | "b") =>
  series.filter((r: any) => (side === "a" ? r.gap > 0 : r.gap < 0)).length;

/** Largest single-lap advantage either driver took, ignoring pit laps. */
const biggestLapGain = (a: any, b: any, side: "a" | "b") => {
  const bLap: Record<number, number> = {};
  (b?.laps ?? []).forEach((l: any) => (bLap[l.n] = l.d));
  const deltas = (a?.laps ?? [])
    .filter((l: any) => l.d > 0 && bLap[l.n] > 0)
    .map((l: any) => bLap[l.n] - l.d)
    /* ±5s excludes pit-stop laps, which aren't a pace advantage. */
    .filter((d: number) => Math.abs(d) < 5);
  if (!deltas.length) return null;
  const best = side === "a" ? Math.max(...deltas) : -Math.min(...deltas);
  return best > 0 ? +best.toFixed(3) : 0;
};

/** Compound chips for one driver: initial + stint length, in tyre colours. */
function StintChips({ driver, align }: { driver: any; align: "start" | "end" }) {
  const stints = driver?.stints ?? [];
  if (!stints.length) return <span className="text-micro text-carbon-500">—</span>;
  return (
    <div className={`flex flex-wrap gap-1 ${align === "end" ? "justify-end" : "justify-start"}`}>
      {stints.map((s: any, i: number) => {
        const hex = COMPOUND[s.compound] ?? "#8B95A7";
        return (
          <span
            key={i}
            title={`${s.compound} · laps ${s.from}–${s.to}`}
            className="timing rounded-row border px-1.5 py-0.5 text-micro font-bold"
            style={{ color: hex, borderColor: `${hex}55`, background: `${hex}12` }}
          >
            {(s.compound ?? "?").charAt(0)}
            <span className="ml-1 text-carbon-400">{(s.to ?? 0) - (s.from ?? 0) + 1}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Shared y-range for a pair of lap traces, ignoring pit/SC outliers. */
function traceRange(a: any[], b: any[]) {
  const all = [...(a ?? []), ...(b ?? [])].filter((l: any) => l.d > 0).map((l: any) => l.d);
  if (!all.length) return { lo: 0, hi: 1 };
  const sorted = [...all].sort((x, y) => x - y);
  const med = sorted[Math.floor(sorted.length / 2)];
  const clean = all.filter((v) => v <= med * 1.07);
  return { lo: Math.min(...clean), hi: Math.max(...clean) };
}

const consistency = (d: any) => {
  const all = (d?.laps ?? []).filter((l: any) => l.n > 1 && l.d > 0).map((l: any) => l.d);
  if (all.length < 5) return null;
  const sorted = [...all].sort((x: number, y: number) => x - y);
  const med = sorted[Math.floor(sorted.length / 2)];
  const clean = all.filter((v: number) => v <= med * 1.07);
  if (clean.length < 5) return null;
  const mean = clean.reduce((s: number, v: number) => s + v, 0) / clean.length;
  const variance = clean.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / clean.length;
  return +Math.sqrt(variance).toFixed(3);
};

function DriverSelect({ drivers, value, onChange, accent, exclude }: any) {
  const d = drivers.find((x: any) => x.code === value);
  return (
    <div className="flex-1 rounded-xl border border-carbon-700 bg-carbon-850 p-4" style={{ borderTopColor: accent, borderTopWidth: 3 }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="timing w-full rounded-md border border-carbon-700 bg-carbon-950 px-2 py-1.5 text-xs font-bold text-carbon-100"
        aria-label="Select driver"
      >
        {drivers.filter((x: any) => x.code !== exclude).map((x: any) => (
          <option key={x.code} value={x.code}>{x.code} — {x.name}</option>
        ))}
      </select>
      {d && (
        <div className="mt-3 flex items-center gap-2">
          <span className="h-8 w-1 rounded-full" style={{ background: d.teamColor }} />
          <div>
            <p className="font-display text-lg font-bold uppercase leading-tight">{d.name}</p>
            <p className="text-[10px] text-carbon-400">{d.teamName} · P{d.finish} ({d.status})</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** One comparison stat row with the better value highlighted. */
function StatRow({ label, a, b, fmt, lowerBetter = true }: any) {
  const winner = a == null || b == null ? null : (lowerBetter ? a < b : a > b) ? "a" : a === b ? null : "b";
  const cls = (side: string) =>
    `timing text-sm font-bold ${winner === side ? (side === "a" ? "text-sector-purple" : "text-sector-green") : "text-carbon-100"}`;
  return (
    <div className="grid grid-cols-3 items-center border-b border-carbon-700/50 py-2 last:border-0">
      <span className={`${cls("a")} text-left`}>{a == null ? "—" : fmt(a)}</span>
      <span className="eyebrow text-center">{label}</span>
      <span className={`${cls("b")} text-right`}>{b == null ? "—" : fmt(b)}</span>
    </div>
  );
}

export default function ComparePage() {
  const [data, setData] = useState<any>(null);
  const [feed, setFeed] = useState<any>(null);
  const [codeA, setCodeA] = useState<string | null>(null);
  const [codeB, setCodeB] = useState<string | null>(null);

  useEffect(() => {
    getDriverComparison().then((d) => {
      setData(d);
      setFeed(getFeedStatus());
      setCodeA(d.drivers[0]?.code ?? null);
      setCodeB(d.drivers[1]?.code ?? null);
    });
  }, []);

  const A = data?.drivers.find((d: any) => d.code === codeA);
  const B = data?.drivers.find((d: any) => d.code === codeB);

  /* Cumulative gap: +ve = A ahead. Only laps both completed. */
  const gapSeries = useMemo(() => {
    if (!A || !B) return [];
    const bLap: Record<number, number> = {};
    B.laps.forEach((l: any) => (bLap[l.n] = l.d));
    let cumA = 0, cumB = 0;
    const rows: any[] = [];
    for (const l of A.laps) {
      if (bLap[l.n] == null) break;
      cumA += l.d;
      cumB += bLap[l.n];
      rows.push({ lap: l.n, gap: +(cumB - cumA).toFixed(2) });
    }
    return rows;
  }, [A, B]);

  /* Lap duel: 18 sampled common laps (skip laps 1-2). */
  const duel = useMemo(() => {
    if (!A || !B) return [];
    const bLap: Record<number, number> = {};
    B.laps.forEach((l: any) => (bLap[l.n] = l.d));
    const common = A.laps.filter((l: any) => l.n > 2 && bLap[l.n] != null);
    if (common.length < 6) return [];
    const step = (common.length - 1) / 17;
    return Array.from({ length: 18 }, (_, i) => {
      const l = common[Math.round(i * step)];
      const diff = l.d - bLap[l.n];
      return { lap: l.n, w: Math.abs(diff) <= 0.05 ? "EQ" : diff < 0 ? "A" : "B" };
    });
  }, [A, B]);

  if (!data) {
    return (
      /* Full-bleed to match the telemetry board — a 1440px cap left ~250px of
       dead black down each side on a wide monitor. */
    <main className="w-full min-w-0 px-4 py-6 sm:px-6">
        <div className="h-14 w-1/2 animate-pulse rounded-xl bg-carbon-850" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="h-32 animate-pulse rounded-xl bg-carbon-850" />
          <div className="h-32 animate-pulse rounded-xl bg-carbon-850" />
        </div>
        <p className="timing mt-6 text-center text-xs text-carbon-400">Loading comparison data…</p>
      </main>
    );
  }

  return (
    /* Full-bleed to match the telemetry board — a 1440px cap left ~250px of
       dead black down each side on a wide monitor. */
    <main className="w-full min-w-0 px-4 py-6 sm:px-6">
      <header className="mb-6 border-b border-carbon-700 pb-5">
        <p className="eyebrow mb-1 flex items-center gap-2">
          <Swords size={11} className="text-f1red-bright" /> Latest race · driver vs driver
        </p>
        <h1 className="font-display text-4xl font-black uppercase italic tracking-tight sm:text-5xl">
          Head <span className="text-f1red-bright">to</span> Head
        </h1>
      </header>

      <MockDataBanner feed={feed} only={["compare"]} />

      {feed?.detail?.compare === "mock" && (
        <p className="mb-4 rounded-lg border border-sector-yellow/40 bg-sector-yellow/10 px-4 py-2 text-[11px] text-sector-yellow">
          <span className="timing font-bold uppercase tracking-wider">Demo data</span> — live
          telemetry for this race couldn&apos;t be loaded, so the drivers and times below are
          built-in sample values, not the race named in the navigation.
        </p>
      )}

      {/* Pickers */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <DriverSelect drivers={data.drivers} value={codeA} onChange={setCodeA} accent={A_HEX} exclude={codeB} />
        <span className="timing self-center font-display text-xl font-black italic text-carbon-400">VS</span>
        <DriverSelect drivers={data.drivers} value={codeB} onChange={setCodeB} accent={B_HEX} exclude={codeA} />
      </div>

      {A && B && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {/* ── PACE — 9 rows ──────────────────────────────────────────
                The two panels below are deliberate mirrors: nine rows each,
                same component, same geometry. Previously one held sixteen
                rows and the other two rows plus charts, so they were equal
                boxes with wildly unequal contents — the same size, but not
                symmetric. Split by meaning as well as count: everything
                about raw speed here, everything about executing the race
                opposite. */}
          <section className="flex flex-col rounded-xl border border-carbon-700 bg-carbon-850 px-5 py-3 shadow-panel">
            <p className="eyebrow mb-1 shrink-0 text-center">Pace</p>
            <StatRow label="Finish" a={A.finish} b={B.finish} fmt={(v: number) => `P${v}`} />
            <StatRow label="Grid" a={A.grid} b={B.grid} fmt={(v: number) => `P${v}`} />
            <StatRow label="Best lap" a={A.bestLap} b={B.bestLap} fmt={fmtLap} />
            <StatRow label="Theoretical best" a={theoretical(A)} b={theoretical(B)} fmt={fmtLap} />
            <StatRow
              label="Left on table"
              a={leftOnTable(A)}
              b={leftOnTable(B)}
              fmt={(v: number) => `+${v.toFixed(3)}s`}
            />
            <StatRow label="Sector sum Δ" a={theoretical(A)} b={theoretical(B)} fmt={fmtLap} />
            <StatRow label="Avg pace" a={A.avgPace} b={B.avgPace} fmt={fmtLap} />
            <StatRow label="Vmax" a={A.vmax} b={B.vmax} fmt={(v: number) => `${v} km/h`} lowerBetter={false} />
            <StatRow
              label="Consistency (σ)"
              a={consistency(A)}
              b={consistency(B)}
              fmt={(v: number) => `${v.toFixed(3)}s`}
            />

            {/* Both panels close with the same block type so their feet match. */}
            <div className="mt-3 flex min-h-0 flex-1 flex-col justify-end border-t border-carbon-700 pt-3">
              <p className="eyebrow mb-2 text-center">Best sectors</p>
              {(["s1", "s2", "s3"] as const).map((key, i) => {
                const a = A[key], b = B[key];
                if (a == null || b == null) return null;
                const max = Math.max(a, b);
                const aWins = a <= b;
                return (
                  <div key={key} className="mb-1.5 grid grid-cols-[1fr_54px_1fr] items-center gap-2 last:mb-0">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`timing text-data font-bold ${aWins ? "text-sector-purple" : "text-carbon-300"}`}>
                        {a.toFixed(3)}
                      </span>
                      <span className="h-2 rounded-l-full" style={{ width: `${(a / max) * 70}%`, background: aWins ? A_HEX : "#3a4152" }} />
                    </div>
                    <span className="eyebrow text-center">S{i + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className="h-2 rounded-r-full" style={{ width: `${(b / max) * 70}%`, background: !aWins ? B_HEX : "#3a4152" }} />
                      <span className={`timing text-data font-bold ${!aWins ? "text-sector-green" : "text-carbon-300"}`}>
                        {b.toFixed(3)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Best sectors: facing bars */}
          {/* ── RACE EXECUTION — 9 rows, mirroring Pace ───────────────── */}
          <section className="flex flex-col rounded-xl border border-carbon-700 bg-carbon-850 px-5 py-3 shadow-panel">
            <p className="eyebrow mb-1 shrink-0 text-center">Race execution</p>
            <StatRow label="Pit stops" a={A.pits.length} b={B.pits.length} fmt={(v: number) => `${v}`} />
            <StatRow
              label="Pit lane total"
              a={pitLaneTotal(A)}
              b={pitLaneTotal(B)}
              fmt={(v: number) => `${v.toFixed(1)}s`}
            />
            <StatRow
              label="Places gained"
              a={placesGained(A)}
              b={placesGained(B)}
              /* Zero renders as "0", not a dash — a dash beside a number on
                 the other side reads as missing data rather than a result. */
              fmt={(v: number) => (v > 0 ? `+${v}` : v === 0 ? "0" : `${v}`)}
              lowerBetter={false}
            />
            <StatRow
              label="Longest stint"
              a={longestStint(A)}
              b={longestStint(B)}
              fmt={(v: number) => `${v} laps`}
              lowerBetter={false}
            />
            <StatRow
              label="Best lap on"
              a={bestLapNumber(A)}
              b={bestLapNumber(B)}
              fmt={(v: number) => `L${v}`}
              lowerBetter={false}
            />
            <StatRow
              label="Laps at limit"
              a={lapsAtLimit(A)}
              b={lapsAtLimit(B)}
              fmt={(v: number) => `${v}`}
              lowerBetter={false}
            />
            <StatRow
              label="Laps ahead"
              a={lapsAhead(gapSeries, "a")}
              b={lapsAhead(gapSeries, "b")}
              fmt={(v: number) => `${v}`}
              lowerBetter={false}
            />
            <StatRow
              label="Best single lap gain"
              a={biggestLapGain(A, B, "a")}
              b={biggestLapGain(A, B, "b")}
              fmt={(v: number) => `${v.toFixed(3)}s`}
              lowerBetter={false}
            />
            <StatRow
              /* Signed per driver so BOTH ends carry a real number. */
              label="Gap at flag"
              a={gapAtFlag(gapSeries)}
              b={gapAtFlag(gapSeries) == null ? null : -gapAtFlag(gapSeries)!}
              fmt={(v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}s`}
              lowerBetter={false}
            />

            {/* Mirrors the Best sectors block opposite: same position, same
                divider, same height behaviour, so the two panels' feet line
                up instead of one ending in a chart and the other in chips. */}
            <div className="mt-3 flex min-h-0 flex-1 flex-col justify-end border-t border-carbon-700 pt-3">
              <p className="eyebrow mb-2 text-center">Compounds run · in order</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                <StintChips driver={A} align="end" />
                <span className="eyebrow self-center whitespace-nowrap px-1">stint · laps</span>
                <StintChips driver={B} align="start" />
              </div>
            </div>
          </section>

          {/* Lap traces — full width, since they're a visual and belong with
              the other full-width charts rather than inside a stats column. */}
          <section className="rounded-xl border border-carbon-700 bg-carbon-850 p-5 shadow-panel xl:col-span-2">
            <p className="eyebrow mb-2">Lap-time trace · shared scale · mirrored · outward = slower</p>
            {(() => {
              const { lo, hi } = traceRange(A.laps, B.laps);
              return (
                <div className="relative flex h-40 flex-col">
                  <LapTrace laps={A.laps} color={A_HEX} code={A.code} lo={lo} hi={hi} />
                  <span className="pointer-events-none my-px h-px shrink-0 bg-carbon-700" />
                  <LapTrace laps={B.laps} color={B_HEX} code={B.code} lo={lo} hi={hi} mirror />
                </div>
              );
            })()}
            <div className="timing mt-1 flex justify-between text-micro text-carbon-500">
              <span>L1</span>
              <span>L{data.totalLaps}</span>
            </div>
          </section>

          {/* Cumulative gap */}
          <section className="rounded-xl border border-carbon-700 bg-carbon-850 p-5 shadow-panel xl:col-span-2">
            <p className="eyebrow mb-1">
              Cumulative gap · above zero = <span style={{ color: A_HEX }}>{A.code}</span> ahead
            </p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={gapSeries} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="lap" tick={TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <YAxis tick={TICK} axisLine={false} tickLine={false} unit="s" />
                  <ReferenceLine y={0} stroke="#2A3242" strokeWidth={1.5} />
                  <Tooltip
                    content={({ active, payload, label }: any) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border border-carbon-600 bg-carbon-900/95 px-3 py-2 shadow-panel">
                          <p className="eyebrow mb-0.5">Lap {label}</p>
                          <p className="timing text-xs font-bold" style={{ color: payload[0].value >= 0 ? A_HEX : B_HEX }}>
                            {payload[0].value >= 0 ? A.code : B.code} ahead by {Math.abs(payload[0].value).toFixed(2)}s
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  <Line type="monotone" dataKey="gap" stroke={A_HEX} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Lap duel */}
          {duel.length > 0 && (
            <section className="flex flex-col rounded-xl border border-carbon-700 bg-carbon-850 p-5 shadow-panel">
              <p className="eyebrow mb-2 shrink-0">Lap duel · 18 sampled racing laps</p>
              <div className="flex shrink-0 gap-[3px]">
                {duel.map((s: any, i: number) => (
                  <span
                    key={i}
                    title={`Lap ${s.lap}: ${s.w === "EQ" ? "even" : s.w === "A" ? A.code : B.code}`}
                    className="h-3 flex-1 rounded-[2px] transition-transform duration-micro hover:scale-y-150"
                    style={{ background: s.w === "A" ? A_HEX : s.w === "B" ? B_HEX : "#5B6678" }}
                  />
                ))}
              </div>
              <div className="timing mt-1 flex shrink-0 justify-between text-micro text-carbon-400">
                <span style={{ color: A_HEX }}>■ {A.code} · {duel.filter((d: any) => d.w === "A").length}</span>
                <span>even · {duel.filter((d: any) => d.w === "EQ").length}</span>
                <span style={{ color: B_HEX }}>■ {B.code} · {duel.filter((d: any) => d.w === "B").length}</span>
              </div>

              {/* Per-lap delta across the WHOLE race, not 18 samples. Bars
                  above the line = A quicker that lap. This is what fills the
                  panel, and it's strictly more information than the strip. */}
              <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-carbon-700 pt-3">
                <p className="eyebrow mb-2 shrink-0">Per-lap delta · every lap · above line = {A.code} quicker</p>
                <LapDelta a={A} b={B} aHex={A_HEX} bHex={B_HEX} />
              </div>
            </section>
          )}

          {/* Strategy + pit stops */}
          <section className="rounded-xl border border-carbon-700 bg-carbon-850 p-5 shadow-panel">
            <p className="eyebrow mb-3">Tyre strategy & pit stops</p>
            <TyreStintTimeline
              stints={[{ code: A.code, stints: A.stints }, { code: B.code, stints: B.stints }]}
              totalLaps={data.totalLaps}
            />
            <div className="mt-3 grid grid-cols-2 gap-4">
              {[A, B].map((d: any, i) => (
                <div key={d.code}>
                  <p className="timing mb-1 text-[10px] font-bold" style={{ color: i === 0 ? A_HEX : B_HEX }}>
                    {d.code} stops
                  </p>
                  {d.pits.length ? (
                    <ul className="timing space-y-0.5 text-[11px] text-carbon-300">
                      {d.pits.map((p: any, j: number) => (
                        <li key={j}>L{p.lap} · {p.laneTime.toFixed(1)}s lane</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-carbon-400">No stops recorded</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
