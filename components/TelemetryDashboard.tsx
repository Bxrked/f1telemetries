"use client";

import { useEffect, useState } from "react";
import { GitCompareArrows, Timer, CircleDashed, Wrench, TrendingDown, Users, Gauge, Map, CalendarRange, Trophy, Route } from "lucide-react";

import {
  getSessionInfo,
  getSectorAnalysis,
  getTyreStints,
  getPitStops,
  getDegradation,
  getPositionChanges,
  getDemographics,
  getPerformanceMetrics,
  getSeasonSchedule,
  getStandings,
  getFeedStatus,
  getTrackOutline,
  getPositionWorm,
} from "@/services/f1Service";

import DashboardHeader from "./DashboardHeader";
import Panel from "./Panel";
import TrackMap from "./TrackMap";
import StatStrip from "./StatStrip";
import SectorChart from "./SectorChart";
import TyreStintTimeline from "./TyreStintTimeline";
import PitStopTable from "./PitStopTable";
import DegradationChart from "./DegradationChart";
import PositionChanges from "./PositionChanges";
import DemographicsCard from "./DemographicsCard";
import TelemetryCharts from "./TelemetryCharts";
import ScheduleStrip from "./ScheduleStrip";
import StandingsPanel from "./StandingsPanel";
import PositionWormChart from "./PositionWormChart";
import MockDataBanner from "./MockDataBanner";

interface DashboardData {
  session: any;
  sectors: any;
  stints: any[];
  pitStops: any[];
  degradation: any;
  positions: any[];
  demographics: any;
  performance: any;
  schedule: any;
  standings: any;
  trackOutline: any;
  worm: any;
  feed: any;
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 2xl:max-w-[1440px]">
      <div className="mb-6 h-20 animate-pulse rounded-xl bg-carbon-850" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-[420px] animate-pulse rounded-xl bg-carbon-850 lg:col-span-2" />
        <div className="h-[420px] animate-pulse rounded-xl bg-carbon-850" />
      </div>
      <p className="timing mt-6 text-center text-xs text-carbon-400">
        Synchronising timing feed…
      </p>
    </div>
  );
}

type FeedData = { [K in keyof DashboardData]?: DashboardData[K] };

function PanelLoading({ h = 200 }: { h?: number }) {
  return (
    <div className="flex items-center justify-center rounded-lg bg-carbon-900/40" style={{ height: h }}>
      <span className="timing flex items-center gap-2 text-xs text-carbon-400">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-carbon-600 border-t-f1red" />
        loading…
      </span>
    </div>
  );
}

export default function TelemetryDashboard() {
  /* Progressive load: each feed lands independently and its panel renders
     the moment its data is ready, rather than blocking on the slowest
     (the heavy all-laps fetch behind sectors/degradation/pace/worm). */
  const [d, setD] = useState<FeedData>({});
  const [feed, setFeed] = useState<any>({ mode: "loading", live: 0, total: 0, detail: {} });

  useEffect(() => {
    let cancelled = false;
    const set = (patch: FeedData) => {
      if (cancelled) return;
      setD((prev) => ({ ...prev, ...patch }));
      setFeed(getFeedStatus());
    };
    /* Fire all feeds; attach each independently so fast ones paint first.
       The rate limiter (apiClient) paces the underlying requests. */
    const run = (key: keyof DashboardData, p: Promise<any>) =>
      p.then((v) => set({ [key]: v } as FeedData)).catch(() => set({ [key]: undefined } as FeedData));

    // Order matters only for perceived speed: cheap Jolpica feeds first.
    run("schedule", getSeasonSchedule());
    run("session", getSessionInfo());
    run("standings", getStandings());
    run("positions", getPositionChanges());
    run("demographics", getDemographics());
    run("stints", getTyreStints());
    run("pitStops", getPitStops());
    run("trackOutline", getTrackOutline());
    run("sectors", getSectorAnalysis());
    run("performance", getPerformanceMetrics());
    run("degradation", getDegradation());
    run("worm", getPositionWorm());

    return () => { cancelled = true; };
  }, []);

  // The header needs session + schedule; show a light skeleton until then.
  if (!d.session || !d.schedule) return <Skeleton />;
  const data = { ...d, feed } as DashboardData & { feed: any };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 2xl:max-w-[1440px]">
      <DashboardHeader session={data.session} feed={data.feed} />

      <MockDataBanner
        feed={data.feed}
        only={["schedule","session","standings","positions","demographics","stints","pits","degradation","performance","sectors","worm","trackOutline"]}
      />

      {/* ── Season calendar + next-race countdown ────────────────── */}
      <div className="mb-4">
        <Panel
          eyebrow={`Season ${data.schedule.season}`}
          title="Race Calendar"
          feed={data.feed.detail?.schedule}
          action={<CalendarRange size={16} className="mt-1 text-carbon-400" />}
        >
          <ScheduleStrip schedule={data.schedule} />
        </Panel>
      </div>

      {/* ── A. Hero: track map + key metrics ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          eyebrow="Circuit overview"
          title={data.session.circuitName}
          feed={data.feed.detail?.trackOutline}
          className="lg:col-span-2"
          action={<Map size={16} className="mt-1 text-carbon-400" />}
        >
          {"trackOutline" in d ? (
            <TrackMap circuitName={data.session.circuitName} outline={data.trackOutline} />
          ) : (
            <PanelLoading h={380} />
          )}
        </Panel>
        <Panel eyebrow="Session" title="Key Metrics"
          feed={data.feed.detail?.session} action={<Timer size={16} className="mt-1 text-carbon-400" />}>
          <StatStrip session={data.session} />
        </Panel>
      </div>

      {/* ── B + D. Sector analysis & position changes ────────────── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          eyebrow="Timing analysis"
          title="Sector Performance"
          feed={data.feed.detail?.sectors}
          action={<Timer size={16} className="mt-1 text-carbon-400" />}
        >
          {data.sectors ? <SectorChart data={data.sectors} /> : <PanelLoading h={300} />}
        </Panel>
        <Panel
          eyebrow="Grid → chequered flag"
          title="Position Changes"
          feed={data.feed.detail?.positions}
          action={<GitCompareArrows size={16} className="mt-1 text-carbon-400" />}
        >
          {data.positions ? <PositionChanges data={data.positions} /> : <PanelLoading h={340} />}
        </Panel>
      </div>

      {/* ── Lap-by-lap position worm ─────────────────────────────── */}
      <div className="mt-4">
        <Panel
          eyebrow="Race story"
          title="Position Worm"
          feed={data.feed.detail?.worm}
          action={<Route size={16} className="mt-1 text-carbon-400" />}
        >
          {data.worm ? <PositionWormChart data={data.worm} /> : <PanelLoading h={420} />}
        </Panel>
      </div>

      {/* ── C. Tyres & pit stops ─────────────────────────────────── */}
      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Panel
          eyebrow="Strategy"
          title="Tyre Stint Timeline"
          feed={data.feed.detail?.stints}
          className="xl:col-span-2"
          action={<CircleDashed size={16} className="mt-1 text-carbon-400" />}
        >
          {data.stints ? <TyreStintTimeline stints={data.stints} totalLaps={data.session.totalLaps} /> : <PanelLoading h={260} />}
        </Panel>
        <Panel
          eyebrow="Crew performance"
          title="Pit Stop Leaderboard"
          feed={data.feed.detail?.pits}
          className="xl:col-span-3"
          action={<Wrench size={16} className="mt-1 text-carbon-400" />}
        >
          {data.pitStops ? <PitStopTable pitStops={data.pitStops} /> : <PanelLoading h={260} />}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          eyebrow="Tyre model"
          title="Degradation Over Stint"
          feed={data.feed.detail?.degradation}
          className="lg:col-span-2"
          action={<TrendingDown size={16} className="mt-1 text-carbon-400" />}
        >
          {data.degradation ? <DegradationChart data={data.degradation} /> : <PanelLoading h={220} />}
        </Panel>

        {/* ── E. Demographics ────────────────────────────────────── */}
        <Panel
          eyebrow="Field metrics"
          title="Driver Demographics"
          feed={data.feed.detail?.demographics}
          action={<Users size={16} className="mt-1 text-carbon-400" />}
        >
          {data.demographics ? <DemographicsCard data={data.demographics} /> : <PanelLoading h={300} />}
        </Panel>
      </div>

      {/* ── E. Advanced telemetry + championship standings ───────── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          eyebrow="Advanced metrics"
          title="Speed Traps & Racing Pace"
          feed={data.feed.detail?.performance}
          className="lg:col-span-2"
          action={<Gauge size={16} className="mt-1 text-carbon-400" />}
        >
          {data.performance ? <TelemetryCharts data={data.performance} /> : <PanelLoading h={300} />}
        </Panel>
        <Panel
          eyebrow="Championship"
          title="Standings"
          feed={data.feed.detail?.standings}
          action={<Trophy size={16} className="mt-1 text-carbon-400" />}
        >
          {data.standings ? <StandingsPanel standings={data.standings} /> : <PanelLoading h={300} />}
        </Panel>
      </div>

      <footer className="mt-8 flex items-center justify-between border-t border-carbon-700 pt-4 text-[10px] text-carbon-400">
        <span className="timing">F1TELEMETRIES.COM · {data.feed.mode === "live" ? "LIVE DATA" : data.feed.mode === "partial" ? "PARTIAL LIVE DATA" : "DEMO DATA"}</span>
        <span>Sources: Jolpica (results, standings, schedule) · OpenF1 (telemetry, weather)</span>
      </footer>
    </main>
  );
}
