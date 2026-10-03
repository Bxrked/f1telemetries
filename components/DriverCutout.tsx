"use client";

import { ReactNode, useState } from "react";
import { motion } from "framer-motion";
import { DUR, EASE } from "@/lib/motion";

/**
 * A driver as the Teammates and Head-to-Head pages show them: a waist-up
 * cutout in front of their country's flag, name over the faded waist.
 *
 * Variants use the labels enter / show / exit and are inherited from
 * whichever parent sets `initial="enter" animate="show" exit="exit"`.
 * They are built per side rather than read from `custom`: while a screen
 * exits, AnimatePresence hands every child ITS custom instead.
 */

export const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
};

/* Opacity + a short drift only. An animated clip-path repaints the flag
   every frame, and some flags (Spain, Mexico, Brazil) are 80 kB of vector
   detail — that was the stutter when swapping drivers. */
const flagWipe = (side: number) => ({
  enter: { x: side * 28, opacity: 0 },
  show: { x: 0, opacity: 1, transition: { duration: 0.6, ease: EASE.out } },
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

/** Drawn helmet in team colour — shown when a driver has no portrait. */
export function Helmet({ color, number, flip }: { color: string; number: number | null; flip: boolean }) {
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

export default function DriverSide({
  driver,
  color,
  side,
  ahead,
  className = "",
  meta,
  lift = true,
  children,
}: {
  driver: any;
  /** Helmet colour when there's no portrait. */
  color: string;
  side: -1 | 1;
  /** Bright code for the driver who is ahead, dimmer for the other. */
  ahead: boolean;
  className?: string;
  /** Line under the name; defaults to the nationality. */
  meta?: ReactNode;
  /** Raise the label clear of a bottom bar (the Teammates counter). */
  lift?: boolean;
  children?: ReactNode;
}) {
  const [noPhoto, setNoPhoto] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const left = side < 0;
  /* The WHOLE flag, at its own 4:3 shape, across the top of the column
     behind the driver's head and shoulders. Filling the tall column with
     it (object-cover) cropped every flag to a slice — France read as blue
     and grey, Monaco as a red wash. Only its inner and lower edges are
     feathered, so the full design stays recognisable. Two nested single
     masks: mask-composite isn't dependable across browsers. */
  const fadeX = `linear-gradient(to ${left ? "right" : "left"}, #000 72%, transparent 100%)`;
  const fadeY = "linear-gradient(to bottom, #000 58%, transparent 100%)";
  return (
    <div className={`relative min-h-0 overflow-hidden ${className}`}>
      {driver.flag && (
        <motion.div
          variants={flagWipe(side)}
          className="absolute inset-x-0 top-0 aspect-[4/3]"
          style={{ maskImage: fadeX, WebkitMaskImage: fadeX }}
        >
          <div className="h-full w-full" style={{ maskImage: fadeY, WebkitMaskImage: fadeY }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* Its own layer: drawn once, then only moved and faded. */}
            <img src={driver.flag} alt="" decoding="async" className="h-full w-full object-fill opacity-60 [transform:translateZ(0)]" />
          </div>
        </motion.div>
      )}

      <motion.div
        variants={driverSlide(side)}
        className="absolute inset-x-0 bottom-0 top-[6%] flex items-end justify-center [will-change:transform,opacity]"
      >
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
            <Helmet color={color} number={driver.number ?? null} flip={!left} />
          </div>
        )}
      </motion.div>

      {/* Floor scrim: keeps the name readable over sponsor logos. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-t from-black via-black/75 to-transparent" />

      <motion.div
        variants={labelRise}
        className={`absolute inset-x-0 bottom-3 px-3 sm:px-6 lg:px-10 ${lift ? "lg:bottom-16" : "lg:bottom-6"} ${left ? "text-left" : `text-right ${lift ? "lg:pr-28" : ""}`}`}
      >
        <p
          className={`font-display text-4xl font-black uppercase italic leading-none tracking-tight sm:text-6xl xl:text-7xl ${ahead ? "text-carbon-100" : "text-carbon-300"}`}
        >
          {driver.code}
        </p>
        <p className="mt-1 truncate text-data text-carbon-200 sm:text-label">{driver.name}</p>
        {(meta ?? driver.nationality) && <p className="eyebrow mt-1 hidden sm:block">{meta ?? driver.nationality}</p>}
        {children}
      </motion.div>
    </div>
  );
}
