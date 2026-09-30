"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { F1_MARK } from "@/lib/f1Mark";
import { isAppMounted } from "./MotionProvider";

/**
 * Homepage intro — the F1 mark as a window onto the hero footage.
 *
 *   0.3–1.1 s  the mark wipes in left→right along its own slant; its
 *              letterforms are a HOLE in a black layer, so what fills them
 *              is the real hero video underneath (car against the light
 *              panel). A red streak rides the wipe edge.
 *   1.05–1.45  "TELEMETRIES" slides out beside it.
 *   1.7–2.6    fly-through: the hole scales ~70x around a point inside
 *              the "1" until the black layer is gone, while the footage
 *              swings into its three-quarter view.
 *
 * When it plays: only when the home page is the page someone LANDS on,
 * once per tab session. Never after in-app navigation (the overlay only
 * renders during the document's first hydration — see isAppMounted), never
 * on a reload in the same tab, never with reduced motion, never in a
 * background tab. Any click, key, scroll or touch skips it.
 *
 * It doubles as the hero loader: the wipe waits until the video can play
 * (at most MAX_VIDEO_WAIT), so the footage is ready when the window opens.
 */

const SEEN_KEY = "f1intro:seen";
const T = { wipeStart: 300, wipeEnd: 1100, wordStart: 1050, wordEnd: 1450, flyStart: 1700, flyEnd: 2600 };
const MAX_VIDEO_WAIT = 1500;
const FAILSAFE_MS = 7000;
const FLY_SCALE = 70;
/* The strokes lean at this run over the mark's full height (logo units). */
const SLANT = 175;
/* Where the car sits in frame 0 of car-reveal.mp4 (2560x1440), as
   fractions of the frame — measured, since the source has black bars
   baked in and the car sits low. During the wipe the video is moved and
   scaled so the car lies inside the mark (a touch wider, so the nose and
   rear wing reach the ends of the letterforms). */
const VIDEO_ASPECT = 2560 / 1440;
const CAR = { cx: 0.497, cy: 0.626, w: 0.469 };
const CAR_OVERFILL = 1.08;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

type Phase = "decide" | "play" | "done";

/* Decided once per page load and remembered. Deciding inside an effect
   each time broke under React's dev double-invoke: the first run marked
   the visit seen, the second saw the mark and skipped its own intro. */
let decision: "play" | "skip" | null = null;
function decideOnce(): "play" | "skip" {
  if (decision) return decision;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let seen = false;
  try {
    seen = sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    /* storage blocked — treat as first visit */
  }
  decision =
    reduced || seen || document.visibilityState !== "visible" || window.location.pathname !== "/" ? "skip" : "play";
  if (decision === "play") {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* fine */
    }
  }
  return decision;
}

export default function HomeIntro({ onDone }: { onDone: () => void }) {
  /* Server render and the first hydration render agree on "decide" (a
     plain black layer), so there's no flash of the page before the intro.
     After in-app navigation the app is already mounted → straight to done. */
  const [phase, setPhase] = useState<Phase>(() => (typeof window === "undefined" || !isAppMounted() ? "decide" : "done"));
  const [box, setBox] = useState<{ vw: number; vh: number } | null>(null);
  const [wordW, setWordW] = useState(0);

  const wipeRef = useRef<SVGPolygonElement>(null);
  const streakRef = useRef<SVGPolygonElement>(null);
  const flyRef = useRef<SVGGElement>(null);
  const outlineRef = useRef<SVGGElement>(null);
  const shadeRef = useRef<SVGRectElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const skipAt = useRef<number | null>(null);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setPhase("done");
  }, []);

  /* Tell the page once we're out of the way (or were never needed). */
  useEffect(() => {
    if (phase === "done") onDone();
  }, [phase, onDone]);

  /* Decide whether to play. */
  useEffect(() => {
    if (phase !== "decide") return;
    if (decideOnce() === "skip") finish();
    else setPhase("play");
  }, [phase, finish]);

  /* Viewport size (the SVG works in screen pixels). */
  useLayoutEffect(() => {
    if (phase !== "play") return;
    const measure = () => setBox({ vw: window.innerWidth, vh: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [phase]);

  /* Lockup geometry: mark + wordmark centred as one unit. Narrow screens
     show the mark alone — the wordmark wouldn't fit beside it. */
  const narrow = (box?.vw ?? 1000) < 640;
  const markW = box ? Math.min(560, Math.max(180, box.vw * (narrow ? 0.62 : 0.34))) : 0;
  const k = markW / F1_MARK.w;
  const markH = F1_MARK.h * k;
  const gap = narrow ? 0 : markH * 0.3;
  const total = markW + (narrow ? 0 : gap + wordW);
  const markX = box ? (box.vw - total) / 2 : 0;
  const markY = box ? box.vh / 2 - markH / 2 : 0;
  const ox = markX + F1_MARK.flyOrigin[0] * k;
  const oy = markY + F1_MARK.flyOrigin[1] * k;

  useLayoutEffect(() => {
    if (wordRef.current) setWordW(wordRef.current.offsetWidth);
  }, [box]);

  /* The timeline: one rAF clock writing SVG attributes directly. */
  useEffect(() => {
    if (phase !== "play" || !box) return;
    const video = document.querySelector<HTMLVideoElement>("video[data-hero]");
    let raf = 0;
    let start: number | null = null;
    let videoStarted = false;
    const mountedAt = performance.now();
    const failsafe = setTimeout(finish, FAILSAFE_MS);

    /* Framing that puts the car inside the mark. The video element fills
       the viewport with object-fit: cover, so work out where the car lands
       on screen, then scale about that point and move it to the mark. */
    const { vw, vh } = box;
    const cover = Math.max(vw / VIDEO_ASPECT, vh) / vh; // displayed height / vh
    const Dh = vh * cover, Dw = Dh * VIDEO_ASPECT;
    const x0 = (vw - Dw) / 2, y0 = (vh - Dh) / 2;
    const carX = x0 + CAR.cx * Dw, carY = y0 + CAR.cy * Dh;
    const fit = (markW * CAR_OVERFILL) / (CAR.w * Dw);
    const toX = markX + markW / 2 - carX, toY = markY + markH / 2 - carY;
    /* object-fit: cover crops the picture to the element's box, and a
       transform scales the CROPPED box — on a portrait phone that leaves
       only the middle of the car. So while the intro owns the video, size
       the element to the whole picture (same on-screen result, nothing
       cropped), and put the page's styles back when it's done. */
    const unclip = () => {
      if (!video) return;
      Object.assign(video.style, {
        position: "absolute", left: `${x0}px`, top: `${y0}px`,
        width: `${Dw}px`, height: `${Dh}px`, maxWidth: "none",
      });
    };
    const restore = () => {
      if (!video) return;
      for (const k of ["position", "left", "top", "width", "height", "maxWidth", "transform", "transformOrigin"] as const) {
        video.style[k] = "";
      }
    };
    const frameVideo = (f: number) => {
      /* f = 1: car framed in the mark; f = 0: the page's normal framing. */
      if (!video) return;
      if (f <= 0) {
        restore();
        return;
      }
      video.style.transformOrigin = `${CAR.cx * Dw}px ${CAR.cy * Dh}px`;
      video.style.transform = `translate(${toX * f}px, ${toY * f}px) scale(${1 + (fit - 1) * f})`;
    };
    unclip();
    frameVideo(1);

    const wipePoly = (p: number) => {
      /* Leading edge leans like the strokes: bottom at xb, top at xb+SLANT. */
      const xb = -SLANT + p * (F1_MARK.w + SLANT);
      return { xb, xt: xb + SLANT };
    };

    const frame = (now: number) => {
      /* Hold on black until the footage can play (or we stop waiting). */
      if (start == null) {
        const ready = !video || video.readyState >= 3 || now - mountedAt > MAX_VIDEO_WAIT;
        if (!ready) {
          raf = requestAnimationFrame(frame);
          return;
        }
        start = now;
      }
      let e = now - start;
      if (skipAt.current != null) e = Math.max(e, T.flyEnd - 250 + (now - skipAt.current));

      if (!videoStarted && e >= T.wipeStart) {
        videoStarted = true;
        if (video) {
          try {
            video.currentTime = 0;
          } catch {
            /* not seekable yet — it'll just play from where it is */
          }
          video.play().catch(() => {});
        }
      }

      /* Wipe */
      const p = easeInOut(clamp01((e - T.wipeStart) / (T.wipeEnd - T.wipeStart)));
      const { xb, xt } = wipePoly(p);
      wipeRef.current?.setAttribute("points", `-400,-40 ${xt},-40 ${xb},${F1_MARK.h + 40} -400,${F1_MARK.h + 40}`);
      const streakW = 7;
      streakRef.current?.setAttribute("points", `${xt},-12 ${xt + streakW},-12 ${xb + streakW},${F1_MARK.h + 12} ${xb},${F1_MARK.h + 12}`);
      streakRef.current?.setAttribute("opacity", String(e < T.wipeStart ? 0 : 1 - clamp01((e - T.wipeEnd + 60) / 260)));

      /* Wordmark */
      if (wordRef.current) {
        const w = easeOut(clamp01((e - T.wordStart) / (T.wordEnd - T.wordStart)));
        const out = clamp01((e - T.flyStart) / 220);
        wordRef.current.style.clipPath = `inset(0 ${(1 - w) * 100}% 0 0)`;
        wordRef.current.style.transform = `translateX(${(1 - w) * -12}px)`;
        wordRef.current.style.opacity = String(1 - out);
      }

      /* Red outline keeps the mark reading as F1 red while it's footage. */
      outlineRef.current?.setAttribute("opacity", String(0.85 * (1 - clamp01((e - T.flyStart) / 260))));

      /* Fly-through: exponential scale so the zoom feels even. The footage
         eases back to its normal framing as we pass through the mark. */
      const q = easeIn(clamp01((e - T.flyStart) / (T.flyEnd - T.flyStart)));
      frameVideo(1 - easeInOut(clamp01((e - T.flyStart) / (T.flyEnd - T.flyStart))));
      const s = Math.pow(FLY_SCALE, q);
      flyRef.current?.setAttribute("transform", `translate(${ox} ${oy}) scale(${s}) translate(${-ox} ${-oy})`);
      /* Belt and braces: fade the last of the black as the zoom lands. */
      shadeRef.current?.setAttribute("opacity", String(1 - clamp01((e - (T.flyEnd - 160)) / 160)));

      if (e >= T.flyEnd) {
        frameVideo(0);
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    /* Skip on any intent to use the page. */
    const skip = () => {
      if (skipAt.current == null) skipAt.current = performance.now();
      if (video && video.paused) video.play().catch(() => {});
    };
    const opts = { passive: true } as AddEventListenerOptions;
    window.addEventListener("pointerdown", skip, opts);
    window.addEventListener("keydown", skip);
    window.addEventListener("wheel", skip, opts);
    window.addEventListener("touchstart", skip, opts);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failsafe);
      frameVideo(0);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchstart", skip);
    };
  }, [phase, box, ox, oy, finish]);

  if (phase === "done") return null;

  /* Before we know the viewport (and on the server): plain black. */
  if (phase === "decide" || !box) {
    return <div className="fixed inset-0 z-[200] bg-black" aria-hidden />;
  }

  const { vw, vh } = box;
  const place = `translate(${markX} ${markY}) scale(${k})`;

  return (
    <div ref={rootRef} className="fixed inset-0 z-[200] cursor-default" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" width={vw} height={vh}>
        <defs>
          {/* In logo units — the clip is applied inside the placed group. */}
          <clipPath id="f1i-wipe">
            <polygon ref={wipeRef} points="-400,-40 -400,-40 -400,246 -400,246" />
          </clipPath>
          <mask id="f1i-hole" maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
            <rect width={vw} height={vh} fill="white" />
            <g ref={flyRef}>
              <g transform={place}>
                <path d={F1_MARK.d} fill="black" clipPath="url(#f1i-wipe)" />
              </g>
            </g>
          </mask>
          <filter id="f1i-glow" x="-50%" y="-10%" width="200%" height="120%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect ref={shadeRef} width={vw} height={vh} fill="#000" mask="url(#f1i-hole)" />

        {/* Faint red outline of the mark + the streak on the wipe edge. */}
        <g ref={outlineRef} transform={place}>
          <path
            d={F1_MARK.d}
            fill="none"
            stroke="#E10600"
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
            clipPath="url(#f1i-wipe)"
          />
          <polygon ref={streakRef} points="0,0 0,0 0,0 0,0" fill="#FF1E00" opacity={0} filter="url(#f1i-glow)" />
        </g>
      </svg>

      {!narrow && (
        <div
          ref={wordRef}
          className="absolute whitespace-nowrap font-display font-bold uppercase leading-none tracking-[0.18em] text-carbon-100"
          style={{
            left: markX + markW + gap,
            top: vh / 2,
            fontSize: markH * 0.34,
            marginTop: -(markH * 0.34) / 2,
            clipPath: "inset(0 100% 0 0)",
          }}
        >
          Telemetries
        </div>
      )}
    </div>
  );
}
