"use client";

import { ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { ChevronDown } from "lucide-react";
import { getDriverComparison, getFeedStatus } from "@/services/f1Service";
import { formatClock } from "@/services/format";
import MockDataBanner from "./MockDataBanner";
import { GRID, TICK, AXIS_LINE, COMPOUND as COMPOUND_HEX } from "@/lib/chartTheme";
import TyreStintTimeline from "./TyreStintTimeline";
import CountUp from "./CountUp";
import DriverSide, { isLight } from "./DriverCutout";
import { EASE, SPRING, VIEWPORT, panelReveal } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";

/**
 * Head-to-Head — any two drivers from the latest race.
 *
 * Opens like the Teammates page: the two drivers as cutouts in front of
 * their flags, the verdict between them (rows won + five headline rows).
 * Under it a strip of the whole field swaps either side, and the address
 * carries the pairing (`/compare#rus-ver`). Below that the page scrolls
 * through the full breakdown — the charts need the width.
 *
 * Colour: each driver wears their team colour. Two drivers from the same
 * team would be indistinguishable, so the right-hand one takes a neutral
 * instead (ALT_LIGHT / ALT_DARK).
 */

const ALT_LIGHT = "#E7EAF0";
const ALT_DARK = "#5B8CFF";
function pairColours(A: any, B: any) {
  const colA: string = A?.teamColor ?? "#8B95A7";
  const colB: string = !B ? "#8B95A7" : B.teamColor !== colA ? B.teamColor : isLight(colA) ? ALT_DARK : ALT_LIGHT;
  return { colA, colB };
}
/* The swap animation runs ~0.9 s (old driver out, new one in). */
const DETAIL_DELAY_MS = 900;

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
 * Median of clean laps (same 7%-over-median rule as consistency). Unlike
 * the average it isn't dragged by the handful of slow laps that survive
 * the filter, so it's the fairer "typical race lap".
 */
const medianLap = (d: any) => {
  const all = (d?.laps ?? []).filter((l: any) => l.n > 1 && l.d > 0).map((l: any) => l.d);
  if (all.length < 5) return null;
  const sorted = [...all].sort((x: number, y: number) => x - y);
  const med = sorted[Math.floor(sorted.length / 2)];
  const clean = sorted.filter((v: number) => v <= med * 1.07);
  return clean[Math.floor(clean.length / 2)];
};

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
  if (!stints.length) return <span className={`text-micro text-carbon-500 ${align === "end" ? "text-right" : ""}`}>—</span>;
  return (
    <div className={`flex flex-wrap gap-1 ${align === "end" ? "justify-end" : "justify-start"}`}>
      {stints.map((s: any, i: number) => {
        const hex = COMPOUND_HEX[s.compound] ?? "#8B95A7";
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

/**
 * Standard deviation of clean laps — separates a quick-but-erratic driver
 * from a slower metronome, which "best lap" alone cannot.
 *
 * Excludes lap 1 (standing start) and anything more than 7% over the
 * driver's median (pit laps, safety car) — the same threshold the service
 * uses for pace and degradation, so the definition of "clean" stays
 * consistent across the app.
 */
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


/* ---- Rows ------------------------------------------------------------ */

type RowDef = {
  label: string;
  a: number | null;
  b: number | null;
  fmt: (v: number) => string;
  /** Lower is better (times, positions). */
  lower?: boolean;
  /** No winner: the figure describes, it doesn't rank (e.g. which lap). */
  neutral?: boolean;
  /**
   * Difference that counts as "a lot" for this metric. With it, the
   * winner's bar is full and the other's shortens with the gap (a 0.05 s
   * deficit on a lap time shouldn't look like half). Without it, bars are
   * simply proportional — right for counts.
   */
  scale?: number;
  /** Shown under the label: the difference, in the metric's own unit. */
  delta?: (d: number) => string;
};

const winnerOf = (r: RowDef) =>
  r.neutral || r.a == null || r.b == null || r.a === r.b ? null : (r.lower ? r.a < r.b : r.a > r.b) ? "a" : "b";

function fills(r: RowDef): [number, number] {
  if (r.a == null || r.b == null) return [r.a == null ? 0 : 1, r.b == null ? 0 : 1];
  if (r.neutral) return [0, 0];
  if (r.scale) {
    const w = winnerOf(r);
    if (!w) return [1, 1];
    const short = Math.max(0.12, Math.min(0.96, 1 - Math.abs(r.a - r.b) / r.scale));
    return w === "a" ? [1, short] : [short, 1];
  }
  const max = Math.max(Math.abs(r.a), Math.abs(r.b));
  return max > 0 ? [Math.abs(r.a) / max, Math.abs(r.b) / max] : [0, 0];
}

/** value | bar ← label → bar | value. Bars re-size when the pairing changes. */
function DuelRow({ row, colA, colB, dense = false }: { row: RowDef; colA: string; colB: string; dense?: boolean }) {
  const w = winnerOf(row);
  const [fa, fb] = fills(row);
  const bar = (side: "a" | "b") => (
    <span className={`relative block bg-carbon-800 ${dense ? "h-[4px]" : "h-[6px]"}`}>
      {/* scaleX, not width: 26 bars re-laying-out the page every frame
          was part of the swap stutter. */}
      <motion.span
        className={`absolute inset-0 ${side === "a" ? "origin-right" : "origin-left"}`}
        style={{ backgroundColor: w === side ? (side === "a" ? colA : colB) : "#3A4352" }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: side === "a" ? fa : fb }}
        transition={{ duration: 0.6, ease: EASE.out }}
      />
    </span>
  );
  const value = (side: "a" | "b") => {
    const v = row[side];
    return (
      <span
        className={`timing whitespace-nowrap font-bold ${dense ? "text-label" : "text-base"} ${side === "a" ? "text-left" : "text-right"}
          ${w === side || (row.neutral && v != null) ? "text-carbon-100" : "text-carbon-400"}`}
      >
        {v == null ? "—" : row.fmt(v)}
      </span>
    );
  };
  const diff = row.delta && row.a != null && row.b != null && row.a !== row.b ? row.delta(Math.abs(row.a - row.b)) : null;
  return (
    <li
      className={`grid items-center gap-2 ${dense ? "grid-cols-[4.25rem_1fr_8.75rem_1fr_4.25rem] py-[6px] sm:grid-cols-[4.75rem_1fr_9.5rem_1fr_4.75rem]" : "grid-cols-[4.5rem_1fr_5.75rem_1fr_4.5rem] py-[7px] sm:grid-cols-[4.75rem_1fr_7rem_1fr_4.75rem]"}`}
    >
      {value("a")}
      {bar("a")}
      <span className="text-center leading-none">
        <span className="eyebrow block whitespace-nowrap">{row.label}</span>
        {diff && !dense && <span className="timing mt-1 block text-micro text-carbon-500">{diff}</span>}
      </span>
      {bar("b")}
      {value("b")}
    </li>
  );
}

/* ---- Page furniture --------------------------------------------------- */

/** A chapter of the breakdown: numbered, ruled, no box. */
function Section({ n, eyebrow, title, aside, children, className = "" }: { n: number; eyebrow: string; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  const forceVisible = useForceVisible();
  return (
    <motion.section
      variants={panelReveal}
      {...(forceVisible
        ? { initial: false as const, animate: "show" as const }
        : { initial: "hidden" as const, whileInView: "show" as const, viewport: VIEWPORT })}
      className={`border-t border-carbon-700/70 pt-5 ${className}`}
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span className="timing font-bold text-carbon-100">
              <span className="text-carbon-500">[</span> {String(n).padStart(2, "0")} <span className="text-carbon-500">]</span>
            </span>
            {eyebrow}
          </p>
          <h2 className="mt-1.5 font-display text-2xl font-black uppercase italic leading-none tracking-tight text-carbon-100 sm:text-3xl">
            {title}
          </h2>
        </div>
        {aside}
      </header>
      {children}
    </motion.section>
  );
}

/** Which colour is which driver — repeated wherever a chart needs it. */
function Legend({ A, B, colA, colB }: any) {
  return (
    <p className="timing flex items-center gap-4 text-micro font-bold uppercase tracking-wider text-carbon-300">
      {[[A, colA], [B, colB]].map(([d, c]: any) => (
        <span key={d.code} className="flex items-center gap-1.5">
          <span className="h-3 w-[3px]" style={{ background: c }} />
          {d.code}
        </span>
      ))}
    </p>
  );
}

/** Face thumbnail in the picker strip; the code alone if there's no photo. */
function Chip({ d, slot, color, disabled, onPick }: { d: any; slot: "a" | "b" | null; color: string | null; disabled: boolean; onPick: () => void }) {
  const [noPhoto, setNoPhoto] = useState(false);
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      title={`${d.name} · P${d.finish} · ${d.teamName}`}
      aria-pressed={!!slot}
      className={`group relative flex w-12 shrink-0 snap-start flex-col items-center gap-1 pb-1.5 transition-opacity duration-micro
        ${disabled ? "cursor-default" : "hover:opacity-100"} ${slot ? "opacity-100" : "opacity-60"}`}
    >
      <span
        className="relative block h-10 w-10 overflow-hidden rounded-row"
        style={{ background: `linear-gradient(to top, color-mix(in srgb, ${d.teamColor} 55%, #0B0C0F), color-mix(in srgb, ${d.teamColor} 12%, #0B0C0F))` }}
      >
        {d.thumb && !noPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setNoPhoto(true)} className="h-full w-full object-cover" />
        )}
      </span>
      <span className={`timing text-micro font-bold ${slot ? "text-carbon-100" : "text-carbon-400 group-hover:text-carbon-100"}`}>{d.code}</span>
      {slot && color && <motion.span layoutId={`pick-${slot}`} className="absolute inset-x-1 bottom-0 h-[3px]" style={{ background: color }} transition={SPRING.panel} />}
    </button>
  );
}

const sideSwap = { initial: "enter", animate: "show", exit: "exit" } as const;

/** Everything derived from a pairing: gap trace, lap duel, and the rows. */
function analyse(A: any, B: any) {
  /* Cumulative gap: +ve = A ahead. Only laps both completed. */
  const gapSeries = (() => {
    const bLap: Record<number, number> = {};
    B.laps.forEach((l: any) => (bLap[l.n] = l.d));
    let cumA = 0, cumB = 0;
    const out: any[] = [];
    for (const l of A.laps) {
      if (bLap[l.n] == null) break;
      cumA += l.d;
      cumB += bLap[l.n];
      out.push({ lap: l.n, gap: +(cumB - cumA).toFixed(2) });
    }
    return out;
  })();

  /* Lap duel: 18 sampled common laps (skip laps 1-2). */
  const duel = (() => {
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
  })();

  {
    const secs = (n: number) => (d: number) => `${d.toFixed(n)}s`;
    const pos = (v: number) => `P${v}`;
    const flag = gapAtFlag(gapSeries);
    const headline: RowDef[] = [
      { label: "Finish", a: A.finish, b: B.finish, fmt: pos, lower: true, scale: 10, delta: (d) => `${d} ${d === 1 ? "place" : "places"}` },
      { label: "Best lap", a: A.bestLap, b: B.bestLap, fmt: fmtLap, lower: true, scale: 1, delta: secs(3) },
      { label: "Race pace", a: medianLap(A), b: medianLap(B), fmt: fmtLap, lower: true, scale: 1, delta: secs(3) },
      { label: "Top speed", a: A.vmax, b: B.vmax, fmt: (v) => `${v}`, scale: 15, delta: (d) => `${d.toFixed(1)} km/h` },
      { label: "Laps ahead", a: lapsAhead(gapSeries, "a"), b: lapsAhead(gapSeries, "b"), fmt: (v) => `${v}` },
    ];
    const pace: RowDef[] = [
      { label: "Grid", a: A.grid, b: B.grid, fmt: pos, lower: true, scale: 10 },
      { label: "Theoretical best", a: theoretical(A), b: theoretical(B), fmt: fmtLap, lower: true, scale: 1 },
      { label: "Left on table", a: leftOnTable(A), b: leftOnTable(B), fmt: (v) => `+${v.toFixed(3)}s`, lower: true, scale: 0.6 },
      { label: "Avg pace", a: A.avgPace, b: B.avgPace, fmt: fmtLap, lower: true, scale: 1 },
      { label: "Consistency", a: consistency(A), b: consistency(B), fmt: secs(3), lower: true, scale: 0.6 },
      { label: "Best sector 1", a: A.s1, b: B.s1, fmt: secs(3), lower: true, scale: 0.5 },
      { label: "Best sector 2", a: A.s2, b: B.s2, fmt: secs(3), lower: true, scale: 0.5 },
      { label: "Best sector 3", a: A.s3, b: B.s3, fmt: secs(3), lower: true, scale: 0.5 },
      { label: "Laps at limit", a: lapsAtLimit(A), b: lapsAtLimit(B), fmt: (v) => `${v}` },
    ];
    const execution: RowDef[] = [
      { label: "Places gained", a: placesGained(A), b: placesGained(B), fmt: (v) => (v > 0 ? `+${v}` : `${v}`), scale: 8 },
      { label: "Pit stops", a: A.pits.length, b: B.pits.length, fmt: (v) => `${v}`, lower: true, scale: 3 },
      { label: "Pit lane total", a: pitLaneTotal(A), b: pitLaneTotal(B), fmt: secs(1), lower: true, scale: 30 },
      { label: "Longest stint", a: longestStint(A), b: longestStint(B), fmt: (v) => `${v} laps` },
      /* Which lap, not how good — it describes the race, it doesn't rank. */
      { label: "Best lap on", a: bestLapNumber(A), b: bestLapNumber(B), fmt: (v) => `L${v}`, neutral: true },
      { label: "Best lap gain", a: biggestLapGain(A, B, "a"), b: biggestLapGain(A, B, "b"), fmt: secs(3) },
      /* Signed per driver so BOTH ends carry a real number. */
      { label: "Gap at flag", a: flag, b: flag == null ? null : -flag, fmt: (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}s`, scale: 30 },
    ];
    const won = (side: "a" | "b") => headline.filter((r) => winnerOf(r) === side).length;
    return { gapSeries, duel, headline, pace, execution, score: { a: won("a"), b: won("b") } };
  }
}

export default function ComparePage() {
  const [data, setData] = useState<any>(null);
  const [feed, setFeed] = useState<any>(null);
  const [codeA, setCodeA] = useState<string | null>(null);
  const [codeB, setCodeB] = useState<string | null>(null);
  /* Which side the next pick from the strip replaces. */
  const [slot, setSlot] = useState<"a" | "b">("b");
  const forceVisible = useForceVisible();
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDriverComparison().then((d) => {
      /* Open on the pairing named in the address (#rus-ver), else P1 v P2. */
      const [ha, hb] = window.location.hash.slice(1).toUpperCase().split("-");
      const has = (c?: string) => !!c && d.drivers.some((x: any) => x.code === c);
      const a = has(ha) ? ha : d.drivers[0]?.code ?? null;
      const b = has(hb) && hb !== a ? hb : d.drivers.find((x: any) => x.code !== a)?.code ?? null;
      setData(d);
      setFeed(getFeedStatus());
      setCodeA(a);
      setCodeB(b);
    });
  }, []);

  useEffect(() => {
    if (codeA && codeB) window.history.replaceState(null, "", `#${codeA.toLowerCase()}-${codeB.toLowerCase()}`);
  }, [codeA, codeB]);

  const pick = useCallback(
    (code: string) => {
      if (code === codeA || code === codeB) return;
      (slot === "a" ? setCodeA : setCodeB)(code);
    },
    [slot, codeA, codeB]
  );
  const choose = (s: "a" | "b") => {
    setSlot(s);
    stripRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const A = data?.drivers.find((d: any) => d.code === codeA);
  const B = data?.drivers.find((d: any) => d.code === codeB);
  const { colA, colB } = pairColours(A, B);

  /* The verdict follows a pick at once; the breakdown follows a beat
     later (see DETAIL_DELAY_MS), so its charts don't rebuild mid-swap. */
  const now = useMemo(() => (A && B ? analyse(A, B) : null), [A, B]);
  const rows = now;
  const [detail, setDetail] = useState<{ a: string; b: string } | null>(null);
  useEffect(() => {
    if (!codeA || !codeB) return;
    if (!detail) return setDetail({ a: codeA, b: codeB });
    const t = setTimeout(() => setDetail({ a: codeA, b: codeB }), DETAIL_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeA, codeB]);

  if (!data || !A || !B || !rows) {
    return (
      <main className="relative grid min-h-0 w-full flex-1 place-items-center bg-black">
        <span className="timing flex items-center gap-2 text-micro uppercase tracking-wider text-carbon-500">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
          Loading lap data
        </span>
      </main>
    );
  }

  const words = String(data.raceName ?? "Latest race").split(" ");
  const sideMeta = (d: any) => `P${d.finish} · ${d.teamName}`;

  return (
    <main className="w-full min-w-0 bg-black">
      {/* ── Verdict: fills the first screen ─────────────────────────── */}
      <section className="relative flex flex-col lg:h-[calc(100svh-66px)] lg:max-h-[940px] lg:min-h-[640px]">
        <div
          className="relative grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,300px)_auto]
            lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)_minmax(0,1fr)] lg:grid-rows-1"
        >
          {(["a", "b"] as const).map((s) => {
            const d = s === "a" ? A : B;
            const active = slot === s;
            return (
              <div
                key={s}
                className={`relative row-start-1 h-[300px] min-h-0 lg:h-auto ${s === "a" ? "col-start-1" : "col-start-2 lg:col-start-3"}`}
              >
                <AnimatePresence mode="wait" initial={!forceVisible}>
                  <motion.div key={d.code} {...sideSwap} className="absolute inset-0">
                    <DriverSide
                      driver={d}
                      color={s === "a" ? colA : colB}
                      side={s === "a" ? -1 : 1}
                      ahead={s === "a" ? rows.score.a >= rows.score.b : rows.score.b > rows.score.a}
                      meta={sideMeta(d)}
                      lift={false}
                      className="h-full"
                    >
                      <button
                        type="button"
                        onClick={() => choose(s)}
                        aria-pressed={active}
                        className={`timing mt-2 inline-flex items-center gap-1 rounded-row border px-2 py-1 text-micro font-bold uppercase tracking-wider transition-colors duration-micro
                          ${active ? "border-carbon-400 bg-carbon-950/80 text-carbon-100" : "border-carbon-700 bg-carbon-950/60 text-carbon-400 hover:text-carbon-100"}`}
                      >
                        {active ? "Picking" : "Change"}
                        <ChevronDown size={11} />
                      </button>
                    </DriverSide>
                  </motion.div>
                </AnimatePresence>
                {/* The side that the strip will replace wears its colour. */}
                <span
                  className="absolute inset-x-0 bottom-0 h-[3px] origin-left transition-transform duration-layout ease-out-expo"
                  style={{ background: s === "a" ? colA : colB, transform: `scaleX(${active ? 1 : 0})`, transformOrigin: s === "a" ? "left" : "right" }}
                />
              </div>
            );
          })}

          <motion.div
            initial={forceVisible ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE.out, delay: 0.1 }}
            className="col-span-2 row-start-2 flex min-h-0 flex-col justify-center px-4 py-5 sm:px-8 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:px-0 lg:py-0"
          >
            <p className="eyebrow">
              Head to head · {data.season ? `${data.season} · round ${data.round}` : "latest race"}
            </p>
            <h1 className="mt-2 font-display text-4xl font-black uppercase italic leading-[0.9] tracking-tight sm:text-5xl xl:text-6xl" aria-label={data.raceName}>
              {words.map((w, i) => (
                <span key={i} className={/^grand$|^prix$/i.test(w) ? "text-carbon-400" : "text-carbon-100"}>
                  {w}{" "}
                </span>
              ))}
            </h1>
            <span className="mt-3 block h-[3px] w-16 -skew-x-[20deg] bg-f1red" />

            <div className="mt-4 flex items-end gap-3 lg:mt-6">
              <p className="font-display text-5xl font-black italic leading-none lg:text-6xl" key={`${A.code}-${B.code}`}>
                <span className={rows.score.a >= rows.score.b ? "text-carbon-100" : "text-carbon-400"}>
                  <CountUp value={rows.score.a} duration={0.6} delay={0.15} />
                </span>
                <span className="mx-1.5 text-carbon-500">–</span>
                <span className={rows.score.b > rows.score.a ? "text-carbon-100" : "text-carbon-400"}>
                  <CountUp value={rows.score.b} duration={0.6} delay={0.15} />
                </span>
              </p>
              <p className="eyebrow pb-1.5">
                Rows won · {A.code} v {B.code}
              </p>
            </div>

            <ul className="mt-2 border-t border-carbon-700/70 pt-1.5 lg:mt-4 lg:pt-2">
              {rows.headline.map((r) => (
                <DuelRow key={r.label} row={r} colA={colA} colB={colB} />
              ))}
            </ul>
          </motion.div>
        </div>

        {/* ── The field: pick either side ───────────────────────────── */}
        <div ref={stripRef} className="relative z-10 shrink-0 border-y border-carbon-800 bg-carbon-950/90 px-3 py-2 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex max-w-[1500px] items-center gap-3">
            <div className="flex shrink-0 flex-col gap-1" role="group" aria-label="Side to change">
              {(["a", "b"] as const).map((s) => {
                const d = s === "a" ? A : B;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    aria-pressed={slot === s}
                    className={`timing flex items-center gap-1.5 rounded-row px-1.5 py-0.5 text-micro font-bold uppercase tracking-wider transition-colors duration-micro
                      ${slot === s ? "bg-carbon-800 text-carbon-100" : "text-carbon-500 hover:text-carbon-200"}`}
                  >
                    <span className="h-3 w-[3px]" style={{ background: s === "a" ? colA : colB }} />
                    {s === "a" ? "Left" : "Right"} · {d.code}
                  </button>
                );
              })}
            </div>
            <span className="h-10 w-px shrink-0 bg-carbon-800" />
            <div className="flex min-w-0 flex-1 snap-x gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] xl:justify-between">
              {data.drivers.map((d: any) => {
                const at = d.code === A.code ? "a" : d.code === B.code ? "b" : null;
                return (
                  <Chip key={d.code} d={d} slot={at} color={at === "a" ? colA : at === "b" ? colB : null} disabled={!!at} onPick={() => pick(d.code)} />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <Breakdown
        data={data}
        feed={feed}
        A={data.drivers.find((d: any) => d.code === detail?.a) ?? A}
        B={data.drivers.find((d: any) => d.code === detail?.b) ?? B}
        forceVisible={forceVisible}
      />
    </main>
  );
}

/**
 * Everything below the first screen. Memoised, and fed the pairing a beat
 * after the pick: rebuilding six sections and replaying the gap chart in
 * the same frames as the driver swap is what made the swap stutter.
 */
const Breakdown = memo(function Breakdown({ data, feed, A, B, forceVisible }: { data: any; feed: any; A: any; B: any; forceVisible: boolean }) {
  const { colA, colB } = pairColours(A, B);
  const an = useMemo(() => analyse(A, B), [A, B]);
  const { gapSeries, duel } = an;
  const mock = feed?.detail?.compare === "mock";
  const { lo, hi } = traceRange(A.laps, B.laps);
  return (
    <>
      {/* ── The breakdown ─────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <MockDataBanner feed={feed} only={["compare"]} />
        {mock && (
          <p className="mb-6 rounded-panel border border-sector-yellow/40 bg-sector-yellow/[0.06] px-4 py-2 text-data text-sector-yellow">
            <span className="timing font-bold uppercase tracking-wider">Demo data</span> — live telemetry for this race
            couldn&apos;t be loaded, so the drivers and times here are built-in sample values, not the latest race.
          </p>
        )}

        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
          <Section n={1} eyebrow="Raw speed" title="Pace">
            <ul>
              {an.pace.map((r) => (
                <DuelRow key={r.label} row={r} colA={colA} colB={colB} dense />
              ))}
            </ul>
          </Section>

          <Section n={2} eyebrow="Strategy & racecraft" title="Race execution">
            <ul>
              {an.execution.map((r) => (
                <DuelRow key={r.label} row={r} colA={colA} colB={colB} dense />
              ))}
            </ul>
            <div className="mt-4 border-t border-carbon-800 pt-3">
              <p className="eyebrow mb-2 text-center">Compounds run · in order · laps</p>
              <div className="grid grid-cols-2 gap-3">
                <StintChips driver={A} align="start" />
                <StintChips driver={B} align="end" />
              </div>
            </div>
          </Section>
        </div>

        <Section
          n={3}
          eyebrow="Every lap · shared scale · mirrored, outward = slower"
          title="Lap-time trace"
          aside={<Legend A={A} B={B} colA={colA} colB={colB} />}
          className="mt-12"
        >
          <div className="relative flex h-44 flex-col sm:h-52">
            <LapTrace laps={A.laps} color={colA} code={A.code} lo={lo} hi={hi} />
            <span className="pointer-events-none my-px h-px shrink-0 bg-carbon-700" />
            <LapTrace laps={B.laps} color={colB} code={B.code} lo={lo} hi={hi} mirror />
          </div>
          <div className="timing mt-1 flex justify-between pl-10 text-micro text-carbon-500">
            <span>L1</span>
            <span>L{data.totalLaps}</span>
          </div>
        </Section>

        <Section
          n={4}
          eyebrow={`Above zero = ${A.code} ahead on the road`}
          title="Cumulative gap"
          aside={<Legend A={A} B={B} colA={colA} colB={colB} />}
          className="mt-12"
        >
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={gapSeries} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="lap" tick={TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} unit="s" />
                <ReferenceLine y={0} stroke="#2A3242" strokeWidth={1.5} />
                <Tooltip
                  content={({ active, payload, label }: any) =>
                    active && payload?.length ? (
                      <div className="rounded-row border border-carbon-600 bg-carbon-950/95 px-3 py-2 shadow-panel backdrop-blur-sm">
                        <p className="eyebrow mb-0.5">Lap {label}</p>
                        <p className="timing text-xs font-bold text-carbon-100">
                          <span className="mr-1.5 inline-block h-2.5 w-[3px] align-middle" style={{ background: payload[0].value >= 0 ? colA : colB }} />
                          {payload[0].value >= 0 ? A.code : B.code} ahead by {Math.abs(payload[0].value).toFixed(2)}s
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Line
                  type="monotone"
                  dataKey="gap"
                  stroke={colA}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  /* Redraws on every pick, left to right: the gap story
                     replays for each new pairing. */
                  key={`${A.code}-${B.code}`}
                  isAnimationActive={!forceVisible}
                  animationDuration={1100}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <div className="mt-12 grid gap-x-12 gap-y-10 lg:grid-cols-2">
          {duel.length > 0 && (
            <Section n={5} eyebrow="Who was quicker, lap by lap" title="Lap duel">
              <div className="flex gap-[3px]">
                {duel.map((s: any, i: number) => (
                  <span
                    key={i}
                    title={`Lap ${s.lap}: ${s.w === "EQ" ? "even" : s.w === "A" ? A.code : B.code}`}
                    className="h-3 flex-1 transition-transform duration-micro hover:scale-y-150"
                    style={{ background: s.w === "A" ? colA : s.w === "B" ? colB : "#3A4352" }}
                  />
                ))}
              </div>
              <div className="timing mt-1.5 flex justify-between text-micro font-bold text-carbon-300">
                <span>{A.code} · {duel.filter((d: any) => d.w === "A").length}</span>
                <span className="font-normal text-carbon-500">18 sampled laps · even {duel.filter((d: any) => d.w === "EQ").length}</span>
                <span>{B.code} · {duel.filter((d: any) => d.w === "B").length}</span>
              </div>
              {/* Per-lap delta across the WHOLE race, not 18 samples. */}
              <div className="mt-5 flex h-36 flex-col border-t border-carbon-800 pt-3">
                <p className="eyebrow mb-2 shrink-0">Per-lap delta · above the line = {A.code} quicker</p>
                <LapDelta a={A} b={B} aHex={colA} bHex={colB} />
              </div>
            </Section>
          )}

          <Section n={duel.length > 0 ? 6 : 5} eyebrow="Tyres & stops" title="Strategy">
            <TyreStintTimeline
              stints={[{ code: A.code, stints: A.stints }, { code: B.code, stints: B.stints }]}
              totalLaps={data.totalLaps}
            />
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-carbon-800 pt-3">
              {[A, B].map((d: any, i) => (
                <div key={d.code}>
                  <p className="timing mb-1 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-carbon-200">
                    <span className="h-3 w-[3px]" style={{ background: i === 0 ? colA : colB }} />
                    {d.code} stops
                  </p>
                  {d.pits.length ? (
                    <ul className="timing space-y-0.5 text-data text-carbon-300">
                      {d.pits.map((p: any, j: number) => (
                        <li key={j}>L{p.lap} · {p.laneTime.toFixed(1)}s in the lane</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-data text-carbon-400">No stops recorded</p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
});
