"use client";

import { useEffect, useState } from "react";
import { Radio, Info } from "lucide-react";
import { getSessionInfo, getTrackOutline } from "@/services/f1Service";
import RaceReplay from "./RaceReplay";

/**
 * Live Race page. Today: broadcast-style replay of the most recent race
 * (free historical data). Later: true live via authenticated OpenF1
 * WebSocket — same RaceReplay component, different source.
 */
export default function LiveRacePage() {
  const [session, setSession] = useState<any>(null);
  const [outline, setOutline] = useState<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, o] = await Promise.all([getSessionInfo(), getTrackOutline()]);
      if (!cancelled) {
        setSession(s);
        setOutline(o);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 2xl:max-w-[1440px]">
        <div className="h-16 w-2/3 animate-pulse rounded-xl bg-carbon-850" />
        <div className="mt-4 h-[460px] animate-pulse rounded-xl bg-carbon-850" />
        <p className="timing mt-6 text-center text-xs text-carbon-400">Preparing broadcast…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 2xl:max-w-[1440px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-carbon-700 pb-5">
        <div>
          <p className="eyebrow mb-1 flex items-center gap-2">
            <Radio size={11} className="text-f1red-bright" /> Broadcast mode
          </p>
          <h1 className="font-display text-4xl font-black uppercase italic tracking-tight sm:text-5xl">
            <span className="text-f1red-bright">{session.meetingName.split(" ")[0]}</span>{" "}
            {session.meetingName.split(" ").slice(1).join(" ")}
          </h1>
        </div>
        <span className="timing flex items-center gap-2 rounded-lg border border-f1red/40 bg-f1red/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-f1red-bright">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
          Replay · most recent race
        </span>
      </header>

      <section className="relative overflow-hidden rounded-xl border border-carbon-700 bg-carbon-850 p-5 shadow-panel">
        <span className="absolute left-0 top-5 h-8 w-[3px] rounded-r bg-f1red shadow-red-glow" />
        <RaceReplay outline={outline} />
      </section>

      <p className="mt-4 flex items-start gap-2 rounded-lg border border-carbon-700 bg-carbon-900/60 px-4 py-3 text-[11px] leading-relaxed text-carbon-400">
        <Info size={13} className="mt-0.5 shrink-0 text-carbon-300" />
        <span>
          This page replays the latest completed Grand Prix from historical GPS data
          (free, available ~30 minutes after each session ends). True live timing during
          sessions requires an OpenF1 supporter subscription and will plug into this same
          view — dots and running order become real-time.
        </span>
      </p>
    </main>
  );
}
