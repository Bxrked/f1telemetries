"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Users } from "lucide-react";
import ChartTooltip from "./ChartTooltip";
import { GRID, TICK, TICK_CATEGORY, AXIS_LINE, CURSOR, BAR, NEUTRAL } from "@/lib/chartTheme";

/** Field demographics: age histogram + per-team average ages. */
export default function DemographicsCard({ data }: { data: any }) {
  const { distribution, averageAge, teamAges, youngest, oldest } = data;
  const maxTeamAge = Math.max(...teamAges.map((t: any) => t.avgAge));

  return (
    <div>
      {/* Headline stats */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: "Avg field age", value: averageAge },
          { label: "Youngest", value: youngest },
          { label: "Oldest", value: oldest },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-carbon-700 bg-carbon-900/60 px-3 py-2 text-center">
            <p className="timing text-xl font-bold text-carbon-100">{s.value}</p>
            <p className="eyebrow">{s.label}</p>
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
      <p className="eyebrow mb-2 mt-3 flex items-center gap-1.5">
        <Users size={11} /> Average age by team
      </p>
      <ul className="space-y-1.5">
        {teamAges.map((t: any) => (
          <li key={t.team} className="group flex items-center gap-2 text-[11px]">
            <span className="w-28 truncate text-carbon-300">{t.team}</span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-carbon-800">
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 group-hover:brightness-125"
                style={{ width: `${(t.avgAge / maxTeamAge) * 100}%`, background: t.color }}
              />
            </span>
            <span className="timing w-9 text-right font-bold text-carbon-100">{t.avgAge}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
