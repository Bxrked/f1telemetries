"use client";

import { useState } from "react";

const COMPOUND: Record<string, { color: string; short: string; label: string }> = {
  SOFT:   { color: "#FF3B30", short: "S", label: "Soft" },
  MEDIUM: { color: "#FFD644", short: "M", label: "Medium" },
  HARD:   { color: "#E7EAF0", short: "H", label: "Hard" },
  INTER:  { color: "#43D675", short: "I", label: "Intermediate" },
  WET:    { color: "#3B9BFF", short: "W", label: "Wet" },
};

const UNKNOWN_COMPOUND = { color: "#5B6678", short: "?", label: "Unknown" };

/**
 * Tyre strategy timeline — one horizontal track per driver, stints scaled
 * to lap count. Hovering a stint shows compound + lap window.
 */
export default function TyreStintTimeline({ stints, totalLaps }: { stints: any[]; totalLaps: number }) {
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div>
      <div className="space-y-1.5">
        {stints.map((driver) => (
          <div key={driver.code} className="flex items-center gap-3">
            <span className="timing w-9 shrink-0 text-right text-[11px] font-bold text-carbon-300">
              {driver.code}
            </span>
            <div className="relative flex h-5 flex-1 overflow-hidden rounded-md border border-carbon-700 bg-carbon-900">
              {driver.stints.map((stint: any, i: number) => {
                const laps = stint.to - stint.from + 1;
                const key = `${driver.code}-${i}`;
                const c = COMPOUND[stint.compound] ?? UNKNOWN_COMPOUND;
                return (
                  <div
                    key={key}
                    onMouseEnter={() => setHover(key)}
                    onMouseLeave={() => setHover(null)}
                    className="relative flex items-center justify-center border-r border-carbon-950/60 last:border-r-0
                      transition-[filter] duration-150"
                    style={{
                      width: `${(laps / totalLaps) * 100}%`,
                      background: c.color,
                      filter: hover && hover !== key ? "brightness(0.45)" : "brightness(1)",
                    }}
                  >
                    <span className="timing text-[9px] font-bold text-carbon-950">
                      {hover === key ? `${c.short} · L${stint.from}–${stint.to}` : c.short}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Lap axis + compound legend */}
      <div className="timing ml-12 mt-1 flex justify-between text-[9px] text-carbon-400">
        <span>L1</span><span>L{Math.round(totalLaps / 2)}</span><span>L{totalLaps}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 border-t border-carbon-700 pt-2.5">
        {Object.values(COMPOUND).map((c) => (
          <span key={c.label} className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-carbon-300">
            <span className="grid h-3.5 w-3.5 place-items-center rounded-full border-2" style={{ borderColor: c.color }}>
              <span className="timing text-[7px] font-bold" style={{ color: c.color }}>{c.short}</span>
            </span>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
