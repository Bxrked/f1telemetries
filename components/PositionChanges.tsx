"use client";

import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, LabelList,
} from "recharts";
import ChartTooltip from "./ChartTooltip";

/**
 * Grid → flag delta. Horizontal diverging bars:
 * green = positions gained, red = positions lost, grey = held.
 */
export default function PositionChanges({ data }: { data: any[] }) {
  const barColor = (delta: number) =>
    delta > 0 ? "#2EE07C" : delta < 0 ? "#FF1E00" : "#5B6678";

  const height = Math.max(300, data.length * 26 + 30);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 26, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2430" horizontal={false} />
          <XAxis
            type="number"
            domain={["dataMin - 1", "dataMax + 1"]}
            allowDecimals={false}
            tick={{ fill: "#5B6678", fontSize: 10, fontFamily: "var(--font-timing)" }}
            axisLine={{ stroke: "#2A3242" }} tickLine={false}
          />
          <YAxis
            type="category" dataKey="code" width={44}
            tick={{ fill: "#8B95A7", fontSize: 11, fontFamily: "var(--font-timing)", fontWeight: 700 }}
            axisLine={false} tickLine={false}
          />
          <ReferenceLine x={0} stroke="#2A3242" strokeWidth={1.5} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={
              <ChartTooltip
                formatter={(e: any) => ({
                  label: `${e.payload.name} · P${e.payload.grid} → P${e.payload.finish}`,
                  value: e.value > 0 ? `+${e.value}` : `${e.value}`,
                  color: barColor(e.value),
                })}
              />
            }
          />
          <Bar dataKey="delta" radius={3} maxBarSize={14}>
            {data.map((d) => (
              <Cell key={d.code} fill={barColor(d.delta)} fillOpacity={0.9} />
            ))}
            <LabelList
              dataKey="delta"
              position="right"
              formatter={(v: number) => (v > 0 ? `+${v}` : v === 0 ? "—" : `${v}`)}
              style={{ fill: "#8B95A7", fontSize: 10, fontFamily: "var(--font-timing)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
