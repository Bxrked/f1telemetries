"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";
import { Helmet } from "./DriverCutout";

/**
 * One step of a podium: flag across the top, waist-up cutout,
 * place / code / name at the foot. P2 and P3 stand lower than the winner.
 * Shared by the telemetry opening screen and the replay's finish.
 */
export default function PodiumDriver({ d, place, delay, compact = false }: { d: any; place: 1 | 2 | 3; delay: number; compact?: boolean }) {
  const [noPhoto, setNoPhoto] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const forceVisible = useForceVisible();
  const fade = "linear-gradient(to bottom, #000 55%, transparent 100%)";
  return (
    <motion.div
      initial={forceVisible ? false : { opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE.out, delay }}
      /* The steps of a podium: the winner stands tallest. */
      className={`relative min-h-0 overflow-hidden ${place === 1 ? "" : place === 2 ? "mt-[9%]" : "mt-[15%]"}`}
    >
      {d.flag && (
        /* The flag settles in behind the driver a beat after they arrive. */
        <motion.div
          initial={forceVisible ? false : { opacity: 0, y: -22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE.out, delay: delay + 0.3 }}
          className="absolute inset-x-0 top-0 aspect-[4/3]"
          style={{ maskImage: fade, WebkitMaskImage: fade }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.flag} alt="" className="h-full w-full object-fill opacity-55 [transform:translateZ(0)]" />
        </motion.div>
      )}
      <div className="absolute inset-x-0 bottom-0 top-[5%] flex items-end justify-center">
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
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-black via-black/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-4 px-3 text-center sm:bottom-6">
        <p className="timing text-micro font-bold uppercase tracking-[0.22em]" style={{ color: place === 1 ? "#FFD644" : "#8B95A7" }}>
          P{place}
        </p>
        <p className={`font-display font-black uppercase italic leading-none tracking-tight text-carbon-100 ${compact ? (place === 1 ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl") : place === 1 ? "text-5xl sm:text-7xl" : "text-4xl sm:text-6xl"}`}>
          {d.code}
        </p>
        <p className="mt-1 truncate text-data text-carbon-200 sm:text-label">{d.name}</p>
        <p className="eyebrow mt-1 hidden items-center justify-center gap-1.5 sm:flex">
          <span className="h-3 w-[3px]" style={{ background: d.teamColor }} />
          {d.teamName}
          {d.raceTime && <span className="timing text-carbon-300">· {d.raceTime}</span>}
        </p>
      </div>
    </motion.div>
  );
}
