"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp, ChevronDown } from "lucide-react";
import { getTeammateBattles, getFeedStatus } from "@/services/f1Service";
import { DUR, EASE, SPRING, rowDelay } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";
import MockDataBanner from "./MockDataBanner";
import CountUp from "./CountUp";

/**
 * Teammate battles — one team per screen, the whole season so far.
 *
 * The page never scrolls: the wheel, arrow keys, a swipe or the rail step
 * from team to team (championship order), and the address carries the
 * team (`/teammates#mercedes`). Each screen is the two drivers facing the
 * data between them — the driver who is ahead on the left — each standing
 * in front of their country's flag. The rules behind the numbers live in
 * services/teammates.js.
 *
 * Motion on a step: the old screen leaves quickly (drivers out to their
 * sides), then flags wipe in from the edges, the drivers slide in, the
 * score counts and the bars draw row by row. Row figures stay still.
 */

const slug = (id: string) => id.replace(/_/g, "-");
const pad = (n: number) => String(n).padStart(2, "0");
const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
};

/* Wheel: a step needs this much travel. After one, the wheel is ignored
   until it has been quiet for a moment — a single trackpad flick keeps
   sending inertia events for a second or more, and a fixed lock let the
   tail of it through as a second step. */
const WHEEL_STEP = 40;
const WHEEL_QUIET_MS = 160;
const STEP_LOCK_MS = 500;
const SWIPE_PX = 48;

/* ---- Motion. `side` is -1 for the left driver, 1 for the right; `dir`
   is 1 stepping forward, -1 back. ---- */
/* Built per side rather than read from `custom`: while a screen exits,
   AnimatePresence hands every child ITS custom (the step direction). */
const flagWipe = (side: number) => ({
  enter: { clipPath: side < 0 ? "inset(0% 100% 0% 0%)" : "inset(0% 0% 0% 100%)", opacity: 1 },
  show: { clipPath: "inset(0% 0% 0% 0%)", opacity: 1, transition: { duration: 0.7, ease: EASE.out } },
  exit: { opacity: 0, transition: { duration: 0.22, ease: EASE.in } },
});
const driverSlide = (side: number) => ({
  enter: { x: side * 70, opacity: 0 },
  show: { x: 0, opacity: 1, transition: { duration: 0.6, ease: EASE.out, delay: 0.08 } },
  exit: { x: side * 40, opacity: 0, transition: { duration: 0.22, ease: EASE.in } },
});
const labelRise = {
  enter: { y: 16, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { duration: DUR.layout, ease: EASE.out, delay: 0.22 } },
  exit: { opacity: 0, transition: { duration: DUR.exit, ease: EASE.in } },
};
const centreStep = {
  enter: (dir: number) => ({ y: dir * 34, opacity: 0 }),
  show: { y: 0, opacity: 1, transition: { duration: 0.5, ease: EASE.out, delay: 0.05 } },
  exit: (dir: number) => ({ y: dir * -22, opacity: 0, transition: { duration: 0.2, ease: EASE.in } }),
};
const barGrow = (i: number) => ({
  enter: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: 0.6, ease: EASE.out, delay: 0.3 + rowDelay(i) * 2 } },
});

/** Drawn helmet in team colour — shown when a driver has no portrait. */
function Helmet({ color, number, flip }: { color: string; number: number | null; flip: boolean }) {
  const ink = isLight(color) ? "#0B0C0F" : "#F2F3F5";
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <g transform={flip ? "translate(100 0) scale(-1 1)" : undefined}>
        <path d="M16 63 C16 33 39 16 62 18 C82 20 91 38 88 55 L86 67 C84 77 74 83 60 83 L33 83 C23 83 16 75 16 63 Z" fill={color} />
        <path d="M20 50 C26 30 44 21 62 22" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" opacity={0.55} />
        <path d="M52 41 L87 45 L86 59 L57 61 C50 58 48 47 52 41 Z" fill="#0B0C0F" />
        <path d="M56 45 L83 48" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" opacity={0.35} />
        <path d="M33 83 L60 83 C68 83 75 81 80 77 L44 74 Z" fill="#0B0C0F" opacity={0.35} />
      </g>
      {number != null && (
        <text x={flip ? 66 : 34} y={66} textAnchor="middle" fill={ink} style={{ font: "700 15px var(--font-timing), monospace" }}>
          {number}
        </text>
      )}
    </svg>
  );
}

/** One driver: flag behind, cutout in front, name over the faded waist. */
function Side({ driver, color, side, ahead, className }: { driver: any; color: string; side: -1 | 1; ahead: boolean; className: string }) {
  const [noPhoto, setNoPhoto] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const left = side < 0;
  /* The flag is strongest at the outer edge and gone by the middle and
     the floor, so it reads as a backdrop rather than a panel. Two nested
     single masks: mask-composite isn't dependable across browsers. */
  const fadeX = `linear-gradient(to ${left ? "right" : "left"}, #000 0%, transparent 80%)`;
  const fadeY = "linear-gradient(to bottom, #000 40%, transparent 95%)";
  return (
    <div className={`relative min-h-0 overflow-hidden ${className}`}>
      {driver.flag && (
        <motion.div
          variants={flagWipe(side)}
          className="absolute inset-0"
          style={{ maskImage: fadeX, WebkitMaskImage: fadeX }}
        >
          <div className="h-full w-full" style={{ maskImage: fadeY, WebkitMaskImage: fadeY }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={driver.flag} alt="" className="h-full w-full object-cover opacity-50" />
          </div>
        </motion.div>
      )}

      <motion.div variants={driverSlide(side)} className="absolute inset-x-0 bottom-0 top-[6%] flex items-end justify-center">
        {driver.portrait && !noPhoto ? (
          /* Plain <img>: remote F1 media, already sized by their image server. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driver.portrait}
            alt={driver.name}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setNoPhoto(true)}
            className={`h-full max-w-none object-contain object-bottom transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
            style={{
              /* The cutout stops at the waist — dissolve it into the floor. */
              maskImage: "linear-gradient(to bottom, #000 62%, transparent 98%)",
              WebkitMaskImage: "linear-gradient(to bottom, #000 62%, transparent 98%)",
            }}
          />
        ) : (
          <div className="mb-[22%] aspect-square h-[46%]">
            <Helmet color={color} number={driver.number} flip={!left} />
          </div>
        )}
      </motion.div>

      {/* Floor scrim: keeps the name readable over sponsor logos. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-t from-black via-black/75 to-transparent" />

      <motion.div
        variants={labelRise}
        className={`absolute inset-x-0 bottom-3 px-3 sm:px-6 lg:bottom-16 lg:px-10 ${left ? "text-left" : "text-right lg:pr-28"}`}
      >
        <p
          className={`font-display text-4xl font-black uppercase italic leading-none tracking-tight sm:text-6xl xl:text-7xl ${ahead ? "text-carbon-100" : "text-carbon-300"}`}
        >
          {driver.code}
        </p>
        <p className="mt-1 truncate text-data text-carbon-200 sm:text-label">{driver.name}</p>
        {driver.nationality && <p className="eyebrow mt-1 hidden sm:block">{driver.nationality}</p>}
      </motion.div>
    </div>
  );
}

function Row({ row, color, i, a, b }: { row: any; color: string; i: number; a: string; b: string }) {
  const max = Math.max(row.a, row.b);
  const bar = (side: "a" | "b") => (
    <span className="relative block h-[6px] bg-carbon-800">
      <motion.span
        variants={barGrow(i)}
        className={`absolute inset-y-0 ${side === "a" ? "right-0 origin-right" : "left-0 origin-left"}`}
        style={{ width: `${max > 0 ? (row[side] / max) * 100 : 0}%`, background: row.winner === side ? color : "#3A4352" }}
      />
    </span>
  );
  const value = (side: "a" | "b") => (
    <span
      className={`timing text-base font-bold ${side === "a" ? "text-left" : "text-right"} ${row.winner === side ? "text-carbon-100" : "text-carbon-400"}`}
    >
      {row[side]}
    </span>
  );
  return (
    <li
      className="grid grid-cols-[2.5rem_1fr_6.5rem_1fr_2.5rem] items-center gap-2 py-[7px]"
      aria-label={`${row.label}: ${a} ${row.a}, ${b} ${row.b}`}
    >
      {value("a")}
      {bar("a")}
      <span className="eyebrow whitespace-nowrap text-center">{row.label}</span>
      {bar("b")}
      {value("b")}
    </li>
  );
}

function Screen({ team, index, data, dir }: { team: any; index: number; data: any; dir: number }) {
  return (
    <motion.div
      key={team.id}
      initial="enter"
      animate="show"
      exit="exit"
      className="absolute inset-0 grid grid-cols-2 grid-rows-[minmax(0,40%)_minmax(0,1fr)]
        lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)_minmax(0,1fr)] lg:grid-rows-1"
    >
      <Side driver={team.a} color={team.color} side={-1} ahead={team.score.a >= team.score.b} className="col-start-1 row-start-1" />

      <motion.section
        custom={dir}
        variants={centreStep}
        className="col-span-2 row-start-2 flex min-h-0 flex-col justify-start px-4 pb-14 pt-3 sm:px-8 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:justify-center lg:px-0 lg:pb-10 lg:pt-0"
      >
        <p className="eyebrow hidden lg:block">
          Season {data.season} · after round {data.afterRound}
        </p>
        <p className="timing mt-0 flex items-center gap-2 text-label font-bold text-carbon-100 lg:mt-3">
          <span className="text-carbon-500">[</span>#{pad(index + 1)}
          <span className="text-carbon-500">]</span>
          <span className="eyebrow ml-1">
            {team.together} {team.together === 1 ? "race" : "races"} together
          </span>
        </p>
        <h2 className="mt-1.5 font-display text-4xl font-black uppercase italic leading-[0.9] tracking-tight text-carbon-100 sm:text-5xl lg:mt-2 xl:text-6xl">
          {team.name}
        </h2>
        <span className="mt-3 block h-[3px] w-16 origin-left -skew-x-[20deg]" style={{ background: team.color }} />

        <div className="mt-3 flex items-end gap-3 lg:mt-6">
          <p className="font-display text-5xl font-black italic leading-none text-carbon-100 lg:text-6xl">
            <CountUp value={team.score.a} duration={0.7} delay={0.25} />
            <span className="mx-1.5 text-carbon-500">–</span>
            <span className="text-carbon-400">
              <CountUp value={team.score.b} duration={0.7} delay={0.25} />
            </span>
          </p>
          <p className="eyebrow pb-1.5">
            Rows won · {team.a.code} v {team.b.code}
          </p>
        </div>

        <ul className="mt-2 border-t border-carbon-700/70 pt-1.5 lg:mt-4 lg:pt-2">
          {team.rows.map((row: any, k: number) => (
            <Row key={row.key} row={row} color={team.color} i={k} a={team.a.code} b={team.b.code} />
          ))}
        </ul>

        {team.others.length > 0 && (
          <p className="timing mt-2 text-micro uppercase tracking-wider text-carbon-500">
            Also drove · {team.others.map((d: any) => `${d.code} (${d.races} ${d.races === 1 ? "race" : "races"})`).join(", ")}
          </p>
        )}
      </motion.section>

      <Side driver={team.b} color={team.color} side={1} ahead={team.score.b > team.score.a} className="col-start-2 row-start-1 lg:col-start-3" />
    </motion.div>
  );
}

export default function TeammatesPage() {
  const [data, setData] = useState<any>(null);
  const [feed, setFeed] = useState<any>(null);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const forceVisible = useForceVisible();
  const stageRef = useRef<HTMLElement>(null);
  const indexRef = useRef(0);
  indexRef.current = index;

  const teams: any[] = data?.teams ?? [];
  const count = teams.length;

  useEffect(() => {
    getTeammateBattles().then((d) => {
      /* Open on the team named in the address, if there is one. */
      const at = d.teams.findIndex((t: any) => `#${slug(t.id)}` === window.location.hash);
      if (at > 0) setIndex(at);
      setData(d);
      setFeed(getFeedStatus());
    });
  }, []);

  const go = useCallback(
    (to: number) => {
      const next = Math.max(0, Math.min(count - 1, to));
      if (next === indexRef.current) return;
      setDir(next > indexRef.current ? 1 : -1);
      setIndex(next);
    },
    [count]
  );

  /* The address follows the screen (replace, so Back leaves the page). */
  useEffect(() => {
    const team = teams[index];
    if (team) window.history.replaceState(null, "", `#${slug(team.id)}`);
  }, [index, teams]);

  /* Warm the two teams either side so a step never waits on a portrait. */
  useEffect(() => {
    for (const t of [teams[index - 1], teams[index + 1], teams[index + 2], teams[index - 2]]) {
      for (const d of t ? [t.a, t.b] : []) {
        for (const src of [d.portrait, d.flag]) if (src) new Image().src = src;
      }
    }
  }, [index, teams]);

  /* Wheel, keys, swipe. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !count) return;
    let travel = 0, lockedUntil = 0, lastWheel = 0, coasting = false, touchY: number | null = null;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      const now = performance.now();
      const quiet = now - lastWheel > WHEEL_QUIET_MS;
      lastWheel = now;
      if (coasting) {
        if (!quiet || now < lockedUntil) return; // still the same gesture
        coasting = false;
      }
      if (quiet) travel = 0;
      travel += e.deltaY;
      if (Math.abs(travel) >= WHEEL_STEP) {
        coasting = true;
        lockedUntil = now + STEP_LOCK_MS;
        go(indexRef.current + (travel > 0 ? 1 : -1));
        travel = 0;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      const fwd = ["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key);
      const back = ["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key);
      if (!fwd && !back && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      if (e.key === "Home") go(0);
      else if (e.key === "End") go(count - 1);
      else go(indexRef.current + (fwd ? 1 : -1));
    };
    const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0].clientY);
    const onTouchEnd = (e: TouchEvent) => {
      if (touchY == null) return;
      const dy = touchY - e.changedTouches[0].clientY;
      touchY = null;
      if (Math.abs(dy) >= SWIPE_PX) go(indexRef.current + (dy > 0 ? 1 : -1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [count, go]);

  const team = teams[index];

  return (
    /* flex-1 + min-h-0: exactly the space the nav leaves, like the landing
       page. touch-none: a swipe steps teams instead of rubber-banding. */
    <main
      ref={stageRef}
      className="relative min-h-0 w-full flex-1 touch-none overflow-hidden bg-black"
      aria-roledescription="carousel"
      aria-label="Teammate battles, one team per screen"
    >
      <h1 className="sr-only">Teammate battles</h1>

      {!team ? (
        <div className="absolute inset-0 grid place-items-center">
          <span className="timing flex items-center gap-2 text-micro uppercase tracking-wider text-carbon-500">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
            acquiring season
          </span>
        </div>
      ) : (
        <>
          <AnimatePresence mode="wait" custom={dir} initial={!forceVisible}>
            <Screen key={team.id} team={team} index={index} data={data} dir={dir} />
          </AnimatePresence>

          <p className="sr-only" aria-live="polite">
            {team.name}: {team.a.name} {team.score.a}, {team.b.name} {team.score.b}
          </p>

          {/* Rail — every team, championship order. */}
          <ol
            className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col rounded-row border border-carbon-800 bg-black/60 px-2.5 py-1.5 backdrop-blur-sm lg:flex"
            aria-label="Teams"
          >
            {teams.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={t.name}
                  aria-current={i === index || undefined}
                  title={t.name}
                  className={`timing group flex w-14 items-center gap-2 py-[5px] text-micro font-bold transition-colors duration-micro
                    ${i === index ? "text-carbon-100" : "text-carbon-400 hover:text-carbon-100"}`}
                >
                  {pad(i + 1)}
                  {i === index ? (
                    <motion.span layoutId="teammates-rail" className="h-[3px] w-6" style={{ background: t.color }} transition={SPRING.panel} />
                  ) : (
                    <span className="h-px w-3 bg-carbon-700 transition-all duration-micro group-hover:w-5 group-hover:bg-carbon-400" />
                  )}
                </button>
              </li>
            ))}
          </ol>

          {/* Counter + step buttons (the only stepping control on a phone
              besides the swipe itself). */}
          <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Previous team"
              className="grid h-7 w-7 place-items-center rounded-row border border-carbon-700 text-carbon-300 transition-colors duration-micro hover:text-carbon-100 disabled:opacity-30"
            >
              <ChevronUp size={14} />
            </button>
            <p className="timing text-micro font-bold uppercase tracking-wider text-carbon-500">
              <span className="text-carbon-100">{pad(index + 1)}</span> / {pad(count)}
              <span className="mx-2 inline-block h-px w-6 bg-carbon-600 align-middle" />
              <span className="lg:hidden">Swipe</span>
              <span className="hidden lg:inline">Scroll</span>
            </p>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index === count - 1}
              aria-label="Next team"
              className="grid h-7 w-7 place-items-center rounded-row border border-carbon-700 text-carbon-300 transition-colors duration-micro hover:text-carbon-100 disabled:opacity-30"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </>
      )}

      {feed?.detail?.teammates === "mock" && (
        <div className="absolute inset-x-4 top-3 z-30">
          <MockDataBanner feed={feed} only={["teammates"]} />
        </div>
      )}
    </main>
  );
}
