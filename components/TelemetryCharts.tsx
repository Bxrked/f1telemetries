"use client";

import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Gauge, TimerReset } from "lucide-react";
import ChartTooltip from "./ChartTooltip";
import { formatClock } from "@/services/format";

const paceLabel = (s: number) => formatClock(s, 2);

/** Vmax speed trap + average race pace, coloured by team livery. */
export default function TelemetryCharts({ data }: { data: any }) {
  const { vmax, pace } = data;
  const chartHeight = (n: number) => Math.max(288, n * 22 + 30);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Speed trap */}
      <div>
        <p className="eyebrow mb-2 flex items-center gap-1.5">
          <Gauge size={11} /> Vmax speed trap (km/h)
        </p>
        <div style={{ height: chartHeight(vmax.length) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vmax} layout="vertical" margin={{ top: 0, right: 36, left: -6, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2430" horizontal={false} />
              <XAxis
                type="number" domain={["dataMin - 5", "dataMax + 3"]}
                tick={{ fill: "#5B6678", fontSize: 10, fontFamily: "var(--font-timing)" }}
                axisLine={{ stroke: "#2A3242" }} tickLine={false}
              />
              <YAxis
                type="category" dataKey="code" width={42} interval={0}
                tick={{ fill: "#8B95A7", fontSize: 9, fontFamily: "var(--font-timing)", fontWeight: 700 }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                content={
                  <ChartTooltip
                    formatter={(e: any) => ({
                      label: e.payload.name,
                      value: `${e.value.toFixed(1)} km/h`,
                      color: e.payload.teamColor,
                    })}
                  />
                }
              />
              <Bar dataKey="vmax" radius={[0, 3, 3, 0]} maxBarSize={12}>
                {vmax.map((d: any) => (
                  <Cell key={d.code} fill={d.teamColor} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Average race pace */}
      <div>
        <p className="eyebrow mb-2 flex items-center gap-1.5">
          <TimerReset size={11} /> Average racing pace (min:sec / lap)
        </p>
        <div style={{ height: chartHeight(pace.length) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pace} layout="vertical" margin={{ top: 0, right: 36, left: -6, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2430" horizontal={false} />
              <XAxis
                type="number" domain={["dataMin - 0.5", "dataMax + 0.5"]}
                tickFormatter={(v) => paceLabel(v)}
                tick={{ fill: "#5B6678", fontSize: 10, fontFamily: "var(--font-timing)" }}
                axisLine={{ stroke: "#2A3242" }} tickLine={false}
              />
              <YAxis
                type="category" dataKey="code" width={42} interval={0}
                tick={{ fill: "#8B95A7", fontSize: 9, fontFamily: "var(--font-timing)", fontWeight: 700 }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                content={
                  <ChartTooltip
                    formatter={(e: any) => ({
                      label: e.payload.name,
                      value: paceLabel(e.value),
                      color: e.payload.teamColor,
                    })}
                  />
                }
              />
              <Bar dataKey="avgPace" radius={[0, 3, 3, 0]} maxBarSize={12}>
                {pace.map((d: any) => (
                  <Cell key={d.code} fill={d.teamColor} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
