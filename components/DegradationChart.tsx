"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import ChartTooltip from "./ChartTooltip";
import { GRID, TICK, AXIS_LINE } from "@/lib/chartTheme";
import { formatLapTime } from "@/services/format";

const COMPOUND_HEX: Record<string, string> = {
  SOFT: "#FF3B30",
  MEDIUM: "#FFD644",
  HARD: "#E7EAF0",
  INTER: "#43D675",
  WET: "#3B9BFF",
};
const compoundColor = (c: string) => COMPOUND_HEX[c] ?? "#8B95A7";

/** Tyre degradation model: lap time vs stint age + deg slope per compound. */
export default function DegradationChart({ data }: { data: any }) {
  const { series, slopes } = data;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
      {/* Lap time vs stint lap */}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis
              dataKey="lap"
              tick={TICK}
              axisLine={AXIS_LINE} tickLine={false}
              label={{ value: "Stint lap", fill: "#5B6678", fontSize: 9.5, dy: 12 }}
            />
            <YAxis
              domain={["dataMin - 0.3", "dataMax + 0.3"]}
              tick={TICK}
              axisLine={false} tickLine={false} width={46}
              tickFormatter={(v: number) => (v >= 60 ? formatLapTime(v, 1) : v.toFixed(1))}
            />
            <Tooltip
              content={
                <ChartTooltip
                  formatter={(e: any) => ({ label: e.name, value: formatLapTime(e.value), color: e.stroke })}
                />
              }
            />
            <Legend
              iconType="plainline"
              formatter={(v) => <span className="text-[10px] uppercase tracking-wider text-carbon-300">{v}</span>}
            />
            {slopes.map(({ compound }: any) => (
              <Line
                key={compound} type="monotone" dataKey={compound} name={compound.toLowerCase()}
                stroke={compoundColor(compound)} strokeWidth={2} dot={false}
                connectNulls
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Degradation slope (s / lap) — a figure per compound, in the same
          row style as the rest of the page. Usually negative: the car gets
          lighter faster than the tyre gets slower. */}
      <div>
        <p className="eyebrow mb-2 border-b border-carbon-800 pb-1.5">Change per lap</p>
        <ul>
          {slopes.map((s: any) => (
            <li key={s.compound} className="flex items-center justify-between gap-3 py-[5px]">
              <span className="timing flex items-center gap-2 text-micro font-bold uppercase tracking-wider text-carbon-200">
                <span className="h-3 w-[3px]" style={{ background: compoundColor(s.compound) }} />
                {s.compound.toLowerCase()}
              </span>
              <span className="timing text-label font-bold text-carbon-100">
                {s.slope > 0 ? "+" : "−"}
                {Math.abs(s.slope).toFixed(3)}
                <span className="ml-1 text-micro font-medium text-carbon-500">s/lap</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-micro leading-relaxed text-carbon-500">
          Minus means laps got quicker as the stint went on: burning fuel gains more than the tyre loses.
        </p>
      </div>
    </div>
  );
}
