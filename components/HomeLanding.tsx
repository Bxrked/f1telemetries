"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Radio, Swords, Timer, Trophy, ChevronRight } from "lucide-react";
import { getSeasonSchedule } from "@/services/f1Service";

const pad = (n: number) => String(n).padStart(2, "0");

function useCountdown(targetIso?: string) {
  const [remaining, setRemaining] = useState<string | null>(null);
  useEffect(() => {
    if (!targetIso) return;
    const tick = () => {
      const ms = new Date(targetIso).getTime() - Date.now();
      if (ms <= 0) return setRemaining("LIGHTS OUT");
      const d = Math.floor(ms / 86_400_000);
      const h = Math.floor((ms % 86_400_000) / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1_000);
      setRemaining(`${d}d ${pad(h)}:${pad(m)}:${pad(s)}`);
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [targetIso]);
  return remaining;
}

const SECTIONS = [
  {
    href: "/telemetry",
    icon: BarChart3,
    title: "Post-Race Telemetry",
    desc: "Sector analysis, tyre strategy, pit stops, degradation models, speed traps and championship standings for the latest Grand Prix — updated automatically after every race.",
    cta: "Open dashboard",
  },
  {
    href: "/live",
    icon: Radio,
    title: "Live Race",
    desc: "Broadcast-style animated race map: every car as a labelled dot with a live running order and gaps. Currently replays the most recent race; true live coming.",
    cta: "Enter broadcast mode",
    live: true,
  },
  {
    href: "/compare",
    icon: Swords,
    title: "Head-to-Head",
    desc: "Pick any two drivers from the latest race: best sectors, race pace, top speed, lap-by-lap duel, cumulative gap trace and pit strategies, side by side.",
    cta: "Compare drivers",
  },
];

export default function HomeLanding() {
  const [schedule, setSchedule] = useState<any>(null);
  useEffect(() => {
    getSeasonSchedule().then(setSchedule).catch(() => {});
  }, []);
  const countdown = useCountdown(schedule?.nextRace?.date);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-64px)] max-w-7xl flex-col items-center justify-center px-4 py-14 text-center sm:px-6 2xl:max-w-[1440px]">
      {/* Hero */}
      <p className="eyebrow mb-3 flex items-center justify-center gap-2">
        <span className="inline-block h-2 w-2 animate-pulse-dot rounded-full bg-f1red-bright" />
        {schedule ? `Season ${schedule.season}` : "Race analytics platform"}
      </p>
      <h1 className="font-display text-6xl font-black uppercase italic leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl">
        <span className="text-f1red-bright">F1</span> Telemetries
      </h1>
      <p className="timing mt-3 text-[11px] uppercase tracking-[0.3em] text-carbon-400">
        f1telemetries.com
      </p>
      <p className="mx-auto mt-5 max-w-2xl text-sm text-carbon-300 sm:text-base">
        Live-data race intelligence: telemetry, strategy and broadcast-style
        replays for every Grand Prix — self-updating, race after race.
      </p>

      {/* Next race / latest race strip */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {schedule?.nextRace && (
          <div className="flex items-center gap-3 rounded-lg border border-f1red/40 bg-f1red/10 px-4 py-2.5">
            <Timer size={14} className="text-f1red-bright" />
            <span className="text-xs text-carbon-300">
              Next · <span className="font-bold text-carbon-100">{schedule.nextRace.gp}</span>
            </span>
            <span className="timing text-sm font-bold tracking-wider text-f1red-bright">
              {countdown ?? "—"}
            </span>
          </div>
        )}
        {schedule?.latest && (
          <div className="flex items-center gap-3 rounded-lg border border-carbon-700 bg-carbon-850 px-4 py-2.5">
            <Trophy size={14} className="text-sector-yellow" />
            <span className="text-xs text-carbon-300">
              Latest · <span className="font-bold text-carbon-100">{schedule.latest.gp}</span>
              {schedule.latest.winner && (
                <span className="timing ml-2 text-sector-yellow">🏆 {schedule.latest.winner}</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Section cards */}
      <div className="mt-12 grid w-full gap-5 text-left sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ href, icon: Icon, title, desc, cta, live }) => (
          <Link
            key={href}
            href={href}
            className="group relative overflow-hidden rounded-xl border border-carbon-700 bg-carbon-850 p-7
              shadow-panel transition-all duration-300 hover:-translate-y-0.5 hover:border-f1red/60 hover:shadow-red-glow"
          >
            <span className="absolute left-0 top-6 h-10 w-[3px] rounded-r bg-f1red opacity-60 transition-opacity group-hover:opacity-100" />
            <div className="mb-4 flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-carbon-800 text-carbon-300 transition-colors group-hover:text-f1red-bright">
                <Icon size={18} />
              </span>
              {live && (
                <span className="timing flex items-center gap-1.5 rounded bg-f1red/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-f1red-bright">
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
                  Replay
                </span>
              )}
            </div>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide">{title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-carbon-300">{desc}</p>
            <p className="timing mt-4 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-f1red-bright">
              {cta} <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </p>
          </Link>
        ))}
      </div>

      <p className="mt-12 text-[10px] text-carbon-400">
        f1telemetries.com · Data: Jolpica (results · standings · schedule) & OpenF1 (telemetry · GPS · weather)
        <br />
        Unofficial fan project — not affiliated with, endorsed by, or connected to Formula 1, the FIA, or any team.
      </p>
    </main>
  );
}
