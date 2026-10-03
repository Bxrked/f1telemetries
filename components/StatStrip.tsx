"use client";

import { motion } from "framer-motion";
import { rowReveal, EASE, rowDelay } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";
import CountUp from "./CountUp";

const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Thin instrument gauge under a reading — only for values with a real scale. */
function Gauge({ pct, i, tone = "bg-carbon-300" }: { pct: number; i: number; tone?: string }) {
  const forceVisible = useForceVisible();
  return (
    <span className="mt-1.5 block h-[3px] w-full overflow-hidden bg-carbon-800">
      <motion.span
        className={`block h-full origin-left ${tone}`}
        initial={forceVisible ? false : { scaleX: 0 }}
        animate={{ scaleX: Math.max(0, Math.min(1, pct)) }}
        transition={{ duration: 0.8, ease: EASE.out, delay: 0.25 + rowDelay(i) }}
      />
    </span>
  );
}

/**
 * Session key metrics, set as a timing sheet: label left, reading right,
 * hairline between rows. Rows share the column's height evenly, so the
 * sheet fills the hero band instead of leaving a void under five cards.
 *
 * Readings count up once on arrival — these are headline figures read
 * one at a time, not a column compared line by line.
 */
export default function StatStrip({ session }: { session: any }) {
  const forceVisible = useForceVisible();
  const w = session.weather ?? {};
  const laps = num(session.totalLaps);
  const km = num(session.trackLengthKm);
  const distance = laps && km ? laps * km : null;

  const rows: { label: string; value: React.ReactNode; unit?: string; gauge?: { pct: number; tone?: string } }[] = [
    { label: "Race laps", value: laps != null ? <CountUp value={laps} /> : "—" },
    { label: "Lap length", value: km != null ? <CountUp value={km} decimals={3} /> : "—", unit: km != null ? "km" : "" },
    /* Derived, not fetched: laps × length is the race distance. */
    { label: "Race distance", value: distance != null ? <CountUp value={distance} decimals={1} /> : "—", unit: distance != null ? "km" : "" },
    {
      label: "Track temp",
      value: num(w.trackTempC) != null ? <CountUp value={w.trackTempC} decimals={Number.isInteger(w.trackTempC) ? 0 : 1} /> : "—",
      unit: "°C",
      /* 0–60 °C covers every dry race on the calendar. */
      gauge: num(w.trackTempC) != null ? { pct: w.trackTempC / 60, tone: "bg-f1red" } : undefined,
    },
    {
      label: "Air temp",
      value: num(w.airTempC) != null ? <CountUp value={w.airTempC} decimals={Number.isInteger(w.airTempC) ? 0 : 1} /> : "—",
      unit: "°C",
    },
    {
      label: "Humidity",
      value: num(w.humidityPct) != null ? <CountUp value={w.humidityPct} /> : "—",
      unit: "%",
      gauge: num(w.humidityPct) != null ? { pct: w.humidityPct / 100 } : undefined,
    },
    { label: "Wind", value: num(w.windKph) != null ? <CountUp value={w.windKph} /> : "—", unit: "km/h" },
    {
      label: "Rain risk",
      value: num(w.rainProbabilityPct) != null ? <CountUp value={w.rainProbabilityPct} /> : "—",
      unit: "%",
      gauge: num(w.rainProbabilityPct) != null ? { pct: w.rainProbabilityPct / 100, tone: "bg-tyre-wet" } : undefined,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Lead reading: the lap record is the one number with a story. */}
      <motion.div
        custom={0}
        variants={rowReveal}
        initial={forceVisible ? false : "hidden"}
        animate="show"
        className="mb-1 border-b border-carbon-700 pb-3"
      >
        <p className="eyebrow">Lap record</p>
        <p className="timing mt-1 text-3xl font-bold leading-none tracking-tight text-sector-purple">
          {session.lapRecord?.time ?? "—"}
        </p>
        <p className="timing mt-1.5 text-data text-carbon-400">
          {[session.lapRecord?.driver, session.lapRecord?.year].filter(Boolean).join(" · ") || "No record on file"}
        </p>
      </motion.div>

      <dl className="flex flex-1 flex-col divide-y divide-carbon-700/60">
        {rows.map((r, i) => (
          <motion.div
            key={r.label}
            custom={i + 1}
            variants={rowReveal}
            initial={forceVisible ? false : "hidden"}
            animate="show"
            className="group flex min-h-[40px] flex-1 flex-col justify-center py-1.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <dt className="eyebrow">{r.label}</dt>
              <dd className="timing text-lg font-bold leading-none text-carbon-100">
                {r.value}
                {r.unit && <span className="ml-1 text-label font-medium text-carbon-400">{r.unit}</span>}
              </dd>
            </div>
            {r.gauge && <Gauge pct={r.gauge.pct} tone={r.gauge.tone} i={i} />}
          </motion.div>
        ))}
      </dl>

      <p className="timing mt-2 border-t border-carbon-700 pt-2 text-micro uppercase tracking-wider text-carbon-400">
        Conditions · <span className="text-carbon-100">{w.condition ?? "—"}</span>
      </p>
    </div>
  );
}
