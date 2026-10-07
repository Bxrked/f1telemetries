"use client";

import { useState } from "react";
import { motion, Variants } from "framer-motion";
import { EASE } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";
import { Helmet } from "./DriverCutout";

/* The staged arrival (telemetry's opening): the flag settles down first,
   the driver rises in front of it, then who it is. `custom` is the step's
   own delay, so the three steps can arrive in order. Transforms and
   opacity only. */
const flagDown: Variants = {
  hidden: { opacity: 0, y: -22 },
  show: (delay: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE.out, delay } }),
};
const driverUp: Variants = {
  hidden: { opacity: 0, y: 48 },
  show: (delay: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE.out, delay: delay + 0.12 } }),
};
const placeIn: Variants = {
  hidden: { opacity: 0 },
  show: (delay: number = 0) => ({ opacity: 1, transition: { duration: 0.3, ease: EASE.out, delay: delay + 0.36 } }),
};
const codeRise: Variants = {
  hidden: { y: "108%" },
  show: (delay: number = 0) => ({ y: "0%", transition: { duration: 0.6, ease: EASE.out, delay: delay + 0.4 } }),
};
const nameIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: (delay: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE.out, delay: delay + 0.58 } }),
};

/**
 * One step of a podium: flag across the top, waist-up cutout,
 * place / code / name at the foot. P2 and P3 stand lower than the winner.
 * Shared by the telemetry opening screen and the replay's finish.
 *
 * `staged`: the page's opening sequence is the conductor — every piece
 * takes hidden/show from the nearest parent that sets them and arrives on
 * its own beat. Without it (the replay's finish) the step simply rises in
 * when it mounts, as it always has.
 */
export default function PodiumDriver({ d, place, delay, compact = false, staged = false }: { d: any; place: 1 | 2 | 3; delay: number; compact?: boolean; staged?: boolean }) {
  const [noPhoto, setNoPhoto] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const forceVisible = useForceVisible();
  const fade = "linear-gradient(to bottom, #000 55%, transparent 100%)";
  /* A piece of the staged arrival, or nothing at all when not staged. */
  const beat = (variants: Variants) => (staged ? { variants, custom: delay } : {});
  return (
    <motion.div
      {...(staged
        ? {}
        : { initial: forceVisible ? false : { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, ease: EASE.out, delay } })}
      /* The steps of a podium: the winner stands tallest. */
      className={`relative min-h-0 overflow-hidden ${place === 1 ? "" : place === 2 ? "mt-[9%]" : "mt-[15%]"}`}
    >
      {d.flag && (
        <motion.div
          {...(staged
            ? beat(flagDown)
            : /* The flag settles in behind the driver a beat after they arrive. */
              { initial: forceVisible ? false : { opacity: 0, y: -22 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease: EASE.out, delay: delay + 0.3 } })}
          className="absolute inset-x-0 top-0 aspect-[4/3]"
          style={{ maskImage: fade, WebkitMaskImage: fade }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.flag} alt="" className="h-full w-full object-fill opacity-55 [transform:translateZ(0)]" />
        </motion.div>
      )}
      <motion.div {...beat(driverUp)} className="absolute inset-x-0 bottom-0 top-[5%] flex items-end justify-center">
        {d.portrait && !noPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={d.portrait}
            alt={d.name}
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setNoPhoto(true)}
            className={`h-full max-w-none object-contain object-bottom transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
            style={{ maskImage: "linear-gradient(to bottom, #000 60%, transparent 97%)", WebkitMaskImage: "linear-gradient(to bottom, #000 60%, transparent 97%)" }}
          />
        ) : (
          <div className="mb-[24%] aspect-square h-[44%]">
            <Helmet color={d.teamColor} number={d.number ?? null} flip={false} />
          </div>
        )}
      </motion.div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-black via-black/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-4 px-3 text-center sm:bottom-6">
        <motion.p {...beat(placeIn)} className="timing text-micro font-bold uppercase tracking-[0.22em]" style={{ color: place === 1 ? "#FFD644" : "#8B95A7" }}>
          P{place}
        </motion.p>
        {/* The code rises out of a mask; the padding keeps the italic overhang from being shaved off. */}
        <p
          className={`overflow-hidden px-[0.08em] font-display font-black uppercase italic leading-none tracking-tight text-carbon-100 ${compact ? (place === 1 ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl") : place === 1 ? "text-5xl sm:text-7xl" : "text-4xl sm:text-6xl"}`}
        >
          <motion.span {...beat(codeRise)} className="block">
            {d.code}
          </motion.span>
        </p>
        <motion.div {...beat(nameIn)}>
          <p className="mt-1 truncate text-data text-carbon-200 sm:text-label">{d.name}</p>
          <p className="eyebrow mt-1 hidden items-center justify-center gap-1.5 sm:flex">
            <span className="h-3 w-[3px]" style={{ background: d.teamColor }} />
            {d.teamName}
            {d.raceTime && <span className="timing text-carbon-300">· {d.raceTime}</span>}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
