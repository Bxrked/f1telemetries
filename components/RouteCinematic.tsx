"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";

/**
 * Page transitions — a racing line painted across the screen.
 *
 *   in    two fat ribbons (F1 red, then carbon right behind it) sweep along
 *         an S-shaped racing line with three cars on the leading edge,
 *         until the screen is covered. The destination's name appears.
 *   hold  the route changes underneath (we wait for the new pathname, so a
 *         slow page never shows half-loaded).
 *   out   the tails chase the heads off the far end — carbon first, red
 *         after — revealing the new page.
 *
 * The ribbons are one SVG path drawn with a moving dash: the visible piece
 * runs from `tail` to `head` (distances along the path), round caps give
 * the blob ends. Everything is written straight to attributes from one rAF
 * loop; React only mounts/unmounts the overlay and sets the label.
 *
 * The home intro waits for us (transitionBusy) so the mark doesn't start
 * wiping in while the ribbons are still leaving.
 */

/** What the sweep says for each destination. */
export const ROUTE_LABELS: Record<string, string> = {
  "/": "Home",
  "/telemetry": "Post-Race Telemetry",
  "/live": "Race Replay",
  "/compare": "Head-to-Head",
};

type Ctx = { play: (href: string, label?: string) => void };
const CinematicCtx = createContext<Ctx>({ play: () => {} });
export const useCinematic = () => useContext(CinematicCtx);

let busy = false;
/** True from the first frame of a sweep until the new page is uncovered. */
export const transitionBusy = () => busy;

/* Work in a 1600×1000 box drawn with `slice`, so the line keeps its shape
   at any aspect ratio. Portrait screens get the same box turned 90° —
   otherwise a phone only sees a thin middle strip and the cars flash
   past; turned, the line sweeps top to bottom, the long way. */
const VB = { w: 1600, h: 1000 };
const LINE = "M -1150 1500 C -300 1500, 150 250, 800 500 S 1650 -120, 2750 -500";
/* Stroke width — wide enough that at full length it covers the box. */
const WIDTH = 1500;
const IN_MS = 820;
const OUT_MS = 760;
/** Carbon ribbon trails the red one by this fraction of the move. */
const LAG = 0.16;
const MIN_HOLD_MS = 380;
const MAX_HOLD_MS = 4000;

/* Cars on the leading edge: angle around the cap (deg), how far ahead of
   it, and livery. */
const CARS = [
  { a: -34, ahead: 40, color: "#F47600", accent: "#111" }, // McLaren
  { a: 0, ahead: 150, color: "#00D7B6", accent: "#111" }, // Mercedes
  { a: 34, ahead: 70, color: "#2743A8", accent: "#F2F3F5" }, // Red Bull
];
const CAR_LEN = 230;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Top-down F1 car, nose toward +x, centred on the origin, ~CAR_LEN long. */
function TopCar({ color, accent }: { color: string; accent: string }) {
  return (
    <g transform={`scale(${CAR_LEN / 560})`}>
      {/* tyres */}
      {[
        [170, -95],
        [170, 95],
        [-175, -100],
        [-175, 100],
      ].map(([x, y], i) => (
        <rect
          key={i}
          x={x - (i < 2 ? 34 : 40)}
          y={y - (i < 2 ? 18 : 22)}
          width={i < 2 ? 68 : 80}
          height={i < 2 ? 36 : 44}
          rx={8}
          fill="#0b0b0d"
        />
      ))}
      {/* floor */}
      <path d="M -230 -78 L 90 -70 L 120 -40 L 120 40 L 90 70 L -230 78 Z" fill="#16181d" />
      {/* front + rear wings */}
      <rect x={232} y={-118} width={34} height={236} rx={6} fill="#16181d" />
      <rect x={-282} y={-82} width={40} height={164} rx={5} fill="#16181d" />
      {/* body: nose, cockpit, sidepods, engine cover */}
      <path
        d="M 262 -10 L 262 10 L 120 22 L 40 30 L 10 66 L -150 64 L -235 30 L -262 14 L -262 -14 L -235 -30 L -150 -64 L 10 -66 L 40 -30 L 120 -22 Z"
        fill={color}
      />
      <rect x={-170} y={-3} width={250} height={6} fill={accent} opacity={0.85} />
      {/* cockpit, halo, helmet */}
      <ellipse cx={20} cy={0} rx={46} ry={22} fill="#060607" />
      <circle cx={10} cy={0} r={15} fill={accent === "#111" ? "#FFD644" : "#F2F3F5"} />
      <path d="M 60 0 Q 40 -26 -8 -24 M 60 0 Q 40 26 -8 24" stroke="#16181d" strokeWidth={7} fill="none" />
    </g>
  );
}

export default function RouteCinematic({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [run, setRun] = useState<{
    href: string;
    label: string;
    id: number;
    portrait: boolean;
  } | null>(null);

  const redRef = useRef<SVGPathElement>(null);
  const darkRef = useRef<SVGPathElement>(null);
  const carRefs = useRef<(SVGGElement | null)[]>([]);
  const labelRef = useRef<HTMLDivElement>(null);
  /* The pathname the loop is waiting for, and the latest one seen. */
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const play = useCallback(
    (href: string, label?: string) => {
      if (href === pathname || busy) return;
      if (reduced) {
        router.push(href);
        return;
      }
      busy = true;
      router.prefetch?.(href);
      setRun({
        href,
        label: label ?? ROUTE_LABELS[href] ?? "",
        id: Date.now(),
        portrait: window.innerHeight > window.innerWidth,
      });
    },
    [pathname, reduced, router],
  );

  /* The sweep. */
  useEffect(() => {
    if (!run) return;
    const red = redRef.current,
      dark = darkRef.current;
    if (!red || !dark) return;
    const L = red.getTotalLength();
    let raf = 0;
    const t0 = performance.now();
    let pushedAt = 0,
      outAt = 0;

    /* Visible piece of a ribbon = [tail, head] along the path. */
    const draw = (el: SVGPathElement, tail: number, head: number) => {
      el.setAttribute("stroke-dasharray", `${Math.max(0, head - tail)} ${L * 3}`);
      el.setAttribute("stroke-dashoffset", String(-tail));
    };
    const placeCars = (head: number, show: boolean) => {
      const p = red.getPointAtLength(Math.min(L, head));
      const q = red.getPointAtLength(Math.min(L, head + 1));
      const dx = q.x - p.x,
        dy = q.y - p.y;
      const n = Math.hypot(dx, dy) || 1;
      const tx = dx / n,
        ty = dy / n;
      const ang = (Math.atan2(ty, tx) * 180) / Math.PI;
      CARS.forEach((c, i) => {
        const g = carRefs.current[i];
        if (!g) return;
        const a = (c.a * Math.PI) / 180;
        /* On the cap's arc, then pushed a little further ahead. */
        const r = WIDTH / 2;
        const ax = tx * Math.cos(a) * r - ty * Math.sin(a) * r;
        const ay = ty * Math.cos(a) * r + tx * Math.sin(a) * r;
        const x = p.x + ax + tx * (c.ahead + CAR_LEN * 0.35);
        const y = p.y + ay + ty * (c.ahead + CAR_LEN * 0.35);
        g.setAttribute("transform", `translate(${x} ${y}) rotate(${ang})`);
        g.setAttribute("opacity", show ? "1" : "0");
      });
    };
    const setLabel = (v: number) => {
      const el = labelRef.current;
      if (!el) return;
      el.style.opacity = String(v);
      el.style.transform = `translateY(${(1 - v) * 14}px)`;
    };

    const frame = (now: number) => {
      const e = now - t0;
      if (!outAt) {
        /* IN: heads advance; red leads, carbon follows. */
        const pr = easeInOut(clamp01(e / (IN_MS * (1 - LAG))));
        const pd = easeInOut(clamp01((e - IN_MS * LAG) / (IN_MS * (1 - LAG))));
        draw(red, 0, pr * L);
        draw(dark, 0, pd * L);
        placeCars(pr * L, pr < 1);
        setLabel(clamp01((e - IN_MS * 0.7) / 220));
        if (e >= IN_MS) {
          if (!pushedAt) {
            pushedAt = now;
            router.push(run.href);
          }
          /* Out once the new page is in and the name has been read. */
          const arrived = pathRef.current === run.href;
          const held = now - pushedAt;
          if ((arrived && held >= MIN_HOLD_MS) || held >= MAX_HOLD_MS) outAt = now;
        }
      } else {
        /* OUT: tails chase the heads off the end; carbon goes first. */
        const o = now - outAt;
        const pd = easeInOut(clamp01(o / (OUT_MS * (1 - LAG))));
        const pr = easeInOut(clamp01((o - OUT_MS * LAG) / (OUT_MS * (1 - LAG))));
        draw(dark, pd * L, L);
        draw(red, pr * L, L);
        setLabel(1 - clamp01(o / 200));
        if (o >= OUT_MS) {
          busy = false;
          setRun(null);
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    draw(red, 0, 0);
    draw(dark, 0, 0);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      busy = false;
    };
  }, [run, router]);

  return (
    <CinematicCtx.Provider value={{ play }}>
      {children}
      {run && (
        <div key={run.id} className="fixed inset-0 z-[300] cursor-wait" aria-hidden>
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={run.portrait ? `0 0 ${VB.h} ${VB.w}` : `0 0 ${VB.w} ${VB.h}`}
            preserveAspectRatio="xMidYMid slice"
          >
            <g transform={run.portrait ? `translate(${VB.h} 0) rotate(90)` : undefined}>
              <path
                ref={redRef}
                d={LINE}
                fill="none"
                stroke="#E10600"
                strokeWidth={WIDTH}
                strokeLinecap="round"
                strokeDasharray="0 99999"
              />
              <path
                ref={darkRef}
                d={LINE}
                fill="none"
                stroke="#0B0C0F"
                strokeWidth={WIDTH - 120}
                strokeLinecap="round"
                strokeDasharray="0 99999"
              />
              {CARS.map((c, i) => (
                <g
                  key={i}
                  ref={(el) => {
                    carRefs.current[i] = el;
                  }}
                  opacity={0}
                >
                  <TopCar color={c.color} accent={c.accent} />
                </g>
              ))}
            </g>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div ref={labelRef} className="flex flex-col items-center gap-3 text-center" style={{ opacity: 0 }}>
              <span className="eyebrow">Next up</span>
              <span className="font-display text-4xl font-black uppercase italic leading-none tracking-tight text-carbon-100 sm:text-6xl">
                {run.label}
              </span>
              <span className="h-[3px] w-16 bg-f1red" />
            </div>
          </div>
        </div>
      )}
    </CinematicCtx.Provider>
  );
}
