"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { rowReveal, rowDelay, SPRING, EASE } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";

/**
 * Championship standings after the latest round.
 * Tab toggle between Drivers and Constructors; inline points bars
 * scaled to the leader, gap column in timing mono.
 */
export default function StandingsPanel({ standings }: { standings: any }) {
  const [tab, setTab] = useState<"drivers" | "constructors">("drivers");
  const rows = tab === "drivers" ? standings.drivers : standings.constructors;
  const maxPoints = rows[0]?.points ?? 1;
  const forceVisible = useForceVisible();

  return (
    <div>
      {/* Tab toggle — the red pill slides between tabs via layoutId rather
          than blinking out of one and into the other. */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-row border border-carbon-700 bg-carbon-900 p-1">
        {(["drivers", "constructors"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`timing relative rounded-row px-2 py-1.5 text-micro font-bold uppercase tracking-wider
              transition-colors duration-micro ease-out-expo
              ${tab === t ? "text-white" : "text-carbon-300 hover:text-carbon-100"}`}
            aria-pressed={tab === t}
          >
            {tab === t && (
              <motion.span
                layoutId="standings-tab"
                transition={SPRING.panel}
                className="absolute inset-0 rounded-row bg-f1red"
              />
            )}
            <span className="relative z-10">{t}</span>
          </button>
        ))}
      </div>

      {/* Rows re-stagger on tab change: it's a different dataset, so the
          cascade reads as "new data" rather than decoration. */}
      {/* key={tab} remounts the list on tab change so the rows re-stagger —
          that cascade is what signals "different dataset". Deliberately NOT
          wrapped in an opacity fade: a stranded wrapper would hide the
          entire standings list, and the stagger already does the work. */}
      <ul key={tab} className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
        {rows.map((r: any, i: number) => (
          <motion.li
            key={r.pos}
            custom={i}
            variants={rowReveal}
            initial={forceVisible ? false : "hidden"}
            animate="show"
            /* Livery tint on hover: the row picks up the team's own colour
               instead of a generic grey wash, so scanning the table stays
               connected to who you're looking at. */
            style={{ ["--team" as any]: r.teamColor ?? r.color }}
            className="group flex items-center gap-2.5 rounded-row border border-transparent px-2 py-1
              transition-colors duration-micro ease-out-expo
              hover:border-[color-mix(in_srgb,var(--team)_45%,transparent)]
              hover:bg-[color-mix(in_srgb,var(--team)_10%,transparent)]"
          >
            <span className="timing w-5 shrink-0 text-right text-label font-bold tabular-nums text-carbon-400">
              {r.pos}
            </span>
            <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: r.teamColor ?? r.color }} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-label font-bold text-carbon-100">
                {tab === "drivers" ? r.code : r.team}
                {r.pos === 1 && <Crown size={11} className="shrink-0 text-sector-yellow" />}
                {tab === "drivers" && r.wins > 0 && (
                  <span className="timing text-micro font-medium tabular-nums text-carbon-400">{r.wins}W</span>
                )}
              </p>
              <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-carbon-800">
                <motion.span
                  className="block h-full rounded-full group-hover:brightness-125"
                  style={{ background: r.teamColor ?? r.color }}
                  initial={forceVisible ? false : { width: 0 }}
                  animate={{ width: `${(r.points / maxPoints) * 100}%` }}
                  transition={{ duration: 0.5, ease: EASE.out, delay: rowDelay(i) }}
                />
              </span>
            </div>
            <div className="timing shrink-0 text-right tabular-nums">
              <p className="text-label font-bold text-carbon-100">{r.points}</p>
              <p className="text-micro text-carbon-400">{r.gap === 0 ? "Leader" : `-${r.gap}`}</p>
            </div>
          </motion.li>
        ))}
      </ul>

      <p className="eyebrow mt-2.5 border-t border-carbon-700 pt-2 text-right">
        After Round {standings.afterRound}
      </p>
    </div>
  );
}
