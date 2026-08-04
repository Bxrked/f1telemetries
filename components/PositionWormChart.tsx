"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ResponsiveContainer } from "recharts";
import { GRID, TICK, AXIS_LINE } from "@/lib/chartTheme";

/**
 * Neutralisation windows derived from race control text.
 *
 * The worm has unexplained cliffs where the whole field bunches — those
 * are safety cars, and without them shaded the chart reads as noise.
 * Derived from the radio feed that's already fetched, so this costs no
 * extra request.
 *
 * "DEPLOYED" opens a window; "ENDING" or "IN THIS LAP" closes it. Both
 * ends of the pair contain the words "SAFETY CAR", so matching on that
 * alone would treat every message as a start.
 */
function neutralisations(messages: any[]) {
  const out: { from: number; to: number | null; kind: "sc" | "vsc" }[] = [];
  let open: { from: number; kind: "sc" | "vsc" } | null = null;

  for (const m of messages ?? []) {
    if (m?.kind !== "control" || typeof m.lap !== "number") continue;
    const text = (m.message ?? "").toUpperCase();
    /* Race control writes the abbreviation, not the words: real messages
       are "VSC DEPLOYED" / "VSC ENDING". Matching only the spelled-out
       form silently found nothing. */
    const isVsc = text.includes("VIRTUAL SAFETY CAR") || /\bVSC\b/.test(text);
    const isSc = isVsc || text.includes("SAFETY CAR");
    if (!isSc) continue;

    if (text.includes("DEPLOYED")) {
      if (!open) open = { from: m.lap, kind: isVsc ? "vsc" : "sc" };
    } else if (open && (text.includes("ENDING") || text.includes("IN THIS LAP"))) {
      out.push({ ...open, to: m.lap });
      open = null;
    }
  }
  /* Still open at the flag — run it to the end of the race. */
  if (open) out.push({ ...open, to: null });
  return out;
}

/** Custom tooltip: the full running order at the hovered lap, sorted. */
function WormTooltip({ active, payload, label, colorFor }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => a.value - b.value);
  return (
    <div className="max-h-72 overflow-hidden rounded-lg border border-carbon-600 bg-carbon-900/95 px-3 py-2 shadow-panel backdrop-blur">
      <p className="eyebrow mb-1.5">Lap {label}</p>
      <ul className="grid grid-flow-col grid-rows-[repeat(11,minmax(0,1fr))] gap-x-4 gap-y-0.5">
        {sorted.map((e) => (
          <li key={e.dataKey} className="timing flex items-center gap-1.5 text-[10px]">
            <span className="w-4 text-right text-carbon-400">{e.value}</span>
            <span className="h-2 w-2 rounded-[2px]" style={{ background: colorFor(e.dataKey) }} />
            <span className="font-bold text-carbon-100">{e.dataKey}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Position worm — every driver's track position lap by lap.
 * Overtakes are line crossings; pit cycles are the dips. Click a driver
 * chip to isolate their race; click again (or All) to reset.
 */
export default function PositionWormChart({ data, messages }: { data: any; messages?: any[] }) {
  const { rows, legend, maxLap } = data;
  const [focus, setFocus] = useState<string | null>(null);
  const scWindows = useMemo(() => neutralisations(messages ?? []), [messages]);

  const colorFor = useMemo(() => {
    const map: Record<string, string> = {};
    legend.forEach((d: any) => (map[d.code] = d.teamColor));
    return (code: string) => map[code] ?? "#8B95A7";
  }, [legend]);

  const fieldSize = legend.length;

  return (
    <div>
      {/* Driver focus chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => setFocus(null)}
          className={`timing rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition
            ${focus === null ? "bg-f1red text-white" : "border border-carbon-700 text-carbon-400 hover:text-carbon-100"}`}
        >
          All
        </button>
        {legend.map((d: any) => (
          <button
            key={d.code}
            onClick={() => setFocus((f) => (f === d.code ? null : d.code))}
            title={d.name}
            className={`timing flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold transition
              ${focus === d.code
                ? "border-carbon-400 bg-carbon-800 text-carbon-100"
                : "border-carbon-700 text-carbon-400 hover:text-carbon-100"}`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.teamColor }} />
            {d.code}
          </button>
        ))}
      </div>

      <div className="h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 10, left: -24, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis
              dataKey="lap"
              tick={TICK}
              axisLine={AXIS_LINE}
              tickLine={false}
              label={{ value: "Lap", fill: "#5B6678", fontSize: 9.5, dy: 12 }}
            />
            <YAxis
              reversed
              domain={[1, fieldSize]}
              ticks={[1, 5, 10, 15, fieldSize].filter((v, i, a) => a.indexOf(v) === i && v <= fieldSize)}
              allowDecimals={false}
              tick={TICK}
              axisLine={false}
              tickLine={false}
            />
            {/* Neutralisation bands sit behind the lines so the field
                bunching has a visible cause. Yellow reads as caution
                without competing with team colours. */}
            {scWindows.map((n, i) => (
              <ReferenceArea
                key={`${n.from}-${i}`}
                x1={n.from}
                x2={n.to ?? maxLap}
                fill="#FFD644"
                fillOpacity={n.kind === "vsc" ? 0.05 : 0.09}
                stroke="#FFD644"
                strokeOpacity={0.25}
                strokeDasharray="3 3"
                label={{
                  value: n.kind === "vsc" ? "VSC" : "SC",
                  position: "insideTop",
                  fill: "#FFD644",
                  fontSize: 9,
                  fontFamily: "var(--font-timing)",
                }}
              />
            ))}
            <Tooltip content={<WormTooltip colorFor={colorFor} />} />
            {legend.map((d: any) => {
              const dimmed = focus !== null && focus !== d.code;
              return (
                <Line
                  key={d.code}
                  type="stepAfter"
                  dataKey={d.code}
                  stroke={d.teamColor}
                  strokeWidth={focus === d.code ? 2.5 : 1.5}
                  strokeOpacity={dimmed ? 0.12 : 0.95}
                  dot={false}
                  activeDot={dimmed ? false : { r: 3, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="timing mt-1 text-right text-[10px] text-carbon-400">
        {fieldSize} drivers · {maxLap} laps · lines end where drivers retired
      </p>
    </div>
  );
}
