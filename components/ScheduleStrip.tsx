"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useCountdown, pad } from "@/lib/useCountdown";
import { EASE, rowReveal } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";
import RollingDigits from "./RollingDigits";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

/** One segment of the countdown: rolling value over a unit label. */
function Segment({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="flex flex-col items-center">
      <RollingDigits
        text={value}
        className="timing text-2xl font-bold leading-none text-carbon-100 sm:text-3xl"
      />
      <span className="timing mt-1 text-micro uppercase tracking-[0.2em] text-carbon-400">{unit}</span>
    </span>
  );
}

/**
 * Season calendar: next-race countdown, season progress, and the round
 * strip. Past rounds recede, the latest result is marked red, the next
 * round green. The strip opens scrolled to where the season actually is,
 * rather than at round 1.
 */
export default function ScheduleStrip({ schedule }: { schedule: any }) {
  const { rounds, latest, nextRace } = schedule;
  const left = useCountdown(nextRace?.date);
  const stripRef = useRef<HTMLDivElement>(null);
  const forceVisible = useForceVisible();

  const done = rounds.filter((r: any) => r.status === "completed").length;
  const total = rounds.length;

  /* Park the strip on the latest round. scrollLeft on the strip itself,
     not scrollIntoView — that would also scroll the page vertically. */
  useEffect(() => {
    const el = stripRef.current;
    const target = el?.querySelector<HTMLElement>("[data-anchor]");
    if (!el || !target) return;
    el.scrollTo({ left: Math.max(0, target.offsetLeft - el.clientWidth / 3), behavior: "smooth" });
  }, []);

  return (
    <div>
      <div className="mb-3 grid gap-3 lg:grid-cols-[1fr_auto]">
        {/* Next race + countdown */}
        {nextRace && (
          <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-3 overflow-hidden rounded-row border border-carbon-700 bg-carbon-900/70 py-3 pl-4 pr-5">
            <span className="absolute inset-y-0 left-0 w-[3px] bg-sector-green" />
            <div className="min-w-0">
              <p className="eyebrow">Next · Round {nextRace.round}</p>
              <p className="mt-0.5 truncate font-display text-xl font-bold uppercase leading-tight tracking-wide text-carbon-100">
                {nextRace.gp}
              </p>
              <p className="truncate text-data text-carbon-400">
                {nextRace.circuit} · {fmtDate(nextRace.date)}
              </p>
            </div>
            <div className="flex items-start gap-3 sm:gap-4" aria-live="off">
              {left?.done ? (
                <span className="timing text-2xl font-bold text-f1red-bright">LIGHTS OUT</span>
              ) : (
                <>
                  <Segment value={left ? String(left.d) : "–"} unit="days" />
                  <span className="timing text-2xl leading-none text-carbon-600 sm:text-3xl">:</span>
                  <Segment value={left ? pad(left.h) : "––"} unit="hrs" />
                  <span className="timing text-2xl leading-none text-carbon-600 sm:text-3xl">:</span>
                  <Segment value={left ? pad(left.m) : "––"} unit="min" />
                  <span className="timing text-2xl leading-none text-carbon-600 sm:text-3xl">:</span>
                  <Segment value={left ? pad(left.s) : "––"} unit="sec" />
                </>
              )}
            </div>
          </div>
        )}

        {/* Season progress */}
        <div className="flex min-w-[220px] flex-col justify-center rounded-row border border-carbon-700 bg-carbon-900/70 px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <p className="eyebrow">Season progress</p>
            <p className="timing text-label font-bold text-carbon-100">
              {done}
              <span className="text-carbon-400"> / {total}</span>
            </p>
          </div>
          {/* One tick per round, filled as the season runs. Discrete, because
              a season is counted in races, not a continuous percentage. */}
          <div className="mt-2 flex gap-[2px]">
            {rounds.map((r: any, i: number) => (
              <motion.span
                key={r.round}
                className={`h-2 flex-1 origin-bottom ${
                  r.status === "completed"
                    ? latest && r.round === latest.round
                      ? "bg-f1red"
                      : "bg-carbon-300"
                    : nextRace && r.round === nextRace.round
                      ? "bg-sector-green"
                      : "bg-carbon-700"
                }`}
                initial={forceVisible ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.35, ease: EASE.out, delay: 0.2 + i * 0.025 }}
              />
            ))}
          </div>
          <p className="timing mt-1.5 text-micro text-carbon-400">
            {total - done} race{total - done === 1 ? "" : "s"} remaining
          </p>
        </div>
      </div>

      {/* Round strip */}
      <div ref={stripRef} className="relative flex gap-1.5 overflow-x-auto pb-1.5">
        {rounds.map((r: any, i: number) => {
          const isLatest = latest && r.round === latest.round;
          const isNext = nextRace && r.round === nextRace.round;
          const past = r.status === "completed";
          return (
            <motion.div
              key={r.round}
              custom={i}
              variants={rowReveal}
              initial={forceVisible ? false : "hidden"}
              animate="show"
              data-anchor={isLatest ? "" : undefined}
              title={`${r.gp} · ${r.circuit}`}
              className={`group relative min-w-[96px] shrink-0 overflow-hidden rounded-row border px-2.5 pb-2 pt-2.5
                transition-colors duration-micro ease-out-expo
                ${isLatest ? "border-f1red/60 bg-f1red/[0.07]" : isNext ? "border-sector-green/50 bg-sector-green/[0.05]" : "border-carbon-700 bg-carbon-900/50"}`}
            >
              {/* Status rule along the top edge */}
              <span
                className={`absolute inset-x-0 top-0 h-[2px] ${isLatest ? "bg-f1red" : isNext ? "bg-sector-green" : past ? "bg-carbon-600" : "bg-transparent"}`}
              />
              <div className="flex items-center justify-between">
                <span className="timing text-micro text-carbon-400">R{pad(r.round)}</span>
                {isLatest && <span className="timing text-micro font-bold text-f1red-bright">LATEST</span>}
                {isNext && <span className="timing text-micro font-bold text-sector-green">NEXT</span>}
              </div>
              <p
                className={`mt-1 font-display text-sm font-bold uppercase leading-none tracking-wide ${past && !isLatest ? "text-carbon-300" : "text-carbon-100"}`}
              >
                {r.country}
              </p>
              <p className="timing mt-1 text-micro text-carbon-400">{fmtDate(r.date)}</p>
              <p className="timing mt-1.5 flex items-center gap-1 text-micro">
                {past ? (
                  <>
                    <span className="text-carbon-500">P1</span>
                    <span className="font-bold text-carbon-100">{r.winner ?? "—"}</span>
                  </>
                ) : (
                  <span className="text-carbon-500">—</span>
                )}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
