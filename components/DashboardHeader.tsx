"use client";

import { Activity, MapPin, CalendarDays } from "lucide-react";

const FEED_STYLE: Record<string, { label: string; cls: string }> = {
  loading: { label: "SYNCING…", cls: "text-carbon-300" },
  live: { label: "LIVE DATA", cls: "text-sector-green" },
  partial: { label: "PARTIAL LIVE", cls: "text-sector-yellow" },
  mock: { label: "MOCK / OFFLINE FALLBACK", cls: "text-carbon-300" },
};

export default function DashboardHeader({ session, feed }: { session: any; feed?: any }) {
  const f = FEED_STYLE[feed?.mode ?? "mock"];
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-carbon-700 pb-5">
      <div>
        <p className="eyebrow mb-1 flex items-center gap-2">
          <span className="inline-block h-2 w-2 animate-pulse-dot rounded-full bg-f1red-bright" />
          Race telemetry · Round {session.round} / {session.season}
        </p>
        <h1 className="font-display text-4xl font-black uppercase italic tracking-tight sm:text-5xl">
          <span className="text-f1red-bright">{session.meetingName.split(" ")[0]}</span>{" "}
          {session.meetingName.split(" ").slice(1).join(" ")}
        </h1>
        <p className="mt-1 flex items-center gap-4 text-xs text-carbon-300">
          <span className="flex items-center gap-1.5">
            <MapPin size={12} /> {session.circuitName} — {session.location}
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarDays size={12} /> {session.sessionType}
          </span>
        </p>
      </div>
      <div className="timing flex items-center gap-2 rounded-lg border border-carbon-700 bg-carbon-850 px-3 py-2 text-xs text-carbon-300">
        <Activity size={14} className={f.cls} />
        Data feed: <span className={`font-bold ${f.cls}`}>{f.label}</span>
        {feed?.mode === "partial" && (
          <span className="text-carbon-400">({feed.live}/{feed.total} feeds)</span>
        )}
      </div>
    </header>
  );
}
