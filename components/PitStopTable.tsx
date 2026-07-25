"use client";

import { Trophy } from "lucide-react";

/**
 * Pit Stop Leaderboard.
 * MOCK mode ships wheels-stopped (stationary) times → full column set.
 * LIVE mode (OpenF1) provides pit-lane duration + timestamp only, so the
 * board ranks lane time honestly instead of inventing stationary times.
 */
export default function PitStopTable({ pitStops }: { pitStops: any[] }) {
  const hasStationary = pitStops[0]?.stationary != null;
  const metric = (p: any) => (hasStationary ? p.stationary : p.laneTime);
  const slowest = Math.max(...pitStops.map(metric));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse text-xs">
        <thead>
          <tr className="eyebrow border-b border-carbon-700 text-left">
            <th className="pb-2 pr-2 font-medium">#</th>
            <th className="pb-2 pr-2 font-medium">Driver</th>
            <th className="pb-2 pr-2 font-medium">Lap</th>
            {hasStationary ? (
              <>
                <th className="pb-2 pr-2 font-medium">Pit in</th>
                <th className="pb-2 pr-2 font-medium">Pit out</th>
                <th className="pb-2 pr-2 text-right font-medium">Lane</th>
                <th className="pb-2 text-right font-medium">Stationary</th>
              </>
            ) : (
              <>
                <th className="pb-2 pr-2 font-medium">Time (UTC)</th>
                <th className="pb-2 text-right font-medium">Pit lane</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="timing">
          {pitStops.map((p, i) => (
            <tr
              key={`${p.code}-${p.lap}-${i}`}
              className="group border-b border-carbon-700/50 transition-colors hover:bg-carbon-800/60"
            >
              <td className="py-2 pr-2 text-carbon-400">{i + 1}</td>
              <td className="py-2 pr-2 font-bold text-carbon-100">
                <span className="flex items-center gap-1.5">
                  {p.code}
                  {i === 0 && <Trophy size={11} className="text-sector-purple" />}
                </span>
              </td>
              <td className="py-2 pr-2 text-carbon-300">L{p.lap}</td>
              {hasStationary && (
                <>
                  <td className="py-2 pr-2 text-carbon-300">{p.pitIn}</td>
                  <td className="py-2 pr-2 text-carbon-300">{p.pitOut}</td>
                  <td className="py-2 pr-2 text-right text-carbon-300">{p.laneTime.toFixed(3)}s</td>
                </>
              )}
              {!hasStationary && (
                <td className="py-2 pr-2 text-carbon-300">{p.timeOfDay ?? "—"}</td>
              )}
              <td className="py-2 text-right">
                <span className="relative inline-block min-w-[72px]">
                  <span
                    className="absolute inset-y-0 right-0 rounded-sm bg-f1red/15 transition-all group-hover:bg-f1red/25"
                    style={{ width: `${(metric(p) / slowest) * 100}%` }}
                  />
                  <span className={`relative pr-1 font-bold ${i === 0 ? "text-sector-purple" : "text-carbon-100"}`}>
                    {metric(p).toFixed(hasStationary ? 2 : 1)}s
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
