"use client";

import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import ChartTooltip from "./ChartTooltip";
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
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2430" />
            <XAxis
              dataKey="lap"
              tick={{ fill: "#5B6678", fontSize: 10, fontFamily: "var(--font-timing)" }}
              axisLine={{ stroke: "#2A3242" }} tickLine={false}
              label={{ value: "Stint lap", fill: "#5B6678", fontSize: 10, dy: 12 }}
            />
            <YAxis
              domain={["dataMin - 0.3", "dataMax + 0.3"]}
              tick={{ fill: "#5B6678", fontSize: 9, fontFamily: "var(--font-timing)" }}
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

      {/* Degradation slope (s / lap) */}
      <div>
        <p className="eyebrow mb-1">Deg slope · s/lap</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={slopes} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2430" vertical={false} />
              <XAxis
                dataKey="compound"
                tick={{ fill: "#8B95A7", fontSize: 9, fontFamily: "var(--font-timing)" }}
                axisLine={{ stroke: "#2A3242" }} tickLine={false}
                tickFormatter={(v) => v.slice(0, 3)}
              />
              <YAxis
                tick={{ fill: "#5B6678", fontSize: 9, fontFamily: "var(--font-timing)" }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                content={
                  <ChartTooltip
                    formatter={(e: any) => ({
                      label: e.payload.compound.toLowerCase(),
                      value: `${e.value.toFixed(3)} s/lap`,
                      color: compoundColor(e.payload.compound),
                    })}
                  />
                }
              />
              <Bar dataKey="slope" radius={[3, 3, 0, 0]} maxBarSize={26}>
                {slopes.map((s: any) => (
                  <Cell key={s.compound} fill={compoundColor(s.compound)} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
