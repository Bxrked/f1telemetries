"use client";

import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { rowReveal, rowDelay, EASE } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";

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
  const forceVisible = useForceVisible();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse text-label">
        {/* Sticky header: the board scrolls inside its panel, and a column
            you can't identify is a column you can't read. */}
        <thead className="sticky top-0 z-10 bg-carbon-850">
          <tr className="eyebrow border-b border-carbon-700 text-left">
            <th className="pb-1.5 pr-2 font-medium">#</th>
            <th className="pb-1.5 pr-2 font-medium">Driver</th>
            <th className="pb-1.5 pr-2 font-medium">Lap</th>
            {hasStationary ? (
              <>
                <th className="pb-1.5 pr-2 font-medium">Pit in</th>
                <th className="pb-1.5 pr-2 font-medium">Pit out</th>
                <th className="pb-2 pr-2 text-right font-medium">Lane</th>
                <th className="pb-2 text-right font-medium">Stationary</th>
              </>
            ) : (
              <>
                <th className="pb-1.5 pr-2 font-medium">Time (UTC)</th>
                <th className="pb-2 text-right font-medium">Pit lane</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="timing tabular-nums">
          {pitStops.map((p, i) => (
            <motion.tr
              key={`${p.code}-${p.lap}-${i}`}
              custom={i}
              variants={rowReveal}
              initial={forceVisible ? false : "hidden"}
              /* Mount, not whileInView: the Panel already reveals on scroll,
                 so gating its contents on a second observer double-animates
                 and risks stranding rows at opacity 0 if IO never reports. */
              animate="show"
              className="group border-b border-carbon-700/50 transition-colors duration-micro ease-out-expo hover:bg-carbon-800/60"
            >
              <td className="py-1 pr-2 text-carbon-400">{i + 1}</td>
              <td className="py-1 pr-2 font-bold text-carbon-100">
                <span className="flex items-center gap-1.5">
                  {p.code}
                  {i === 0 && <Trophy size={11} className="text-sector-purple" />}
                </span>
              </td>
              <td className="py-1 pr-2 text-carbon-300">L{p.lap}</td>
              {hasStationary && (
                <>
                  <td className="py-1 pr-2 text-carbon-300">{p.pitIn}</td>
                  <td className="py-1 pr-2 text-carbon-300">{p.pitOut}</td>
                  <td className="py-1 pr-2 text-right text-carbon-300">{p.laneTime.toFixed(3)}s</td>
                </>
              )}
              {!hasStationary && (
                <td className="py-1 pr-2 text-carbon-300">{p.timeOfDay ?? "—"}</td>
              )}
              <td className="py-1 text-right">
                <span className="relative inline-block min-w-[72px]">
                  {/* Bar grows once on reveal; the number itself never
                      animates — it's data to read, not a gauge. */}
                  <motion.span
                    className="absolute inset-y-0 right-0 rounded-sm bg-f1red/15 group-hover:bg-f1red/25"
                    initial={forceVisible ? false : { width: 0 }}
                    animate={{ width: `${(metric(p) / slowest) * 100}%` }}
                    transition={{ duration: 0.45, ease: EASE.out, delay: rowDelay(i) }}
                  />
                  <span className={`relative pr-1 font-bold ${i === 0 ? "text-sector-purple" : "text-carbon-100"}`}>
                    {metric(p).toFixed(hasStationary ? 2 : 1)}s
                  </span>
                </span>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
