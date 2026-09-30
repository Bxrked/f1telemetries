"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import ChartTooltip from "./ChartTooltip";
import CountUp from "./CountUp";
import { EASE, rowDelay } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";
import { GRID, TICK, TICK_CATEGORY, AXIS_LINE, CURSOR, BAR, NEUTRAL } from "@/lib/chartTheme";

/** Field demographics: age histogram + per-team average ages. */
export default function DemographicsCard({ data }: { data: any }) {
  const { distribution, averageAge, teamAges, youngest, oldest } = data;
  const maxTeamAge = Math.max(...teamAges.map((t: any) => t.avgAge));
  const forceVisible = useForceVisible();

  return (
    <div>
      {/* Headline stats */}
      <div className="mb-4 grid grid-cols-3 divide-x divide-carbon-700 rounded-row border border-carbon-700 bg-carbon-900/60">
        {[
          { label: "Avg age", value: averageAge },
          { label: "Youngest", value: youngest },
          { label: "Oldest", value: oldest },
        ].map((s) => (
          <div key={s.label} className="px-3 py-2">
            <p className="eyebrow">{s.label}</p>
            <p className="timing mt-0.5 text-xl font-bold leading-tight text-carbon-100">
              {typeof s.value === "number" ? (
                <CountUp value={s.value} decimals={Number.isInteger(s.value) ? 0 : 1} />
              ) : (
                s.value
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Age histogram */}
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distribution} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
            <CartesianGrid {...GRID} vertical={false} />
            <XAxis dataKey="bin" tick={TICK_CATEGORY} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={CURSOR}
              content={
                <ChartTooltip
                  formatter={(e: any) => ({
                    label: `${e.payload.bin} yrs`,
                    value: `${e.value} drivers`,
                    color: NEUTRAL,
                  })}
                />
              }
            />
            {/* Neutral bars: age bins carry no team or status meaning, so
                painting them the brand red spends the accent on nothing and
                competes with the team colours below. Grey reads as "just a
                count"; the accent stays reserved for things that matter. */}
            <Bar dataKey="count" fill={NEUTRAL} fillOpacity={0.9} radius={BAR.radiusV} maxBarSize={30} animationDuration={520} animationEasing="ease-out" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Team average ages */}
      <p className="eyebrow mb-2 mt-3">Average age by team</p>
      <ul className="space-y-1.5">
        {teamAges.map((t: any, i: number) => (
          <li key={t.team} className="group flex items-center gap-2 text-data">
            <span className="w-28 truncate text-carbon-300 transition-colors duration-micro group-hover:text-carbon-100">{t.team}</span>
            <span className="relative h-1.5 flex-1 overflow-hidden bg-carbon-800">
              <motion.span
                className="absolute inset-y-0 left-0 origin-left group-hover:brightness-125"
                style={{ width: `${(t.avgAge / maxTeamAge) * 100}%`, background: t.color }}
                initial={forceVisible ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: EASE.out, delay: rowDelay(i) }}
              />
            </span>
            <span className="timing w-9 text-right font-bold text-carbon-100">{t.avgAge}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
