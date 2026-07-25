"use client";

import { useState } from "react";
import { Crown } from "lucide-react";

/**
 * Championship standings after the latest round.
 * Tab toggle between Drivers and Constructors; inline points bars
 * scaled to the leader, gap column in timing mono.
 */
export default function StandingsPanel({ standings }: { standings: any }) {
  const [tab, setTab] = useState<"drivers" | "constructors">("drivers");
  const rows = tab === "drivers" ? standings.drivers : standings.constructors;
  const maxPoints = rows[0]?.points ?? 1;

  return (
    <div>
      {/* Tab toggle */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-carbon-700 bg-carbon-900 p-1">
        {(["drivers", "constructors"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`timing rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors duration-150
              ${tab === t ? "bg-f1red text-white" : "text-carbon-300 hover:text-carbon-100"}`}
            aria-pressed={tab === t}
          >
            {t}
          </button>
        ))}
      </div>

      <ul className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
        {rows.map((r: any) => (
          <li
            key={r.pos}
            className="group flex items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5
              transition-colors duration-150 hover:border-carbon-700 hover:bg-carbon-800/60"
          >
            <span className="timing w-5 shrink-0 text-right text-xs font-bold text-carbon-400">
              {r.pos}
            </span>
            <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: r.teamColor ?? r.color }} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-xs font-bold text-carbon-100">
                {tab === "drivers" ? r.code : r.team}
                {r.pos === 1 && <Crown size={11} className="shrink-0 text-sector-yellow" />}
                {tab === "drivers" && r.wins > 0 && (
                  <span className="timing text-[9px] font-medium text-carbon-400">{r.wins}W</span>
                )}
              </p>
              <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-carbon-800">
                <span
                  className="block h-full rounded-full transition-all duration-300 group-hover:brightness-125"
                  style={{ width: `${(r.points / maxPoints) * 100}%`, background: r.teamColor ?? r.color }}
                />
              </span>
            </div>
            <div className="timing shrink-0 text-right">
              <p className="text-xs font-bold text-carbon-100">{r.points}</p>
              <p className="text-[9px] text-carbon-400">{r.gap === 0 ? "Leader" : `-${r.gap}`}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="eyebrow mt-2.5 border-t border-carbon-700 pt-2 text-right">
        After Round {standings.afterRound}
      </p>
    </div>
  );
}
