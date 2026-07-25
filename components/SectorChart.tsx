"use client";

import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import ChartTooltip from "./ChartTooltip";
import { formatLapTime, formatSector } from "@/services/format";

const SECTOR_HEX: Record<string, string> = {
  purple: "#B44CFF",
  green: "#2EE07C",
  yellow: "#FFD644",
};

/**
 * Sector Analysis — one chart PER sector, each with its own scale.
 * Sectors differ hugely between circuits (Spa's S2 is ~48s vs ~29s for
 * S1/S3), so a shared axis made short sectors unreadable stubs.
 * Colours follow FIA convention: purple = overall fastest,
 * green = within 0.150s, yellow = slower.
 */
export default function SectorChart({ data }: { data: any }) {
  const { rows, best, miniSectors } = data;
  const idealLap = best.s1 + best.s2 + best.s3;

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-3">
        {([1, 2, 3] as const).map((n) => {
          const key = `s${n}` as "s1" | "s2" | "s3";
          const classKey = `class${n}`;
          const fastest = best[key];
          return (
            <div key={key}>
              <p className="eyebrow mb-1 flex items-baseline justify-between">
                <span>Sector {n}</span>
                <span className="timing text-sector-purple">{fastest.toFixed(3)}s</span>
              </p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2430" vertical={false} />
                    <XAxis
                      dataKey="code"
                      interval={0}
                      tick={{ fill: "#8B95A7", fontSize: 9, fontFamily: "var(--font-timing)" }}
                      axisLine={{ stroke: "#2A3242" }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[
                        (min: number) => +(min - 0.35).toFixed(2),
                        (max: number) => +(max + 0.2).toFixed(2),
                      ]}
                      tick={{ fill: "#5B6678", fontSize: 9, fontFamily: "var(--font-timing)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => v.toFixed(1)}
                      width={44}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      content={
                        <ChartTooltip
                          formatter={(entry: any) => ({
                            label: `${entry.payload.code} · S${n}`,
                            value: formatSector(entry.value),
                            color: SECTOR_HEX[entry.payload[classKey]],
                          })}
                        />
                      }
                    />
                    <Bar dataKey={key} name={`Sector ${n}`} radius={[3, 3, 0, 0]} maxBarSize={22}>
                      {rows.map((row: any) => (
                        <Cell key={row.code} fill={SECTOR_HEX[row[classKey]]} fillOpacity={0.92} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend + theoretical best lap */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-carbon-700 bg-carbon-900/60 px-3 py-2">
        <div className="flex gap-4">
          {[
            ["purple", "Overall fastest"],
            ["green", "Personal best"],
            ["yellow", "Slower"],
          ].map(([key, label]) => (
            <span key={key} className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-carbon-300">
              <span className="h-2 w-2 rounded-sm" style={{ background: SECTOR_HEX[key] }} />
              {label}
            </span>
          ))}
        </div>
        <p className="timing text-[11px] text-carbon-300">
          Ideal lap{" "}
          <span className="font-bold text-sector-purple">{formatLapTime(idealLap)}</span>
        </p>
      </div>

      {/* Lap duel / mini-sector strip */}
      <div className="mt-3">
        <p className="eyebrow mb-1.5">
          {miniSectors.title ?? "Mini-sectors"} · {miniSectors.driverA} vs {miniSectors.driverB}
          {miniSectors.subtitle ? ` (${miniSectors.subtitle})` : " (fastest lap)"}
        </p>
        <div className="flex gap-[3px]">
          {miniSectors.splits.map((winner: string, i: number) => (
            <span
              key={i}
              title={`${i + 1}: ${winner === "EQ" ? "even" : winner === "A" ? miniSectors.driverA : miniSectors.driverB}`}
              className="h-3 flex-1 rounded-[2px] transition-transform duration-150 hover:scale-y-150"
              style={{
                background:
                  winner === "A" ? "#B44CFF" : winner === "B" ? "#2EE07C" : "#5B6678",
              }}
            />
          ))}
        </div>
        <div className="timing mt-1 flex justify-between text-[10px] text-carbon-400">
          <span><span className="text-sector-purple">■</span> {miniSectors.driverA}</span>
          <span>{miniSectors.subtitle ?? "18 micro-splits"}</span>
          <span><span className="text-sector-green">■</span> {miniSectors.driverB}</span>
        </div>
      </div>
    </div>
  );
}
