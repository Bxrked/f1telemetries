"use client";

import { Repeat, Ruler, Timer, Thermometer, Sun, CloudRain, Cloud, Wind, Droplets } from "lucide-react";

const WEATHER_ICON: Record<string, any> = { Clear: Sun, Cloudy: Cloud, Rain: CloudRain };

/** Session key metrics rail rendered beside the track map. */
export default function StatStrip({ session }: { session: any }) {
  const WeatherIcon = WEATHER_ICON[session.weather.condition] ?? Sun;

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
      {stats.map(({ icon: Icon, label, value, unit, sub }) => (
        <div
          key={label}
          className="group flex flex-1 items-center gap-3 rounded-lg border border-carbon-700 bg-carbon-900/60
            px-3.5 py-2.5 transition-colors duration-200 hover:border-f1red/50"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-carbon-800 text-carbon-300 transition-colors group-hover:text-f1red-bright">
            <Icon size={15} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">{label}</p>
            <p className="timing truncate text-base font-bold leading-tight text-carbon-100">
              {value}
              {unit && <span className="ml-1 text-xs font-medium text-carbon-400">{unit}</span>}
            </p>
            {sub && <p className="truncate text-[10px] text-carbon-400">{sub}</p>}
          </div>
        </div>
      ))}

      {/* Secondary weather line */}
      <div className="flex items-center justify-between rounded-lg border border-carbon-700 bg-carbon-900/60 px-3.5 py-2 text-[11px] text-carbon-300">
        <span className="flex items-center gap-1.5">
          <Droplets size={12} className="text-carbon-400" /> {session.weather.humidityPct}%
        </span>
        <span className="flex items-center gap-1.5">
          <Wind size={12} className="text-carbon-400" /> {session.weather.windKph} km/h
        </span>
        <span className="flex items-center gap-1.5">
          <CloudRain size={12} className="text-carbon-400" /> {session.weather.rainProbabilityPct}%
        </span>
      </div>
    </div>
  );
}
