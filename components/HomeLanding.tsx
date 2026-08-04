"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BarChart3, Radio, Swords, Trophy, ArrowRight } from "lucide-react";
import { getSeasonSchedule } from "@/services/f1Service";
import { FEATURES } from "@/services/features";
import { DUR, EASE, SPRING, PRESS, rowDelay } from "@/lib/motion";
import CarHero from "./CarHero";
import { useCinematic, ZOOM_OUT_KEY } from "./RouteCinematic";

const pad = (n: number) => String(n).padStart(2, "0");

function useCountdown(targetIso?: string) {
  const [remaining, setRemaining] = useState<string | null>(null);
  useEffect(() => {
    if (!targetIso) return;
    const tick = () => {
      const ms = new Date(targetIso).getTime() - Date.now();
      if (ms <= 0) return setRemaining("LIGHTS OUT");
      const d = Math.floor(ms / 86_400_000);
      const h = Math.floor((ms % 86_400_000) / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1_000);
      setRemaining(`${d}d ${pad(h)}:${pad(m)}:${pad(s)}`);
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [targetIso]);
  return remaining;
}

const SECTIONS = [
  {
    href: "/telemetry",
    icon: BarChart3,
    title: "Telemetry",
    desc: "Sectors, tyre strategy, pit stops, degradation, speed traps.",
    part: "Power unit",
  },
  {
    href: "/live",
    icon: Radio,
    title: "Live Race",
    desc: "Broadcast race map with running order and gaps.",
    part: "Sidepod",
  },
  {
    href: "/compare",
    icon: Swords,
    title: "Head to Head",
    desc: "Two drivers, lap by lap: pace, sectors, top speed, gap trace.",
    part: "Cockpit",
  },
];

/* Replay is shelved — hidden until FEATURES.raceReplay is flipped back on. */
const VISIBLE_SECTIONS = SECTIONS.filter((s) => FEATURES.raceReplay || s.href !== "/live");

const enter = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DUR.layout, ease: EASE.out, delay: 0.4 + rowDelay(i) },
  }),
};

export default function HomeLanding() {
  const { play, zoom } = useCinematic();
  const [schedule, setSchedule] = useState<any>(null);
  /* Set when we arrived from a section — the camera pulls back out of the
     same bodywork we dived into. */
  const [zoomOutFrom, setZoomOutFrom] = useState<string | null>(null);

  useEffect(() => {
    try {
      const from = sessionStorage.getItem(ZOOM_OUT_KEY);
      if (from) {
        setZoomOutFrom(from);
        sessionStorage.removeItem(ZOOM_OUT_KEY);
      }
    } catch {
      /* private mode — the hero simply appears */
    }
  }, []);

  useEffect(() => {
    getSeasonSchedule().then(setSchedule).catch(() => {});
  }, []);
  const countdown = useCountdown(schedule?.nextRace?.date);

  const chrome = { opacity: zoom ? 0 : 1 };
  const chromeT = { duration: zoom ? 0.35 : 0.5, ease: zoom ? EASE.in : EASE.out };

  return (
    /* flex-1 + min-h-0: fills whatever the sticky nav leaves, at any
       breakpoint. min-h-0 stops the flex item from being forced taller
       than its share by the absolutely-positioned content inside. */
    <main className="relative min-h-0 w-full flex-1 overflow-hidden">
      {/* ── Fullscreen reveal. `fixed inset-0` so the footage covers the
             entire viewport including behind the translucent nav, rather
             than stopping at the nav's lower edge. The dive and pull-out
             ride on this wrapper; the camera move is in the footage. ─── */}
      <motion.div
        className="fixed inset-0 z-0"
        style={{ transformOrigin: zoom?.origin ?? zoomOutFrom ?? "50% 50%" }}
        initial={zoomOutFrom ? { scale: 6, opacity: 0 } : { opacity: 0 }}
        animate={zoom ? { scale: 6, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={
          zoom
            ? { duration: 1.1, ease: EASE.in }
            : zoomOutFrom
              ? { duration: 1.0, ease: EASE.out }
              : { duration: 0.6, ease: EASE.out }
        }
      >
        <CarHero />
      </motion.div>

      {/* Bottom scrim — keeps the options legible at moments where the
          footage isn't black behind them. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[38%] bg-gradient-to-t from-black via-black/85 to-transparent" />

      {/* ── Options, in the black band at the bottom ───────────────── */}
      <motion.div
        className="fixed inset-x-0 bottom-0 z-10 px-4 pb-5 sm:px-6 sm:pb-7"
        animate={chrome}
        transition={chromeT}
      >
        <div className="mx-auto grid w-full max-w-4xl gap-3 sm:grid-cols-2">
          {VISIBLE_SECTIONS.map(({ href, icon: Icon, title, desc, part }, i) => (
            <motion.div key={href} custom={i} variants={enter} initial="hidden" animate="show">
              <motion.div whileHover={{ y: -3 }} whileTap={PRESS} transition={SPRING.press}>
                <Link
                  href={href}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    play(href, title);
                  }}
                  className="group flex items-center gap-4 rounded-panel border border-carbon-700/80 bg-carbon-950/70 px-4 py-3.5 backdrop-blur-sm
                    transition-colors duration-micro ease-out-expo hover:border-f1red/70 hover:bg-carbon-900/80"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-row bg-carbon-850 text-carbon-300 transition-colors duration-micro group-hover:bg-f1red/20 group-hover:text-f1red-bright">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="font-display text-lg font-bold uppercase tracking-wide text-carbon-100">
                        {title}
                      </span>
                      <span className="timing text-micro uppercase tracking-wider text-carbon-500">
                        {part}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-data text-carbon-400">{desc}</span>
                  </span>
                  <ArrowRight
                    size={17}
                    className="shrink-0 text-carbon-600 transition-all duration-micro ease-out-expo
                      group-hover:translate-x-1 group-hover:text-f1red-bright"
                  />
                </Link>
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* Race status — one thin line under the options */}
        <div className="mx-auto mt-3 flex max-w-4xl flex-wrap items-center justify-center gap-x-6 gap-y-1">
          {schedule?.nextRace && (
            <span className="flex items-baseline gap-2">
              <span className="eyebrow">Next</span>
              <span className="text-label font-bold text-carbon-100">{schedule.nextRace.gp}</span>
              <span className="timing text-label font-bold tabular-nums text-f1red-bright">
                {countdown ?? "—"}
              </span>
            </span>
          )}
          {schedule?.latest && (
            <span className="flex items-baseline gap-2">
              <span className="eyebrow">Latest</span>
              <span className="text-label font-bold text-carbon-100">{schedule.latest.gp}</span>
              {schedule.latest.winner && (
                <span className="timing flex items-center gap-1 text-label font-bold text-sector-yellow">
                  <Trophy size={11} />
                  {schedule.latest.winner}
                </span>
              )}
            </span>
          )}
        </div>
      </motion.div>
    </main>
  );
}
