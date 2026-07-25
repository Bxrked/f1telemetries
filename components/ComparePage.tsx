"use client";

import { useEffect, useMemo, useState } from "react";
import { Swords } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { getDriverComparison, getFeedStatus } from "@/services/f1Service";
import { formatClock } from "@/services/format";
import MockDataBanner from "./MockDataBanner";
import TyreStintTimeline from "./TyreStintTimeline";

const A_HEX = "#B44CFF"; // driver A accent (sector purple)
const B_HEX = "#2EE07C"; // driver B accent (sector green)

const fmtLap = (s: number | null) => (s == null ? "—" : formatClock(s, 3));

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
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 2xl:max-w-[1440px]">
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
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 2xl:max-w-[1440px]">
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
          {/* Stat grid */}
          <section className="rounded-xl border border-carbon-700 bg-carbon-850 px-5 py-3 shadow-panel">
            <StatRow label="Finish" a={A.finish} b={B.finish} fmt={(v: number) => `P${v}`} />
            <StatRow label="Grid" a={A.grid} b={B.grid} fmt={(v: number) => `P${v}`} />
            <StatRow label="Best lap" a={A.bestLap} b={B.bestLap} fmt={fmtLap} />
            <StatRow label="Avg pace" a={A.avgPace} b={B.avgPace} fmt={fmtLap} />
            <StatRow label="Vmax" a={A.vmax} b={B.vmax} fmt={(v: number) => `${v} km/h`} lowerBetter={false} />
            <StatRow label="Pit stops" a={A.pits.length} b={B.pits.length} fmt={(v: number) => `${v}`} />
          </section>

          {/* Best sectors: facing bars */}
          <section className="rounded-xl border border-carbon-700 bg-carbon-850 p-5 shadow-panel">
            <p className="eyebrow mb-3">Best sectors (s) · faster side highlighted</p>
            {(["s1", "s2", "s3"] as const).map((key, i) => {
              const a = A[key], b = B[key];
              if (a == null || b == null) return null;
              const max = Math.max(a, b);
              const aWins = a <= b;
              return (
                <div key={key} className="mb-2 grid grid-cols-[1fr_54px_1fr] items-center gap-2 last:mb-0">
                  <div className="flex items-center justify-end gap-2">
                    <span className={`timing text-[11px] font-bold ${aWins ? "text-sector-purple" : "text-carbon-300"}`}>
                      {a.toFixed(3)}
                    </span>
                    <span className="h-2.5 rounded-l-full" style={{ width: `${(a / max) * 70}%`, background: aWins ? A_HEX : "#3a4152" }} />
                  </div>
                  <span className="eyebrow text-center">S{i + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 rounded-r-full" style={{ width: `${(b / max) * 70}%`, background: !aWins ? B_HEX : "#3a4152" }} />
                    <span className={`timing text-[11px] font-bold ${!aWins ? "text-sector-green" : "text-carbon-300"}`}>
                      {b.toFixed(3)}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Cumulative gap */}
          <section className="rounded-xl border border-carbon-700 bg-carbon-850 p-5 shadow-panel xl:col-span-2">
            <p className="eyebrow mb-1">
              Cumulative gap · above zero = <span style={{ color: A_HEX }}>{A.code}</span> ahead
            </p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={gapSeries} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2430" />
                  <XAxis dataKey="lap" tick={{ fill: "#5B6678", fontSize: 10, fontFamily: "var(--font-timing)" }} axisLine={{ stroke: "#2A3242" }} tickLine={false} />
                  <YAxis tick={{ fill: "#5B6678", fontSize: 10, fontFamily: "var(--font-timing)" }} axisLine={false} tickLine={false} unit="s" />
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
            <section className="rounded-xl border border-carbon-700 bg-carbon-850 p-5 shadow-panel">
              <p className="eyebrow mb-2">Lap duel · 18 sampled racing laps</p>
              <div className="flex gap-[3px]">
                {duel.map((s: any, i: number) => (
                  <span
                    key={i}
                    title={`Lap ${s.lap}: ${s.w === "EQ" ? "even" : s.w === "A" ? A.code : B.code}`}
                    className="h-3 flex-1 rounded-[2px] transition-transform duration-150 hover:scale-y-150"
                    style={{ background: s.w === "A" ? A_HEX : s.w === "B" ? B_HEX : "#5B6678" }}
                  />
                ))}
              </div>
              <div className="timing mt-1 flex justify-between text-[10px] text-carbon-400">
                <span style={{ color: A_HEX }}>■ {A.code} · {duel.filter((d: any) => d.w === "A").length}</span>
                <span>even · {duel.filter((d: any) => d.w === "EQ").length}</span>
                <span style={{ color: B_HEX }}>■ {B.code} · {duel.filter((d: any) => d.w === "B").length}</span>
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
