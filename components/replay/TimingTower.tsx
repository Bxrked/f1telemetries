"use client";

import { useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import { SPRING } from "@/lib/motion";
import { COMPOUND } from "@/lib/chartTheme";

const SHORT: Record<string, string> = { SOFT: "S", MEDIUM: "M", HARD: "H", INTER: "I", WET: "W" };

const fmtGap = (v: number | null) => (v == null ? "—" : `+${v.toFixed(v >= 100 ? 0 : 1)}`);

/**
 * Broadcast-style running order at the playhead. Rows slide to their new
 * slot on a position change (shared layout), so a pass reads as motion in
 * the tower as well as on the map.
 *
 * Gap/Interval toggle mirrors the real tower. Values step at timing lines
 * — they're measured there, never interpolated between.
 */
export default function TimingTower({
  data,
  cars,
  gaps,
  lap,
  t,
  focus,
  onFocus,
  speaking,
}: {
  data: any;
  cars: any[];
  gaps: any[];
  lap: number;
  t: number;
  focus: number | null;
  onFocus: (num: number | null) => void;
  /** Car whose team radio is playing right now. */
  speaking: number | null;
}) {
  const [mode, setMode] = useState<"interval" | "gap">("interval");
  const gapOf: Record<number, any> = {};
  gaps.forEach((g) => (gapOf[g.num] = g));

  const compoundAt = (num: number, carLap: number) => {
    const list = data.stints[num] ?? [];
    const s = list.find((x: any) => (x.from ?? 0) <= carLap && carLap <= (x.to ?? Infinity)) ?? list[list.length - 1];
    return s?.compound ?? null;
  };
  const stopsBy = (num: number) => data.pits.filter((p: any) => p.num === num && p.t <= t).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <p className="eyebrow">Lap {lap}</p>
        {/* Two-way toggle with a sliding pill, same as standings tabs. */}
        <div className="flex rounded-row border border-carbon-700 bg-carbon-900 p-0.5">
          {(["interval", "gap"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`timing relative px-2 py-0.5 text-micro font-bold uppercase tracking-wider transition-colors duration-micro
                ${mode === m ? "text-white" : "text-carbon-400 hover:text-carbon-100"}`}
            >
              {mode === m && (
                <motion.span layoutId="tower-mode" transition={SPRING.panel} className="absolute inset-0 rounded-[3px] bg-carbon-600" />
              )}
              <span className="relative">{m === "gap" ? "Leader" : "Int"}</span>
            </button>
          ))}
        </div>
      </div>

      <LayoutGroup>
        <ol className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          {cars.map((c, i) => {
            const id = data.drivers[c.num] ?? {};
            const g = gapOf[c.num];
            const comp = compoundAt(c.num, c.lap);
            const isFocus = focus === c.num;
            const out = c.state === "retired";
            const fin = c.state === "finished";
            let readout: React.ReactNode;
            if (out) readout = <span className="text-f1red-bright">OUT</span>;
            else if (c.inPit) readout = <span className="text-sector-yellow">PIT</span>;
            else if (i === 0) readout = <span className="text-carbon-300">{fin ? "FIN" : "Leader"}</span>;
            else if (c.state === "grid") readout = <span className="text-carbon-500">P{i + 1}</span>;
            else if (mode === "gap" && g?.lapsDown >= 1) readout = <span className="text-carbon-400">+{g.lapsDown} lap{g.lapsDown > 1 ? "s" : ""}</span>;
            else if (mode === "interval" && g?.lapsToAhead >= 1) readout = <span className="text-carbon-400">+{g.lapsToAhead} lap{g.lapsToAhead > 1 ? "s" : ""}</span>;
            else readout = fmtGap(mode === "gap" ? g?.gap : g?.interval);

            return (
              <motion.li
                key={c.num}
                layout="position"
                transition={SPRING.panel}
                style={{ ["--team" as any]: id.teamColor }}
                className={`group relative flex h-7 cursor-pointer items-center gap-2 border-b border-carbon-800/80 pl-1 pr-1.5
                  transition-colors duration-micro
                  ${isFocus ? "bg-[color-mix(in_srgb,var(--team)_18%,transparent)]" : "hover:bg-carbon-800/60"}
                  ${out ? "opacity-45" : ""}`}
                onClick={() => onFocus(isFocus ? null : c.num)}
                aria-current={isFocus || undefined}
              >
                <span className={`timing w-5 shrink-0 text-right text-label font-bold ${i < 3 && !out ? "text-carbon-100" : "text-carbon-400"}`}>
                  {out ? "–" : i + 1}
                </span>
                <span className="h-4 w-[3px] shrink-0" style={{ background: id.teamColor }} />
                <span className="timing w-9 shrink-0 text-label font-bold text-carbon-100">{id.code ?? c.num}</span>
                {speaking === c.num && (
                  <span className="flex h-3 items-end gap-px" title="Team radio" aria-label="On team radio">
                    {[0, 1, 2].map((k) => (
                      <motion.span
                        key={k}
                        className="w-[2px]"
                        style={{ background: id.teamColor }}
                        animate={{ height: ["35%", "100%", "50%", "35%"] }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay: k * 0.15 }}
                      />
                    ))}
                  </span>
                )}
                <span className="timing ml-auto text-data tabular-nums text-carbon-100">{readout}</span>
                <span
                  title={comp ?? "Unknown compound"}
                  className="timing grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] text-[8px] font-bold"
                  style={{ borderColor: COMPOUND[comp] ?? "#5B6678", color: COMPOUND[comp] ?? "#5B6678" }}
                >
                  {SHORT[comp] ?? "?"}
                </span>
                <span className="timing w-3 shrink-0 text-right text-micro text-carbon-400" title="Pit stops">
                  {stopsBy(c.num) || ""}
                </span>
              </motion.li>
            );
          })}
        </ol>
      </LayoutGroup>
    </div>
  );
}
