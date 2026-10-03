"use client";

/**
 * The replay's pieces in the site's visual language: the start
 * (front row + the five lights), the driver card, the event moment and
 * the finish podium. Pure presentation: RaceReplay owns the clock and
 * decides when each one shows.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, X, ChevronsRight } from "lucide-react";
import { EASE } from "@/lib/motion";
import { COMPOUND } from "@/lib/chartTheme";
import DriverSide, { Helmet } from "../DriverCutout";
import PodiumDriver from "../PodiumDriver";
import { EVENT_COLOR } from "./ReplayTimeline";

const WORDS = (name: string) =>
  String(name ?? "")
    .split(" ")
    .map((w, i) => (
      <span key={i} className={/^grand$|^prix$/i.test(w) ? "text-carbon-400" : "text-carbon-100"}>
        {w}{" "}
      </span>
    ));

/* ---- Start: the front row and the lights -------------------------------- */

/* The real sequence: five reds come on one by one, hold, and go out. */
const LIGHT_FIRST_MS = 700;
const LIGHT_STEP_MS = 420;
const LIGHTS_HOLD_MS = 850;
const AWAY_MS = 260;

/**
 * Before the race: the two cars on the front row, as people, and the start
 * lights between them. When the lights go out it calls `onGo` (the clock
 * starts) and RaceReplay unmounts it — the drivers leave to their sides.
 * Any click or key skips straight to the start.
 */
export function GridIntro({ data, front, onGo }: { data: any; front: [any, any]; onGo: () => void }) {
  const [lit, setLit] = useState(0);
  const [out, setOut] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 5; i++) timers.push(setTimeout(() => setLit(i), LIGHT_FIRST_MS + (i - 1) * LIGHT_STEP_MS));
    const off = LIGHT_FIRST_MS + 4 * LIGHT_STEP_MS + LIGHTS_HOLD_MS;
    timers.push(setTimeout(() => setOut(true), off));
    timers.push(setTimeout(onGo, off + AWAY_MS));
    return () => timers.forEach(clearTimeout);
  }, [onGo]);

  const [pole, second] = front;
  return (
    <motion.div
      initial="enter"
      animate="show"
      exit="exit"
      variants={{ enter: { opacity: 1 }, show: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.45, ease: EASE.in, delay: 0.12 } } }}
      onClick={onGo}
      role="button"
      aria-label="Start the replay"
      className="fixed inset-0 z-40 grid cursor-pointer grid-cols-2 grid-rows-[minmax(0,300px)_auto] bg-black pt-[60px]
        lg:absolute lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)_minmax(0,1fr)] lg:grid-rows-1 lg:pt-0"
    >
      <DriverSide
        driver={pole}
        color={pole.teamColor}
        side={-1}
        ahead
        meta={`Pole · ${pole.teamName}`}
        lift={false}
        className="col-start-1 row-start-1 h-[300px] lg:h-auto"
      />

      <motion.div
        variants={{
          enter: { opacity: 0, y: 24 },
          show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE.out, delay: 0.1 } },
          exit: { opacity: 0, y: -16, transition: { duration: 0.25, ease: EASE.in } },
        }}
        className="col-span-2 row-start-2 flex flex-col justify-center px-4 py-6 sm:px-8 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:px-0 lg:py-0"
      >
        <p className="eyebrow flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
          Race replay{data.round ? ` · round ${data.round}` : ""}
        </p>
        <p className="mt-2 font-display text-4xl font-black uppercase italic leading-[0.9] tracking-tight sm:text-5xl xl:text-6xl">
          {WORDS(data.raceName)}
        </p>
        <span className="mt-3 block h-[3px] w-16 -skew-x-[20deg] bg-f1red" />

        {/* The gantry. Round lamps are the one place a circle is the
            honest shape — that's what the real thing looks like. */}
        <div className="mt-7 flex gap-2.5" role="img" aria-label={out ? "Lights out" : `${lit} of 5 start lights on`}>
          {[1, 2, 3, 4, 5].map((n) => {
            const on = !out && lit >= n;
            return (
              <span key={n} className="grid h-14 w-11 place-items-center rounded-row bg-carbon-900 sm:h-16 sm:w-12">
                <span
                  className="h-7 w-7 rounded-full transition-[background-color,box-shadow] duration-100 sm:h-8 sm:w-8"
                  style={{
                    backgroundColor: on ? "#FF1E00" : "#1A1D24",
                    boxShadow: on ? "0 0 18px 4px rgba(255,30,0,0.65), inset 0 0 6px rgba(255,255,255,0.35)" : "inset 0 0 0 1px #262B36",
                  }}
                />
              </span>
            );
          })}
        </div>
        <p className="timing mt-4 text-label font-bold uppercase tracking-wider text-carbon-100">
          {out ? "Lights out" : "Front row"}
          <span className="ml-2 font-normal text-carbon-500">
            {pole.code} · {second.code}
          </span>
        </p>
        <p className="timing mt-6 text-micro uppercase tracking-wider text-carbon-500">Click or press any key to skip</p>
      </motion.div>

      <DriverSide
        driver={second}
        color={second.teamColor}
        side={1}
        ahead={false}
        meta={`P2 · ${second.teamName}`}
        lift={false}
        className="col-start-2 row-start-1 h-[300px] lg:col-start-3 lg:h-auto"
      />
    </motion.div>
  );
}

/* ---- Driver card: who you're following ---------------------------------- */

const SHORT: Record<string, string> = { SOFT: "Soft", MEDIUM: "Medium", HARD: "Hard", INTER: "Inter", WET: "Wet" };

export type CardStats = {
  position: string;
  ahead: string;
  aheadNote?: string;
  leader: string;
  compound: string | null;
  tyreAge: number | null;
  stops: number;
  grid: number | null;
};

/**
 * The followed driver, at the head of the right-hand column: cutout in
 * front of their flag, then how their race stands right now. One card
 * that stays put — following someone else swaps what's in it.
 */
export function DriverCard({ driver, stats, onClose, className = "" }: { driver: any; stats: CardStats; onClose: () => void; className?: string }) {
  const fade = "linear-gradient(to bottom, #000 45%, transparent 100%)";
  const row = (label: string, value: React.ReactNode, note?: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 border-t border-carbon-800/80 py-[5px]">
      <dt className="eyebrow">{label}</dt>
      <dd className="timing whitespace-nowrap text-label font-bold text-carbon-100">
        {value}
        {note && <span className="ml-1.5 text-micro font-medium text-carbon-500">{note}</span>}
      </dd>
    </div>
  );
  return (
    <motion.aside
      /* Height, so the feed below is pushed down and let back up smoothly. */
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1, transition: { duration: 0.4, ease: EASE.out } }}
      exit={{ height: 0, opacity: 0, transition: { duration: 0.25, ease: EASE.in } }}
      aria-label={`Following ${driver.name}`}
      className={`relative shrink-0 overflow-hidden border-b border-carbon-800 bg-black ${className}`}
    >
      <span className="absolute inset-y-0 left-0 z-10 w-[3px] transition-colors duration-layout" style={{ background: driver.teamColor }} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={driver.number}
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE.out } }}
          exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE.in } }}
          className="relative flex h-[128px]"
        >
          <Portrait driver={driver} fade={fade} />
          <div className="flex min-w-0 flex-1 flex-col justify-end pb-2.5 pl-1 pr-8">
            <p className="eyebrow truncate">{driver.teamName}</p>
            <p className="font-display text-4xl font-black uppercase italic leading-none tracking-tight text-carbon-100">{driver.code}</p>
            <p className="mt-0.5 truncate text-data text-carbon-300">{driver.name}</p>
          </div>
        </motion.div>
      </AnimatePresence>

      <dl className="px-3 pb-2 pl-4">
        {row("Position", stats.position, stats.grid ? `started P${stats.grid}` : undefined)}
        {row("Car ahead", stats.ahead, stats.aheadNote)}
        {row("Leader", stats.leader)}
        {row(
          "Tyre",
          stats.compound ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-[3px]" style={{ background: COMPOUND[stats.compound] ?? "#5B6678" }} />
              {SHORT[stats.compound] ?? stats.compound}
            </span>
          ) : (
            "—"
          ),
          stats.tyreAge != null ? `${stats.tyreAge} ${stats.tyreAge === 1 ? "lap" : "laps"} · ${stats.stops} ${stats.stops === 1 ? "stop" : "stops"}` : undefined
        )}
      </dl>

      <button
        type="button"
        onClick={onClose}
        aria-label="Stop following"
        className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center text-carbon-500 transition-colors duration-micro hover:text-carbon-100"
      >
        <X size={13} />
      </button>
    </motion.aside>
  );
}

/** Flag behind, waist-up cutout in front; the helmet if there's no photo. */
function Portrait({ driver, fade }: { driver: any; fade: string }) {
  const [noPhoto, setNoPhoto] = useState(false);
  return (
    <div className="relative w-[128px] shrink-0 overflow-hidden">
      {driver.flag && (
        <div className="absolute inset-x-0 top-0 aspect-[4/3]" style={{ maskImage: fade, WebkitMaskImage: fade }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={driver.flag} alt="" className="h-full w-full object-fill opacity-60" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 top-2 flex items-end justify-center">
        {driver.portrait && !noPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driver.portrait}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setNoPhoto(true)}
            className="h-full max-w-none object-contain object-bottom"
            style={{ maskImage: "linear-gradient(to bottom, #000 70%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, #000 70%, transparent 100%)" }}
          />
        ) : (
          <div className="mb-4 h-20 w-20">
            <Helmet color={driver.teamColor ?? "#8B95A7"} number={driver.number ?? null} flip={false} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Event moment -------------------------------------------------------- */

const MOMENT_LABEL: Record<string, string> = {
  start: "Race start",
  overtake: "Overtake",
  fastest: "Fastest lap",
  retired: "Retirement",
  penalty: "Penalty",
  chequered: "Finish",
};

/**
 * A notable event, said the way the rest of the site says things: small
 * mono label, big italic line, a rule in the driver's team colour.
 */
export function Moment({ event, color, compact = false }: { event: any; color?: string; compact?: boolean }) {
  const c = color ?? EVENT_COLOR[event.type] ?? "#E7EAF0";
  return (
    <motion.div
      /* Centred with auto margins. A -translate-x-1/2 class is wiped by
         the y animation (it writes `transform`), which left the moment
         starting at the centre line and running off to the right. */
      className={`pointer-events-none absolute inset-x-0 z-10 mx-auto w-max text-center [text-shadow:0_2px_14px_#000] ${compact ? "top-1.5 max-w-full" : "top-3 max-w-[92%]"}`}
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE.out } }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.25, ease: EASE.in } }}
    >
      <p className="eyebrow truncate" style={{ color: c }}>
        Lap {event.lap} · {MOMENT_LABEL[event.type] ?? event.type}
      </p>
      {/* The line rises out of a mask, like the page headlines. */}
      <p className="overflow-hidden pb-0.5 pr-[0.12em]">
        <motion.span
          className={`block truncate font-display font-black uppercase italic leading-none tracking-tight text-carbon-100 ${compact ? "text-xl xl:text-2xl" : "text-2xl sm:text-3xl"}`}
          initial={{ y: "105%" }}
          animate={{ y: "0%", transition: { duration: 0.55, ease: EASE.out, delay: 0.05 } }}
        >
          {event.label}
        </motion.span>
      </p>
      {/* The slant sits on a wrapper: scaleX on the same element would replace it. */}
      <span className={`mx-auto block w-14 -skew-x-[20deg] ${compact ? "mt-1" : "mt-1.5"}`}>
        <motion.span
          className="block h-[3px] origin-center"
          style={{ background: c }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1, transition: { duration: 0.5, ease: EASE.out, delay: 0.2 } }}
        />
      </span>
    </motion.div>
  );
}

/* ---- Finish: the podium --------------------------------------------------- */

export function PodiumFinish({
  data,
  podium,
  canInterview,
  onInterviews,
  onAgain,
  onClose,
}: {
  data: any;
  podium: any[];
  canInterview: boolean;
  onInterviews: () => void;
  onAgain: () => void;
  onClose: () => void;
}) {
  const [p1, p2, p3] = podium;
  const action =
    "pointer-events-auto timing flex items-center gap-1.5 rounded-row border px-3 py-1.5 text-micro font-bold uppercase tracking-wider transition-colors duration-micro";
  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col bg-black/85"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.5, ease: EASE.out } }}
      exit={{ opacity: 0, transition: { duration: 0.3, ease: EASE.in } }}
    >
      <div className="relative z-10 shrink-0 px-4 pt-4 text-center">
        <p className="eyebrow text-sector-yellow">Chequered flag · {data.raceName}</p>
        <p className="mt-1 font-display text-3xl font-black uppercase italic leading-none tracking-tight text-carbon-100 sm:text-4xl">
          {p1.code} wins
        </p>
      </div>

      <div className="relative mx-auto grid min-h-0 w-full max-w-[860px] flex-1 grid-cols-[1fr_1.15fr_1fr]">
        <PodiumDriver d={p2 ?? p1} place={2} delay={0.25} compact />
        <PodiumDriver d={p1} place={1} delay={0.1} compact />
        <PodiumDriver d={p3 ?? p1} place={3} delay={0.4} compact />
      </div>

      <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-center gap-2 px-4 pb-4 pt-2">
        {canInterview && (
          <button type="button" onClick={onInterviews} className={`${action} border-sector-yellow/60 text-sector-yellow hover:bg-sector-yellow/10`}>
            Hear from the podium <ChevronsRight size={13} />
          </button>
        )}
        <button type="button" onClick={onAgain} className={`${action} border-carbon-600 text-carbon-200 hover:text-carbon-100`}>
          <RotateCcw size={12} /> Watch again
        </button>
        <button type="button" onClick={onClose} className={`${action} border-carbon-700 text-carbon-400 hover:text-carbon-100`}>
          Back to the track
        </button>
      </div>
    </motion.div>
  );
}
