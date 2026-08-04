"use client";

import { useEffect, useState } from "react";
import { GitCompareArrows, Timer, CircleDashed, Wrench, TrendingDown, Users, Gauge, Map, CalendarRange, Trophy, Route, RadioTower } from "lucide-react";

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
  getRadioMessages,
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
import RadioMessages from "./RadioMessages";
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
  radio: any[];
  feed: any;
}

function Skeleton() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="skeleton mb-2 h-14" />
      <div className="grid gap-2 xl:grid-cols-[0.8fr_2fr_0.8fr]">
        <div className="skeleton h-[60vh]" />
        <div className="skeleton h-[60vh]" />
        <div className="skeleton h-[60vh]" />
      </div>
      <p className="timing mt-4 flex items-center justify-center gap-2 text-micro uppercase tracking-[0.22em] text-carbon-500">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
        Synchronising timing feed
      </p>
    </div>
  );
}

type FeedData = { [K in keyof DashboardData]?: DashboardData[K] };

function PanelLoading({ h = 200 }: { h?: number }) {
  return (
    <div className="skeleton flex items-center justify-center" style={{ height: h }}>
      <span className="timing relative z-10 flex items-center gap-2 text-micro uppercase tracking-wider text-carbon-500">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
        acquiring feed
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
    run("radio", getRadioMessages());

    return () => { cancelled = true; };
  }, []);

  // The header needs session + schedule; show a light skeleton until then.
  if (!d.session || !d.schedule) return <Skeleton />;
  const data = { ...d, feed } as DashboardData & { feed: any };

  return (
    /* Full-bleed: a 1440px cap left ~225px of dead black down each side on
       a wide monitor. A dense telemetry board should use the glass.
       min-w-0: body is a flex column, and flex items won't shrink below
       their content's min-content width by default — a horizontally
       scrollable child (the schedule strip) otherwise forces this main
       wider than the viewport. */
    <main className="w-full min-w-0 px-4 py-6 sm:px-6">
      <DashboardHeader session={data.session} feed={data.feed} />

      <MockDataBanner
        feed={data.feed}
        only={["schedule","session","standings","positions","demographics","stints","pits","degradation","performance","sectors","worm","trackOutline","radio"]}
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

      {/* ── A. Hero band: metrics · circuit · pit wall ─────────────
             Tall enough for the map to dominate, capped so the panels
             below still peek above the fold and the page reads as a
             dashboard rather than a single screen. Stacks under xl. ── */}
      {/* Explicit fractions rather than 12-col spans: the radio rail needed
          halving, which isn't expressible in twelfths. The map is
          HEIGHT-constrained (circuits are usually portrait), so its column
          only needs enough width to stop clipping — height is what makes
          the track bigger, hence 92vh. Surplus width goes to the metrics
          column, which can use it; the map would just gain dead space.
          Side columns share one fraction so the board is symmetric —
          metrics and pit wall frame the circuit at equal width. */}
      <div className="grid gap-2 xl:h-[92vh] xl:grid-cols-[0.8fr_2fr_0.8fr]">
        <Panel
          eyebrow="Session"
          title="Key Metrics"
          feed={data.feed.detail?.session}
          fill
          action={<Timer size={16} className="mt-1 text-carbon-400" />}
        >
          <div className="h-full overflow-y-auto">
            <StatStrip session={data.session} />
          </div>
        </Panel>

        <Panel
          eyebrow="Circuit overview"
          title={data.session.circuitName}
          feed={data.feed.detail?.trackOutline}
          fill
          action={<Map size={16} className="mt-1 text-carbon-400" />}
        >
          {"trackOutline" in d ? (
            <TrackMap circuitName={data.session.circuitName} outline={data.trackOutline} />
          ) : (
            <PanelLoading h={380} />
          )}
        </Panel>

        <Panel
          eyebrow="Pit wall"
          title="Radio & Race Control"
          feed={data.feed.detail?.radio}
          fill
          action={<RadioTower size={16} className="mt-1 text-carbon-400" />}
        >
          {"radio" in d ? <RadioMessages messages={data.radio} /> : <PanelLoading h={280} />}
        </Panel>
      </div>

      {/* ── B + D. Sector analysis & position changes ────────────── */}
      <div className="mt-2 grid gap-2 lg:grid-cols-2">
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
          {/* Radio feed doubles as the race-control source for the safety
              car bands — no extra request. */}
          {data.worm ? <PositionWormChart data={data.worm} messages={data.radio} /> : <PanelLoading h={420} />}
        </Panel>
      </div>

      {/* ── C. Tyres & pit stops ─────────────────────────────────── */}
      <div className="mt-2 grid gap-2 xl:grid-cols-5">
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

      <div className="mt-2 grid gap-2 lg:grid-cols-3">
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
      <div className="mt-2 grid gap-2 lg:grid-cols-3">
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
