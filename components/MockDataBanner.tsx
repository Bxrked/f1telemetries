"use client";

import { AlertTriangle } from "lucide-react";

const FEED_LABELS: Record<string, string> = {
  schedule: "race calendar",
  standings: "championship standings",
  session: "session info & weather",
  drivers: "results",
  positions: "position changes",
  demographics: "driver demographics",
  sectors: "sector analysis",
  stints: "tyre strategy",
  pits: "pit stops",
  degradation: "tyre degradation",
  performance: "speed traps & pace",
  worm: "position worm",
  trackOutline: "circuit map",
  compare: "head-to-head",
  events: "replay events",
  radio: "team radio",
};

/**
 * Degraded-state warning.
 *  - mode "mock":    everything fell back — full-width alarm.
 *  - mode "partial": SOME feeds fell back while others are live. This is
 *    the dangerous case: the page header can say "Belgian GP" while a
 *    panel quietly shows demo data from another circuit, so we name
 *    exactly which sections are not real.
 */
export default function MockDataBanner({ feed, only }: { feed?: any; only?: string[] }) {
  /* No alarm while feeds are still resolving (mode "loading" or zero
     feeds reported yet) — only warn about ACTUAL fallbacks. */
  if (!feed || feed.mode === "live" || feed.mode === "loading" || !feed.total) return null;

  const stale = Object.entries(feed.detail ?? {})
    .filter(([k, v]) => v === "mock" && (!only || only.includes(k)))
    .map(([k]) => FEED_LABELS[k] ?? k);

  if (only && !stale.length) return null; // nothing THIS page shows is stale

  const full = feed.mode === "mock";

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-sector-yellow/50 bg-sector-yellow/10 px-4 py-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-sector-yellow" />
      <div>
        <p className="timing text-xs font-bold uppercase tracking-wider text-sector-yellow">
          {full
            ? "Live data unavailable — showing demo data"
            : `Some live data unavailable — ${stale.length} section${stale.length === 1 ? "" : "s"} showing demo data`}
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-carbon-300">
          {full ? (
            <>
              The live F1 data services (Jolpica / OpenF1) couldn&apos;t be reached, so this page is
              showing a built-in demo. Results, standings and times below are NOT real.
            </>
          ) : (
            <>
              These sections could not load live data and are showing built-in demo values from a
              different race — they do NOT describe the event named above:{" "}
              <span className="font-bold text-carbon-100">{stale.join(", ")}</span>. Panels marked{" "}
              <span className="timing rounded border border-sector-yellow/50 px-1 text-[9px] font-bold uppercase text-sector-yellow">
                demo data
              </span>{" "}
              are affected. Everything else is live.
            </>
          )}{" "}
          The site recovers automatically once the service responds again.
        </p>
      </div>
    </div>
  );
}
