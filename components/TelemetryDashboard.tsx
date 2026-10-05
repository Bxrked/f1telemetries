"use client";

/**
 * Post-race telemetry — the latest Grand Prix, told in the same language
 * as Teammates and Head-to-Head: the podium opens the page (cutouts in
 * front of flags, four headline facts), then five numbered chapters
 * without boxes (the race, pace, strategy, the circuit, the season), with
 * a rail to jump between them.
 *
 * Each feed still lands on its own (progressive load); an exhibit shows a
 * skeleton until its data is in and a "Demo data" tag if it fell back.
 */

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useScroll, useSpring } from "framer-motion";
import {
  getSessionInfo, getSectorAnalysis, getTyreStints, getPitStops, getDegradation, getPositionChanges,
  getPerformanceMetrics, getSeasonSchedule, getStandings, getFeedStatus, getTrackOutline, getPositionWorm, getRaceControl,
} from "@/services/f1Service";
import { EASE, SPRING, VIEWPORT, panelReveal, rowDelay, wordRise, ruleWipe, metaFade } from "@/lib/motion";
import CountUp from "./CountUp";
import { useForceVisible } from "./MotionProvider";
import PodiumDriver from "./PodiumDriver";
import TrackMap from "./TrackMap";
import StatStrip from "./StatStrip";
import DegradationChart from "./DegradationChart";
import { Face, People, PitBoard, Reveal, SectorBoard, SpeedAndPace, StintBoard } from "./TelemetryExhibits";
import ScheduleStrip from "./ScheduleStrip";
import PositionWormChart from "./PositionWormChart";
import RaceControlFeed from "./RaceControlFeed";
import MockDataBanner from "./MockDataBanner";
import PublisherNotice, { usePublisherLag, PublisherLag } from "./PublisherNotice";

type Feeds = Partial<Record<
  "session" | "sectors" | "stints" | "pitStops" | "degradation" | "positions" | "performance" | "schedule" | "standings" | "trackOutline" | "worm" | "control",
  any
>>;

const CHAPTERS = [
  { id: "race", label: "The race" },
  { id: "pace", label: "Pace" },
  { id: "strategy", label: "Strategy" },
  { id: "circuit", label: "The circuit" },
  { id: "season", label: "The season" },
];

/* ---- Furniture --------------------------------------------------------- */

function Loading({ h = 220 }: { h?: number }) {
  return (
    <div className="skeleton flex items-center justify-center" style={{ height: h }}>
      <span className="timing relative z-10 flex items-center gap-2 text-micro uppercase tracking-wider text-carbon-500">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
        acquiring feed
      </span>
    </div>
  );
}

/**
 * Mounts its children only once it has been scrolled to. For exhibits that
 * animate on mount (the position chart draws lap by lap, the track traces
 * itself): mounted with the page, they finished long before anyone
 * arrived to see them.
 */
function WhenSeen({ minHeight, className = "", children }: { minHeight?: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -18% 0px" });
  const forceVisible = useForceVisible();
  const on = seen || forceVisible;
  return (
    <div ref={ref} className={className} style={on ? undefined : { minHeight }}>
      {on && children}
    </div>
  );
}

/** A chapter: big numbered heading, hairline above, anchor for the rail. */
function Chapter({ n, id, title, lede, children }: { n: number; id: string; title: string; lede: string; children: ReactNode }) {
  const forceVisible = useForceVisible();
  return (
    <section id={id} data-chapter={id} className="scroll-mt-24 border-t border-carbon-700/70 pt-8">
      {/* The page-title build, per chapter: number, words rising out of
          their masks, the red rule wiping in, then the lede. */}
      <motion.header
        {...(forceVisible
          ? { initial: false as const, animate: "show" as const }
          : { initial: "hidden" as const, whileInView: "show" as const, viewport: VIEWPORT })}
        className="mb-8"
      >
        <motion.p
          variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE.out } } }}
          className="timing text-label font-bold text-carbon-100"
        >
          <span className="text-carbon-500">[</span> {String(n).padStart(2, "0")} <span className="text-carbon-500">]</span>
        </motion.p>
        <h2
          className="mt-2 font-display text-4xl font-black uppercase italic leading-[0.92] tracking-tight text-carbon-100 sm:text-6xl"
          aria-label={title}
        >
          {title.split(" ").map((w, i) => (
            /* The slot clips the rising word; right padding keeps the
               italic overhang from being shaved off by the mask. */
            <span key={i} aria-hidden className="mr-[0.2em] inline-block overflow-hidden pr-[0.12em] align-bottom last:mr-0">
              <motion.span custom={i} variants={wordRise} className="inline-block">
                {w}
              </motion.span>
            </span>
          ))}
        </h2>
        {/* The slant sits on a wrapper: the wipe animates scaleX, and a
            transform written by the animation would replace a skew class
            on the same element (the rule used to come out square). */}
        <span className="mt-3 block w-16 -skew-x-[20deg]">
          <motion.span variants={ruleWipe} className="block h-[3px] origin-left bg-f1red" />
        </span>
        <motion.p variants={metaFade} className="mt-3 max-w-xl text-data leading-relaxed text-carbon-400">
          {lede}
        </motion.p>
      </motion.header>
      <div className="space-y-12">{children}</div>
    </section>
  );
}

/** One exhibit inside a chapter: small heading, no box. */
function Block({ eyebrow, title, mock, children, className = "" }: { eyebrow: string; title: string; mock?: boolean; children: ReactNode; className?: string }) {
  const forceVisible = useForceVisible();
  return (
    <motion.div
      variants={panelReveal}
      {...(forceVisible
        ? { initial: false as const, animate: "show" as const }
        : { initial: "hidden" as const, whileInView: "show" as const, viewport: VIEWPORT })}
      className={`min-w-0 ${className}`}
    >
      <header className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="mt-1 font-display text-xl font-bold uppercase leading-none tracking-wide text-carbon-100">{title}</h3>
        </div>
        {mock && (
          <span
            title="Live data unavailable for this section — these are built-in sample values, not the latest race."
            className="timing shrink-0 rounded-row border border-sector-yellow/50 bg-sector-yellow/10 px-1.5 py-0.5 text-micro font-bold uppercase tracking-wider text-sector-yellow"
          >
            Demo data
          </span>
        )}
      </header>
      {children}
    </motion.div>
  );
}

/* ---- Opening screen: the podium ---------------------------------------- */

function Fact({ label, value, sub, i }: { label: string; value: ReactNode; sub?: ReactNode; i: number }) {
  const forceVisible = useForceVisible();
  return (
    <motion.div
      initial={forceVisible ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE.out, delay: 0.45 + i * 0.07 }}
      className="border-t border-carbon-700/70 pt-2"
    >
      <p className="eyebrow">{label}</p>
      <p className="timing mt-1 text-2xl font-bold leading-none text-carbon-100">{value}</p>
      {sub && <p className="timing mt-1 truncate text-micro uppercase tracking-wider text-carbon-400">{sub}</p>}
    </motion.div>
  );
}

function Podium({ session, feed, positions, pitStops, lag }: { session: any; feed: any; positions?: any[]; pitStops?: any[]; lag: PublisherLag }) {
  const forceVisible = useForceVisible();
  const top = useMemo(
    () => (positions ?? []).filter((p) => !p.dnf && p.finish >= 1 && p.finish <= 3).sort((a, b) => a.finish - b.finish),
    [positions]
  );
  const [p1, p2, p3] = top;
  const fastest = positions?.find((p) => p.fastestRank === 1);
  const climber = positions?.length ? [...positions].filter((p) => !p.dnf).sort((a, b) => b.delta - a.delta)[0] : null;
  const words = String(session.meetingName).split(" ");
  const live = feed?.mode === "live";
  const gap = /^\+(\d+\.\d+)$/.exec(p2?.raceTime ?? "");
  const margin = gap ? +gap[1] : null;

  return (
    <section className="relative flex flex-col border-b border-carbon-800 lg:h-[calc(100svh-66px)] lg:max-h-[940px] lg:min-h-[640px] lg:flex-row">
      {/* Words */}
      <div className="relative z-10 flex shrink-0 flex-col justify-center px-4 py-8 sm:px-8 lg:w-[36%] lg:max-w-[560px] lg:py-0 lg:pl-10 lg:pr-4">
        <motion.div
          initial={forceVisible ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE.out }}
        >
          <p className="eyebrow flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
            Round {session.round} · {session.season} · race result
          </p>
          <h1 className="mt-3 font-display text-5xl font-black uppercase italic leading-[0.88] tracking-tight sm:text-6xl xl:text-7xl" aria-label={session.meetingName}>
            {words.map((w, i) => (
              <span key={i} className={/^grand$|^prix$/i.test(w) ? "text-carbon-400" : "text-carbon-100"}>
                {w}{" "}
              </span>
            ))}
          </h1>
          <span className="mt-4 block h-[3px] w-20 -skew-x-[20deg] bg-f1red" />
          <p className="timing mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-carbon-300">
            <span className="text-carbon-100">{session.circuitName}</span>
            <span className="text-carbon-600">/</span>
            <span>{session.location}</span>
            <span className="text-carbon-600">/</span>
            <span className={`flex items-center gap-1.5 ${live ? "text-sector-green" : "text-sector-yellow"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse-dot bg-sector-green" : "bg-sector-yellow"}`} />
              {live ? "Live data" : feed?.mode === "partial" ? `Partial live ${feed.live}/${feed.total}` : feed?.mode === "loading" ? "Syncing" : "Demo data"}
            </span>
          </p>
        </motion.div>

        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5">
          <Fact
            i={0}
            label="Winning margin"
            /* "+0.196" counts up; "+1 Lap" and the like are shown as written. */
            value={
              margin != null ? (
                <>
                  +<CountUp value={margin} decimals={3} duration={0.9} delay={0.55} />
                </>
              ) : (
                p2?.raceTime ?? "—"
              )
            }
            sub={p1 && p2 ? `${p1.code} over ${p2.code}` : undefined}
          />
          <Fact
            i={1}
            label="Fastest lap"
            value={fastest?.fastestLap ?? "—"}
            /* The award comes with the provider's official result. */
            sub={fastest ? `${fastest.code} · ${fastest.teamName}` : lag?.state === "bridged" ? "with the official result" : undefined}
          />
          <Fact
            i={2}
            label="Biggest climber"
            value={
              climber ? (
                <>
                  {climber.delta > 0 ? "+" : climber.delta < 0 ? "−" : ""}
                  <CountUp value={Math.abs(climber.delta)} duration={0.9} delay={0.7} />
                </>
              ) : (
                "—"
              )
            }
            sub={climber ? `${climber.code} · P${climber.grid} to P${climber.finish}` : undefined}
          />
          <Fact i={3} label="Pit stops" value={pitStops ? <CountUp value={pitStops.length} duration={0.9} delay={0.75} /> : "—"} sub={`${session.totalLaps} laps`} />
        </div>
      </div>

      {/* Podium: P2 · P1 · P3 */}
      {/* Fixed height when stacked (flex-1 in an auto-height column collapses to nothing). */}
      <div className="relative grid h-[340px] min-h-0 shrink-0 grid-cols-[1fr_1.15fr_1fr] sm:h-[440px] lg:h-auto lg:flex-1">
        {p1 ? (
          <>
            <PodiumDriver d={p2 ?? p1} place={2} delay={0.25} />
            <PodiumDriver d={p1} place={1} delay={0.1} />
            <PodiumDriver d={p3 ?? p1} place={3} delay={0.4} />
          </>
        ) : (
          <div className="col-span-3 grid place-items-center">
            <Loading h={260} />
          </div>
        )}
      </div>
    </section>
  );
}

/* ---- Chapter exhibits --------------------------------------------------- */

/** Grid → flag, one row per driver: face, code, the move, a centre-out bar. */
function PositionMoves({ data }: { data: any[] }) {
  /* Finishers by places gained; retirements together at the foot. */
  const rows = [...data.filter((d) => !d.dnf), ...data.filter((d) => d.dnf)];
  const max = Math.max(1, ...rows.filter((d) => !d.dnf).map((d) => Math.abs(d.delta)));
  const grow = {
    hidden: { scaleX: 0 },
    show: (i: number = 0) => ({ scaleX: 1, transition: { duration: 0.55, ease: EASE.out, delay: 0.15 + rowDelay(i) } }),
  };
  return (
    <Reveal as="ul">
      {rows.map((d, i) => {
        /* A retirement isn't a move: "P19 → DNF" with a +3 bar would lie. */
        const up = !d.dnf && d.delta > 0, down = !d.dnf && d.delta < 0;
        const w = `${(Math.abs(d.delta) / max) * 100}%`;
        return (
          <motion.li
            key={d.code}
            custom={i}
            variants={{
              hidden: { opacity: 0, x: -10 },
              show: (k: number = 0) => ({ opacity: d.dnf ? 0.5 : 1, x: 0, transition: { duration: 0.3, ease: EASE.out, delay: rowDelay(k) } }),
            }}
            title={`${d.name} · P${d.grid} → P${d.finish}${d.dnf ? ` · ${d.status}` : ""}`}
            className="grid grid-cols-[1.75rem_2.5rem_4.5rem_1fr_1fr_2rem] items-center gap-2 py-[3px]"
          >
            <Face src={d.thumb} color={d.teamColor} size={24} />
            <span className="timing text-label font-bold text-carbon-100">{d.code}</span>
            <span className="timing text-micro text-carbon-400">
              P{d.grid} <span className="text-carbon-600">→</span> {d.dnf ? "DNF" : `P${d.finish}`}
            </span>
            {/* Lost places grow left from the centre line, gained to the right. */}
            <span className="relative block h-[6px]">
              {down && <motion.span custom={i} variants={grow} className="absolute inset-y-0 right-0 origin-right bg-f1red" style={{ width: w }} />}
            </span>
            <span className="relative block h-[6px] border-l border-carbon-600">
              {up && <motion.span custom={i} variants={grow} className="absolute inset-y-0 left-0 origin-left bg-sector-green" style={{ width: w }} />}
            </span>
            <span className={`timing text-right text-label font-bold ${up ? "text-sector-green" : down ? "text-f1red-bright" : "text-carbon-500"}`}>
              {up ? `+${d.delta}` : down ? d.delta : "—"}
            </span>
          </motion.li>
        );
      })}
    </Reveal>
  );
}

const MOMENT: Record<string, { label: string; cls: string; rule: string }> = {
  red: { label: "Red flag", cls: "text-f1red-bright", rule: "bg-f1red" },
  sc: { label: "Safety car", cls: "text-sector-yellow", rule: "bg-sector-yellow" },
  vsc: { label: "Virtual safety car", cls: "text-sector-yellow", rule: "bg-sector-yellow" },
  penalty: { label: "Penalty", cls: "text-carbon-100", rule: "bg-carbon-400" },
  start: { label: "Start", cls: "text-carbon-100", rule: "bg-carbon-400" },
};

/** The handful of notices that shaped the race; the full log on request. */
function KeyMoments({ messages }: { messages: any[] }) {
  const [all, setAll] = useState(false);
  /* Only what changed the race: a flag or safety car going out or coming
     in, and penalties actually handed down — not every "will be
     investigated" notice. */
  /* A race begun behind the safety car is a key moment too: the laps
     behind it, then race control's call for a standing or rolling start
     (the same words announce a restart after a red flag — the red flag
     itself is already listed then). */
  let redSeen = false;
  const key = messages.flatMap((m) => {
    const text = String(m.message ?? "").toUpperCase().trim();
    if (m.category === "red") {
      redSeen = true;
      return [m];
    }
    if (!redSeen && m.lap > 1 && m.lap <= 12 && /^(STANDING|ROLLING) START\b/.test(text)) return [{ ...m, category: "start" }];
    if (m.category === "sc" || m.category === "vsc") return /DEPLOYED|IN THIS LAP|ENDING|BEHIND (THE )?SAFETY CAR/.test(text) ? [m] : [];
    if (m.category === "penalty") return /TIME PENALTY|DRIVE THROUGH|STOP.?(AND|\/)?.?GO|GRID PENALTY|DISQUALIF|REPRIMAND/.test(text) ? [m] : [];
    return [];
  });
  if (all) {
    return (
      <div>
        <div className="h-[520px]">
          <RaceControlFeed messages={messages} />
        </div>
        <button type="button" onClick={() => setAll(false)} className="timing mt-3 text-micro font-bold uppercase tracking-wider text-carbon-300 hover:text-carbon-100">
          Show key moments only
        </button>
      </div>
    );
  }
  return (
    <div>
      {key.length === 0 ? (
        <p className="text-data text-carbon-400">A clean race: no safety car, red flag or penalty was issued.</p>
      ) : (
        <Reveal className="relative pl-4">
          {/* The race's spine: drawn from the start to the flag, each
              moment arriving as the line reaches it. */}
          <motion.li
            aria-hidden
            className="absolute bottom-0 left-0 top-0 w-px origin-top list-none bg-carbon-700"
            variants={{ hidden: { scaleY: 0 }, show: { scaleY: 1, transition: { duration: 0.25 + key.length * 0.12, ease: "linear" } } }}
          />
          {key.map((m, i) => {
            const k = MOMENT[m.category];
            return (
              <motion.li
                key={`${m.t}-${i}`}
                variants={{
                  hidden: { opacity: 0, x: 12 },
                  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE.out, delay: 0.1 + i * 0.12 } },
                }}
                className="relative pb-3 last:pb-0"
              >
                <motion.span
                  variants={{ hidden: { scaleY: 0 }, show: { scaleY: 1, transition: { duration: 0.3, ease: EASE.out, delay: 0.1 + i * 0.12 } } }}
                  className={`absolute -left-[17px] top-1.5 h-[9px] w-[3px] ${k.rule}`}
                />
                <p className="timing flex items-baseline gap-2 text-micro font-bold uppercase tracking-wider">
                  <span className="text-carbon-400">L{m.lap}</span>
                  <span className={k.cls}>{k.label}</span>
                  {m.code && <span style={{ color: m.color ?? undefined }}>{m.code}</span>}
                </p>
                <p className="mt-0.5 text-data leading-relaxed text-carbon-300">{m.message}</p>
              </motion.li>
            );
          })}
        </Reveal>
      )}
      <button type="button" onClick={() => setAll(true)} className="timing mt-4 text-micro font-bold uppercase tracking-wider text-carbon-300 hover:text-carbon-100">
        Show all {messages.length} notices
      </button>
    </div>
  );
}

/** Both championships side by side, every row visible — no scroll box. */
function StandingsBoard({ standings }: { standings: any }) {
  const forceVisible = useForceVisible();
  const table = (rows: any[], drivers: boolean) => {
    const max = rows[0]?.points || 1;
    return (
      <ol>
        {rows.map((r: any, i: number) => (
          <motion.li
            key={r.pos}
            initial={forceVisible ? false : { opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.25, ease: EASE.out, delay: rowDelay(i) }}
            className="grid grid-cols-[1.25rem_auto_minmax(0,1fr)_3rem_3rem] items-center gap-2.5 border-b border-carbon-800/70 py-[5px]"
          >
            <span className={`timing text-right text-label font-bold ${i < 3 ? "text-carbon-100" : "text-carbon-500"}`}>{r.pos}</span>
            {drivers ? <Face src={r.thumb} color={r.teamColor} size={26} /> : <span className="h-4 w-[3px]" style={{ background: r.color }} />}
            <span className="min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-label font-bold text-carbon-100">{drivers ? r.code : r.team}</span>
                {drivers && <span className="truncate text-micro text-carbon-500">{r.teamName}</span>}
              </span>
              <span className="mt-1 block h-[3px] bg-carbon-800">
                <motion.span
                  className="block h-full origin-left"
                  style={{ background: r.teamColor ?? r.color }}
                  initial={forceVisible ? false : { scaleX: 0 }}
                  whileInView={{ scaleX: r.points / max }}
                  viewport={VIEWPORT}
                  transition={{ duration: 0.6, ease: EASE.out, delay: rowDelay(i) }}
                />
              </span>
            </span>
            <span className="timing text-right text-label font-bold text-carbon-100">{r.points}</span>
            <span className="timing text-right text-micro text-carbon-500">{r.gap === 0 ? "lead" : `−${r.gap}`}</span>
          </motion.li>
        ))}
      </ol>
    );
  };
  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
      <div>
        <p className="eyebrow mb-2">Drivers</p>
        {table(standings.drivers, true)}
      </div>
      <div>
        <p className="eyebrow mb-2">Constructors</p>
        {table(standings.constructors, false)}
      </div>
    </div>
  );
}

/** Chapter rail — fixed at the right edge, follows the scroll. */
function Rail({ active }: { active: string | null }) {
  /* How far down the page the reader is, drawn along the rail's edge.
     Sprung, so it glides with the scroll instead of stepping. */
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 32, mass: 0.4 });
  return (
    <nav
      aria-label="Chapters"
      className={`fixed right-4 top-1/2 z-30 hidden -translate-y-1/2 overflow-hidden rounded-row border border-carbon-800 bg-black/70 py-1.5 pl-2.5 pr-3.5 backdrop-blur-sm transition-opacity duration-layout xl:block
        ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <span aria-hidden className="absolute inset-y-0 right-0 w-[3px] bg-carbon-800">
        <motion.span className="block h-full w-full origin-top bg-f1red" style={{ scaleY: progress }} />
      </span>
      {CHAPTERS.map((c, i) => (
        <a
          key={c.id}
          href={`#${c.id}`}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(c.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          aria-current={active === c.id || undefined}
          className={`timing flex items-center justify-end gap-2 py-[5px] text-micro font-bold uppercase tracking-wider transition-colors duration-micro
            ${active === c.id ? "text-carbon-100" : "text-carbon-500 hover:text-carbon-200"}`}
        >
          {/* Always named: a rail of bare numbers only made sense while the
              name appeared on hover. */}
          <span>{c.label}</span>
          {String(i + 1).padStart(2, "0")}
          {active === c.id ? (
            <motion.span layoutId="telemetry-rail" className="h-[3px] w-5 bg-f1red" transition={SPRING.panel} />
          ) : (
            <span className="h-px w-3 bg-carbon-700" />
          )}
        </a>
      ))}
    </nav>
  );
}

/* ---- Page -------------------------------------------------------------- */

export default function TelemetryDashboard() {
  /* Progressive load, as before: each feed lands on its own. */
  const [d, setD] = useState<Feeds>({});
  const [feed, setFeed] = useState<any>({ mode: "loading", live: 0, total: 0, detail: {} });
  const [active, setActive] = useState<string | null>(null);
  /* Set while the results provider is behind — see PublisherNotice. */
  const lag = usePublisherLag();

  useEffect(() => {
    let cancelled = false;
    const run = (key: keyof Feeds, p: Promise<any>) =>
      p
        .then((v) => v, () => undefined)
        .then((v) => {
          if (cancelled) return;
          setD((prev) => ({ ...prev, [key]: v }));
          setFeed(getFeedStatus());
        });
    // Cheap Jolpica feeds first, for perceived speed.
    run("schedule", getSeasonSchedule());
    run("session", getSessionInfo());
    run("standings", getStandings());
    run("positions", getPositionChanges());
    run("stints", getTyreStints());
    run("pitStops", getPitStops());
    run("trackOutline", getTrackOutline());
    run("sectors", getSectorAnalysis());
    run("performance", getPerformanceMetrics());
    run("degradation", getDegradation());
    run("worm", getPositionWorm());
    run("control", getRaceControl());
    return () => {
      cancelled = true;
    };
  }, []);

  /* Which chapter is under the reader — drives the rail. */
  const ready = !!d.session && !!d.schedule;
  useEffect(() => {
    if (!ready) return;
    const onScroll = () => {
      const line = window.innerHeight * 0.4;
      let cur: string | null = null;
      document.querySelectorAll<HTMLElement>("[data-chapter]").forEach((el) => {
        if (el.getBoundingClientRect().top <= line) cur = el.dataset.chapter ?? null;
      });
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ready]);

  if (!ready) {
    return (
      <main className="relative grid min-h-0 w-full flex-1 place-items-center bg-black">
        <span className="timing flex items-center gap-2 text-micro uppercase tracking-wider text-carbon-500">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
          Synchronising timing feed
        </span>
      </main>
    );
  }

  const mock = (k: string) => feed.detail?.[k] === "mock";
  const s = d.session;
  /* Standings come from the results provider. While it is behind, they
     stand where its last published race left them — whatever round number
     the provider's own standings label carries. */
  const standingsRound = lag ? lag.publishedRound : d.standings?.afterRound ?? s.round;
  /* Who's who, for the faces and team colours in every list. */
  const people: People = Object.fromEntries((d.positions ?? []).map((p: any) => [p.code, { thumb: p.thumb, teamColor: p.teamColor, name: p.name }]));

  return (
    <>
    <PublisherNotice page="telemetry" />
    <main className="w-full min-w-0 bg-black">
      <Podium session={s} feed={feed} positions={d.positions} pitStops={d.pitStops} lag={lag} />
      <Rail active={active} />

      <div className="mx-auto w-full max-w-[1400px] space-y-20 px-4 pb-24 pt-10 sm:px-8 xl:pr-48">
        <MockDataBanner
          feed={feed}
          only={["schedule", "session", "standings", "positions", "stints", "pits", "degradation", "performance", "sectors", "worm", "trackOutline", "control"]}
        />

        <Chapter n={1} id="race" title="The race" lede="How the order changed from lights out to the flag, who moved furthest, and the moments that shaped it.">
          <Block eyebrow="Every lap, every car" title="Position chart" mock={mock("worm")}>
            {d.worm ? (
              <WhenSeen minHeight={500}>
                <PositionWormChart data={d.worm} messages={d.control} />
              </WhenSeen>
            ) : (
              <Loading h={420} />
            )}
          </Block>
          <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[1.25fr_1fr]">
            <Block eyebrow="Grid to chequered flag" title="Places won and lost" mock={mock("positions")}>
              {d.positions ? <PositionMoves data={d.positions} /> : <Loading h={420} />}
            </Block>
            <Block eyebrow="Race control" title="Key moments" mock={mock("control")}>
              {"control" in d ? <KeyMoments messages={d.control ?? []} /> : <Loading h={280} />}
            </Block>
          </div>
        </Chapter>

        <Chapter n={2} id="pace" title="Pace" lede="Who was quickest where: the best sectors, the speed trap, and the pace each car held over a race distance.">
          <Block eyebrow="Each driver's best time through each third of the lap" title="Sectors" mock={mock("sectors")}>
            {d.sectors ? <SectorBoard data={d.sectors} people={people} /> : <Loading h={300} />}
          </Block>
          <Block eyebrow="Top speed and average race lap" title="Speed traps and race pace" mock={mock("performance")}>
            {d.performance ? <SpeedAndPace data={d.performance} people={people} /> : <Loading h={300} />}
          </Block>
        </Chapter>

        <Chapter n={3} id="strategy" title="Strategy" lede="Which tyres each driver ran and for how long, how quickly the crews turned them around, and how the rubber faded.">
          <div className="grid gap-x-12 gap-y-12 xl:grid-cols-[1.15fr_1fr]">
            <div className="space-y-12">
              <Block eyebrow="Compound by lap" title="Tyre stints" mock={mock("stints")}>
                {d.stints ? <StintBoard stints={d.stints} totalLaps={s.totalLaps} people={people} /> : <Loading h={260} />}
              </Block>
              <Block eyebrow="Lap time against tyre age" title="Degradation" mock={mock("degradation")}>
                {d.degradation ? <DegradationChart data={d.degradation} /> : <Loading h={220} />}
              </Block>
            </div>
            <Block eyebrow="Crew performance" title="Pit stops" mock={mock("pits")}>
              {d.pitStops ? <PitBoard pitStops={d.pitStops} people={people} /> : <Loading h={260} />}
            </Block>
          </div>
        </Chapter>

        <Chapter n={4} id="circuit" title="The circuit" lede={`${s.circuitName}, traced from the cars' own GPS, with the conditions on race day.`}>
          <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[2fr_1fr]">
            <Block eyebrow="Sector by sector" title={s.circuitName} mock={mock("trackOutline")}>
              <div className="h-[420px] sm:h-[560px]">
                {"trackOutline" in d ? (
                  <WhenSeen className="h-full">
                    <TrackMap circuitName={s.circuitName} outline={d.trackOutline} />
                  </WhenSeen>
                ) : (
                  <Loading h={420} />
                )}
              </div>
            </Block>
            <Block eyebrow="Session and weather" title="Race day" mock={mock("session")}>
              <StatStrip session={s} />
            </Block>
          </div>
        </Chapter>

        <Chapter n={5} id="season" title="The season" lede={`Where the championships stand after round ${standingsRound}, and what comes next.`}>
          <Block
            eyebrow={lag ? `After round ${standingsRound} · round ${lag.round} not counted yet` : `After round ${standingsRound}`}
            title="Championship standings"
            mock={mock("standings")}
          >
            {d.standings ? <StandingsBoard standings={d.standings} /> : <Loading h={300} />}
          </Block>
          <Block eyebrow={`Season ${d.schedule.season}`} title="Calendar" mock={mock("schedule")}>
            <ScheduleStrip schedule={d.schedule} />
          </Block>
        </Chapter>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-carbon-800 pt-4 text-[10px] text-carbon-400">
          <span className="timing">
            F1TELEMETRIES.COM · {feed.mode === "live" ? "LIVE DATA" : feed.mode === "partial" ? "PARTIAL LIVE DATA" : "DEMO DATA"}
          </span>
          <span>Sources: Jolpica (results, standings, schedule) · OpenF1 (telemetry, weather)</span>
        </footer>
      </div>
    </main>
    </>
  );
}
