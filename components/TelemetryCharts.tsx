"use client";

import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Gauge, TimerReset } from "lucide-react";
import ChartTooltip from "./ChartTooltip";
import { formatClock } from "@/services/format";
import { GRID, TICK, TICK_CATEGORY, AXIS_LINE, CURSOR, BAR, SECTOR } from "@/lib/chartTheme";

/** FIA session-best purple. */
const SECTOR_PURPLE = "#B44CFF";

/**
 * Driver-code tick that turns FIA purple for the session best.
 *
 * Deliberately a TEXT tick rather than a stroke on the bar: recharts draws
 * bar shapes through its animation pipeline, so a bar-level marker isn't
 * present until that runs. The axis label is always in the DOM, so the
 * "who was fastest" signal can never be lost to an animation not firing.
 */
function BestTick({ x, y, payload, bestCode }: any) {
  const isBest = payload?.value === bestCode;
  return (
    <text
      x={x}
      y={y}
      dy={3}
      textAnchor="end"
      fill={isBest ? SECTOR_PURPLE : TICK_CATEGORY.fill}
      fontSize={TICK_CATEGORY.fontSize}
      fontFamily={TICK_CATEGORY.fontFamily}
      fontWeight={700}
    >
      {payload?.value}
    </text>
  );
}

const paceLabel = (s: number) => formatClock(s, 2);

/** Vmax speed trap + average race pace, coloured by team livery. */
export default function TelemetryCharts({ data }: { data: any }) {
  const { vmax, pace } = data;
  /* Both arrays arrive pre-sorted best-first from the service. */
  const bestVmax = vmax[0]?.code;
  const bestPace = pace[0]?.code;
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
              <CartesianGrid {...GRID} horizontal={false} />
              <XAxis
                type="number" domain={["dataMin - 5", "dataMax + 3"]}
                tick={TICK}
                axisLine={AXIS_LINE} tickLine={false}
              />
              <YAxis
                type="category" dataKey="code" width={42} interval={0}
                tick={<BestTick bestCode={bestVmax} />}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                cursor={CURSOR}
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
              {/* Session best gets the FIA purple outline — the fastest
                  trap of the race should be identifiable at a glance, not
                  just "the longest bar". Team colour stays the fill so the
                  livery reading is preserved. */}
              <Bar dataKey="vmax" radius={BAR.radiusH} maxBarSize={BAR.maxSize} animationDuration={520} animationEasing="ease-out">
                {vmax.map((d: any, i: number) => (
                  <Cell
                    key={d.code}
                    fill={d.teamColor}
                    fillOpacity={0.92}
                    stroke={i === 0 ? SECTOR_PURPLE : undefined}
                    strokeWidth={i === 0 ? 1.5 : 0}
                  />
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
              <CartesianGrid {...GRID} horizontal={false} />
              <XAxis
                type="number" domain={["dataMin - 0.5", "dataMax + 0.5"]}
                tickFormatter={(v) => paceLabel(v)}
                tick={TICK}
                axisLine={AXIS_LINE} tickLine={false}
              />
              <YAxis
                type="category" dataKey="code" width={42} interval={0}
                tick={<BestTick bestCode={bestPace} />}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                cursor={CURSOR}
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
              <Bar dataKey="avgPace" radius={BAR.radiusH} maxBarSize={BAR.maxSize} animationDuration={520} animationEasing="ease-out">
                {pace.map((d: any, i: number) => (
                  <Cell
                    key={d.code}
                    fill={d.teamColor}
                    fillOpacity={0.92}
                    stroke={i === 0 ? SECTOR_PURPLE : undefined}
                    strokeWidth={i === 0 ? 1.5 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
