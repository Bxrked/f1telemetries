"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Flag, Satellite, Info, MapPinned } from "lucide-react";
import { tracePath } from "@/services/format";
import { EASE } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";

type SectorKey = "s1" | "s2" | "s3";

/* The lap draws in sector order, each sector picking up where the last
   ended, so the reveal traces the circuit the way a car drives it. */
const DRAW = { s1: 0.15, s2: 0.75, s3: 1.35 } as const;
const DRAW_DUR = 0.65;
const LAP_DRAWN = DRAW.s3 + DRAW_DUR;

const SECTOR_COLORS = { s1: "#E10600", s2: "#3B9BFF", s3: "#FFD644" };

/* ── Illustrative fallback: stylised Circuit de Monaco ─────────── */
const MONACO_PATHS = {
  s1: "M 240 300 L 400 300 Q 428 300 434 276 L 442 196 Q 446 168 472 152 L 500 134 Q 528 118 560 118",
  s2: "M 560 118 Q 592 118 588 144 L 576 168 Q 570 182 552 184 Q 530 186 528 198 Q 527 210 545 214 L 558 220 Q 574 228 566 244 Q 552 262 520 258 L 300 246 Q 284 245 276 254 L 268 262 Q 260 270 245 264",
  s3: "M 245 264 Q 228 258 220 272 L 210 284 Q 204 292 190 288 L 178 285 Q 166 282 162 292 Q 158 300 146 300 Q 132 300 132 312 Q 132 324 148 324 Q 164 324 176 318 Q 196 308 218 302 Q 228 300 240 300",
};
const MONACO_FULL = `${MONACO_PATHS.s1} ${MONACO_PATHS.s2.replace("M 560 118 ", "")} ${MONACO_PATHS.s3.replace("M 245 264 ", "")}`;

const MONACO_CORNERS = [
  { id: 1,  name: "Sainte Dévote",    x: 434, y: 282, speed: 125, gear: 3 },
  { id: 4,  name: "Casino Square",    x: 560, y: 112, speed: 148, gear: 4 },
  { id: 6,  name: "Fairmont Hairpin", x: 528, y: 202, speed: 48,  gear: 1 },
  { id: 9,  name: "Tunnel",           x: 400, y: 250, speed: 282, gear: 8 },
  { id: 10, name: "Nouvelle Chicane", x: 262, y: 262, speed: 72,  gear: 2 },
  { id: 12, name: "Tabac",            x: 216, y: 276, speed: 165, gear: 5 },
  { id: 14, name: "Piscine",          x: 184, y: 288, speed: 176, gear: 5 },
  { id: 18, name: "La Rascasse",      x: 140, y: 314, speed: 55,  gear: 2 },
];

/* Gap-aware: breaks the line at GPS dropouts instead of drawing a
   straight line across the circuit where data is missing. */
const toPath = (pts: number[][]) => (pts.length ? tracePath(pts) : "");

/** Legend doubles as the sector picker: hover or focus isolates a sector. */
function SectorLegend({ active, onPick }: { active: SectorKey | null; onPick: (s: SectorKey | null) => void }) {
  return (
    <div className="flex gap-1" onMouseLeave={() => onPick(null)}>
      {(["s1", "s2", "s3"] as const).map((s, i) => (
        <button
          key={s}
          type="button"
          onMouseEnter={() => onPick(s)}
          onFocus={() => onPick(s)}
          onBlur={() => onPick(null)}
          aria-pressed={active === s}
          className={`timing flex items-center gap-1.5 rounded-row px-2 py-1 text-micro uppercase tracking-wider
            transition-colors duration-micro ease-out-expo
            ${active === s ? "bg-carbon-800 text-carbon-100" : active ? "text-carbon-500" : "text-carbon-300 hover:text-carbon-100"}`}
        >
          <span className="h-[3px] w-4" style={{ background: SECTOR_COLORS[s] }} />
          Sector {i + 1}
        </button>
      ))}
    </div>
  );
}

/**
 * TrackMap — two modes:
 *  LIVE:      `outline` traced from OpenF1 car telemetry → renders any
 *             circuit's real shape, sector-split by lap timestamps.
 *  FALLBACK:  stylised Monaco. Corner names shown ONLY when the session
 *             actually is Monaco; otherwise honestly labelled illustrative.
 */
export default function TrackMap({ circuitName, outline }: { circuitName?: string; outline?: any }) {
  const [hovered, setHovered] = useState<(typeof MONACO_CORNERS)[number] | null>(null);
  const [sector, setSector] = useState<SectorKey | null>(null);
  const forceVisible = useForceVisible();

  const live = !!outline?.sectors;
  const isMonaco = /monaco|monte carlo/i.test(circuitName ?? "Monaco");
  const showCorners = !live && isMonaco;

  /* The fallback shape is Monaco. Drawing it under another circuit's name
     told the reader "this is the Hungaroring" while showing Monaco's
     actual layout — a caption saying "illustrative" doesn't undo a
     recognisable wrong shape. Anywhere but Monaco we now show no map at
     all, matching the data layer's rule: refuse rather than mislead. */
  const wrongCircuit = !live && !isMonaco;

  if (wrongCircuit) {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 rounded-row bg-carbon-900/40 px-6 text-center">
        <MapPinned size={22} className="text-carbon-600" />
        <p className="timing text-label font-bold uppercase tracking-wider text-carbon-300">
          Circuit map unavailable
        </p>
        <p className="max-w-sm text-data leading-relaxed text-carbon-400">
          The map is traced from live GPS for {circuitName ?? "this circuit"}, and no lap with
          usable positioning data came back for this session. Rather than draw a different
          circuit&apos;s shape here, we show nothing.
        </p>
      </div>
    );
  }

  const sectorPaths = live
    ? {
        s1: toPath(outline.sectors.s1),
        s2: toPath(outline.sectors.s2),
        s3: toPath(outline.sectors.s3),
      }
    : MONACO_PATHS;
  const fullPath = live
    ? toPath([...outline.sectors.s1, ...outline.sectors.s2.slice(1), ...outline.sectors.s3.slice(1)])
    : MONACO_FULL;
  const start = live ? outline.sectors.s1[0] : [320, 300];

  return (
    /* Fills the panel body so the map grows with the hero band instead of
       being pinned to its own aspect ratio. */
    <div className="relative flex h-full min-h-0 flex-col">
      <svg
        /* Read the frame from the payload rather than assuming one — the
           traced outline is normalised into its own box, and hardcoding a
           different aspect here is what letterboxed the map. The Monaco
           fallback paths are still authored against 660×360. */
        viewBox={
          live && outline?.viewBox
            ? `0 0 ${outline.viewBox.W} ${outline.viewBox.H}`
            : "0 0 660 360"
        }
        role="img"
        aria-label={`${circuitName ?? "Circuit"} track map with sector colouring`}
        preserveAspectRatio="xMidYMid meet"
        className="min-h-0 w-full flex-1"
      >
        <defs>
          <filter id="trackGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <path id="lapPath" d={fullPath} />
        </defs>

        {/* Tarmac base */}
        <path d={fullPath} fill="none" stroke="#1E2430" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />

        {/* Sector overlays — drawn in lap order on arrival */}
        {(Object.keys(sectorPaths) as SectorKey[]).map((key) => (
          <motion.path
            key={key}
            d={sectorPaths[key]}
            fill="none"
            stroke={SECTOR_COLORS[key]}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#trackGlow)"
            initial={forceVisible ? false : { pathLength: 0, opacity: 0.92, strokeWidth: 4.5 }}
            animate={{
              pathLength: 1,
              opacity: sector && sector !== key ? 0.12 : 0.92,
              strokeWidth: sector === key ? 6.5 : 4.5,
            }}
            transition={{
              pathLength: { duration: DRAW_DUR, ease: EASE.out, delay: DRAW[key] },
              opacity: { duration: 0.2 },
              strokeWidth: { duration: 0.2 },
            }}
          />
        ))}

        {/* Start / finish marker */}
        <circle cx={start[0]} cy={start[1]} r="5" fill="none" stroke="#E7EAF0" strokeWidth="2" strokeDasharray="2 2" />

        {/* Car dot lapping the circuit — joins once the lap has been drawn */}
        <motion.g
          initial={forceVisible ? false : { opacity: 0 }}
          animate={{ opacity: sector ? 0.25 : 1 }}
          transition={{ duration: 0.4, delay: sector ? 0 : forceVisible ? 0 : LAP_DRAWN }}
        >
          <circle r="5" fill="#FF1E00" filter="url(#trackGlow)">
            <animateMotion dur="16s" repeatCount="indefinite" rotate="auto">
              <mpath href="#lapPath" />
            </animateMotion>
          </circle>
        </motion.g>

        {/* Corner markers — Monaco fallback only */}
        {showCorners &&
          MONACO_CORNERS.map((c) => (
            <g
              key={c.id}
              onMouseEnter={() => setHovered(c)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              <circle cx={c.x} cy={c.y} r="11" fill="transparent" />
              <circle
                cx={c.x}
                cy={c.y}
                r={hovered?.id === c.id ? 6 : 4}
                fill="#0C0E12"
                stroke={hovered?.id === c.id ? "#FF1E00" : "#5B6678"}
                strokeWidth="2"
                className="transition-all duration-200"
              />
            </g>
          ))}
      </svg>

      {/* Readout bar — fixed slot so the layout never jumps */}
      <div className="mt-2 flex min-h-[44px] flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-row border border-carbon-700 bg-carbon-900/70 py-1.5 pl-3 pr-1.5">
        {showCorners && hovered ? (
          <>
            <div className="flex items-center gap-3">
              <span className="timing rounded-row bg-f1red/15 px-2 py-0.5 text-xs font-bold text-f1red-bright">
                T{hovered.id}
              </span>
              <span className="font-display text-sm font-bold uppercase tracking-wide">{hovered.name}</span>
            </div>
            <div className="timing flex gap-5 text-xs text-carbon-300">
              <span>
                Apex <span className="font-bold text-carbon-100">{hovered.speed} km/h</span>
              </span>
              <span>
                Gear <span className="font-bold text-carbon-100">{hovered.gear}</span>
              </span>
            </div>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2 text-xs text-carbon-400">
              {live ? (
                <>
                  <Satellite size={13} className="text-sector-green" />
                  Live outline · traced from car #{outline.referenceDriver} telemetry, lap {outline.lap}
                </>
              ) : showCorners ? (
                <>
                  <Flag size={13} className="text-f1red" />
                  Hover a corner marker for apex telemetry
                </>
              ) : (
                <>
                  <Info size={13} className="text-sector-yellow" />
                  Illustrative layout — no clean GPS lap available for this circuit
                </>
              )}
            </span>
            <SectorLegend active={sector} onPick={setSector} />
          </>
        )}
      </div>
    </div>
  );
}
