"use client";

import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, LabelList,
} from "recharts";
import ChartTooltip from "./ChartTooltip";
import { GRID, TICK, TICK_CATEGORY, AXIS_LINE, CURSOR, BAR } from "@/lib/chartTheme";

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
          <CartesianGrid {...GRID} horizontal={false} />
          <XAxis
            type="number"
            domain={["dataMin - 1", "dataMax + 1"]}
            allowDecimals={false}
            tick={TICK}
            axisLine={AXIS_LINE} tickLine={false}
          />
          <YAxis
            type="category" dataKey="code" width={44}
            tick={TICK_CATEGORY}
            axisLine={false} tickLine={false}
          />
          {/* The zero line is the reference the whole chart is read against
              — brighter than the grid on purpose. */}
          <ReferenceLine x={0} stroke="#3A4356" strokeWidth={1.5} />
          <Tooltip
            cursor={CURSOR}
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
          <Bar dataKey="delta" radius={2} maxBarSize={BAR.maxSize} animationDuration={520} animationEasing="ease-out">
            {data.map((d) => (
              <Cell key={d.code} fill={barColor(d.delta)} fillOpacity={0.92} />
            ))}
            <LabelList
              dataKey="delta"
              position="right"
              formatter={(v: number) => (v > 0 ? `+${v}` : v === 0 ? "—" : `${v}`)}
              style={{ ...TICK, fill: "#8B95A7" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
