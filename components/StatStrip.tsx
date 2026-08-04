"use client";

import { motion } from "framer-motion";
import { Repeat, Ruler, Timer, Thermometer, Sun, CloudRain, Cloud, Wind, Droplets } from "lucide-react";
import { rowReveal } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";

const WEATHER_ICON: Record<string, any> = { Clear: Sun, Cloudy: Cloud, Rain: CloudRain };

/** Session key metrics rail rendered beside the track map. */
export default function StatStrip({ session }: { session: any }) {
  const WeatherIcon = WEATHER_ICON[session.weather.condition] ?? Sun;
  const forceVisible = useForceVisible();

  const stats = [
    { icon: Repeat, label: "Total laps", value: session.totalLaps, unit: "" },
    { icon: Ruler, label: "Track length", value: session.trackLengthKm ? session.trackLengthKm.toFixed(3) : "—", unit: session.trackLengthKm ? "km" : "" },
    {
      icon: Timer,
      label: "Lap record",
      value: session.lapRecord.time,
      unit: "",
      sub: [session.lapRecord.driver, session.lapRecord.year].filter(Boolean).join(" · "),
    },
    { icon: Thermometer, label: "Track temp", value: session.weather.trackTempC, unit: "°C" },
    {
      icon: WeatherIcon,
      label: "Conditions",
      value: session.weather.condition,
      unit: "",
      sub: `Air ${session.weather.airTempC}°C`,
    },
  ];

  return (
    <div className="flex h-full flex-col gap-2.5">
      {stats.map(({ icon: Icon, label, value, unit, sub }, i) => (
        <motion.div
          key={label}
          custom={i}
          variants={rowReveal}
          initial={forceVisible ? false : "hidden"}
          animate="show"
          className="group relative flex flex-1 items-center gap-3 overflow-hidden rounded-row border border-carbon-700
            bg-carbon-900/60 px-3.5 py-2.5 transition-colors duration-micro ease-out-expo hover:border-f1red/50"
        >
          {/* Left rule picks up the accent on hover — same pit-board language
              as the Panel notch, at row scale. */}
          <span className="absolute inset-y-0 left-0 w-[2px] bg-f1red opacity-0 transition-opacity duration-micro group-hover:opacity-100" />
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-row bg-carbon-800 text-carbon-300 transition-colors duration-micro group-hover:bg-f1red/15 group-hover:text-f1red-bright">
            <Icon size={15} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">{label}</p>
            {/* Values are read, not watched — tabular figures, no animation. */}
            <p className="timing truncate text-base font-bold leading-tight tabular-nums text-carbon-100">
              {value}
              {unit && <span className="ml-1 text-label font-medium text-carbon-400">{unit}</span>}
            </p>
            {sub && <p className="truncate text-micro text-carbon-400">{sub}</p>}
          </div>
        </motion.div>
      ))}

      {/* Secondary weather line */}
      <motion.div
        custom={stats.length}
        variants={rowReveal}
        initial={forceVisible ? false : "hidden"}
        animate="show"
        className="flex items-center justify-between rounded-row border border-carbon-700 bg-carbon-900/60 px-3.5 py-2 text-data tabular-nums text-carbon-300"
      >
        <span className="flex items-center gap-1.5">
          <Droplets size={12} className="text-carbon-400" /> {session.weather.humidityPct}%
        </span>
        <span className="flex items-center gap-1.5">
          <Wind size={12} className="text-carbon-400" /> {session.weather.windKph} km/h
        </span>
        <span className="flex items-center gap-1.5">
          <CloudRain size={12} className="text-carbon-400" /> {session.weather.rainProbabilityPct}%
        </span>
      </motion.div>
    </div>
  );
}
