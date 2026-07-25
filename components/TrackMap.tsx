"use client";

import { useState } from "react";
import { Flag, Satellite, Info } from "lucide-react";

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

const toPath = (pts: number[][]) =>
  pts.length ? `M ${pts.map((p) => p.join(" ")).join(" L ")}` : "";

function SectorLegend() {
  return (
    <div className="flex gap-4">
      {(["s1", "s2", "s3"] as const).map((s, i) => (
        <span key={s} className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-carbon-300">
          <span className="h-1.5 w-4 rounded-full" style={{ background: SECTOR_COLORS[s] }} />
          Sector {i + 1}
        </span>
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

  const live = !!outline?.sectors;
  const isMonaco = /monaco|monte carlo/i.test(circuitName ?? "Monaco");
  const showCorners = !live && isMonaco;

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
    <div className="relative">
      <svg
        viewBox="0 0 660 360"
        role="img"
        aria-label={`${circuitName ?? "Circuit"} track map with sector colouring`}
        className="w-full"
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

        {/* Sector overlays */}
        {(Object.keys(sectorPaths) as Array<keyof typeof sectorPaths>).map((key) => (
          <path
            key={key}
            d={sectorPaths[key]}
            fill="none"
            stroke={SECTOR_COLORS[key]}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#trackGlow)"
            opacity="0.9"
          />
        ))}

        {/* Start / finish marker */}
        <circle cx={start[0]} cy={start[1]} r="5" fill="none" stroke="#E7EAF0" strokeWidth="2" strokeDasharray="2 2" />

        {/* Animated car dot lapping the circuit */}
        <circle r="5" fill="#FF1E00" filter="url(#trackGlow)">
          <animateMotion dur="16s" repeatCount="indefinite" rotate="auto">
            <mpath href="#lapPath" />
          </animateMotion>
        </circle>

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
      <div className="mt-2 flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-carbon-700 bg-carbon-900/70 px-4 py-2">
        {showCorners && hovered ? (
          <>
            <div className="flex items-center gap-3">
              <span className="timing rounded bg-f1red/15 px-2 py-0.5 text-xs font-bold text-f1red-bright">
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
                  Illustrative layout — live circuit trace unavailable
                </>
              )}
            </span>
            <SectorLegend />
          </>
        )}
      </div>
    </div>
  );
}
