"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Timer } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");

function useCountdown(targetIso?: string) {
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!targetIso) return;
    const tick = () => {
      const ms = new Date(targetIso).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining("LIGHTS OUT");
        return;
      }
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

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

/**
 * Season calendar strip: past rounds greyed with winner, latest completed
 * ringed in red, next round highlighted with a live countdown, rest dim.
 */
export default function ScheduleStrip({ schedule }: { schedule: any }) {
  const { rounds, latest, nextRace } = schedule;
  const countdown = useCountdown(nextRace?.date);

  return (
    <div>
      {/* Next-race countdown banner */}
      {nextRace && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-f1red/40 bg-f1red/10 px-4 py-2.5">
          <span className="flex items-center gap-2 text-xs text-carbon-300">
            <Timer size={14} className="text-f1red-bright" />
            Next race · <span className="font-bold text-carbon-100">{nextRace.gp}</span>
            <span className="hidden text-carbon-400 sm:inline">— {nextRace.circuit}</span>
          </span>
          <span
            className="timing text-lg font-bold tracking-wider text-f1red-bright"
            aria-live="polite"
          >
            {countdown ?? "—"}
          </span>
        </div>
      )}

      {/* Scrollable round strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {rounds.map((r: any) => {
          const isLatest = latest && r.round === latest.round;
          const isNext = nextRace && r.round === nextRace.round;
          const past = r.status === "completed";
          return (
            <div
              key={r.round}
              title={`${r.gp} · ${r.circuit}`}
              className={`min-w-[104px] shrink-0 rounded-lg border px-3 py-2 transition-colors duration-200
                ${isLatest ? "border-f1red bg-f1red/10" : ""}
                ${isNext ? "border-sector-green/60 bg-sector-green/5" : ""}
                ${!isLatest && !isNext ? "border-carbon-700 bg-carbon-900/60" : ""}
                ${past && !isLatest ? "opacity-55" : ""}
                hover:border-carbon-400`}
            >
              <div className="flex items-center justify-between">
                <span className="eyebrow">R{r.round}</span>
                {isLatest && (
                  <span className="timing rounded bg-f1red px-1 py-px text-[8px] font-bold text-white">
                    LATEST
                  </span>
                )}
                {isNext && (
                  <span className="timing rounded bg-sector-green/20 px-1 py-px text-[8px] font-bold text-sector-green">
                    NEXT
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-display text-xs font-bold uppercase">{r.country}</p>
              <p className="timing text-[10px] text-carbon-400">{fmtDate(r.date)}</p>
              <p className="timing mt-0.5 text-[10px]">
                {past ? (
                  <>
                    <span className="text-carbon-400">🏆 </span>
                    <span className="font-bold text-carbon-100">{r.winner ?? "—"}</span>
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-carbon-400">
                    <CalendarDays size={9} /> Upcoming
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
