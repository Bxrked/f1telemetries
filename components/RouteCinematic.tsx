"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";

/**
 * Camera transitions anchored to the car on the landing page.
 *
 * Navigation is a physical move through the machine rather than a page
 * swap: clicking a destination pushes the camera INTO the part of the car
 * that owns it, and the car scales past the viewport as the screen takes
 * over. Coming back to "/" reverses the move — the camera pulls out of
 * that same part and the car reassembles around it.
 *
 * The focus points below are percentages of the F1Car viewBox (420×130),
 * so they stay locked to the right bodywork at any render size.
 */

/**
 * Anchors as percentages of the hero box, targeting bodywork in the
 * RESTING side-profile photograph (public/2nd.webp). The car in that
 * frame faces right: rear wing far left, nose and front wing right.
 *
 * Percentages resolve against the element carrying transformOrigin, NOT
 * its children — an earlier version anchored a wrapper wider than the car
 * inside it and every dive missed. CarHero's box uses the resting image's
 * native ratio so there are no letterbox bars to shift these values.
 *
 * Tuning: read off the photo by eye. If a dive lands off the part it
 * names, nudge the pair below — nothing else needs to change.
 */
/* Vertical values account for CarHero's 2.35:1 centred crop: the frame
   shows 1.724/2.35 ≈ 73.4% of the image's height, so an image fraction y
   maps to (y − 0.133) / 0.734 within the box. Horizontal is unaffected. */
export const CAR_FOCUS: Record<string, { origin: string; part: string; label: string }> = {
  /* Engine cover / airbox, behind the driver — image y 46% */
  "/telemetry": { origin: "45% 44.6%", part: "Power unit", label: "Post-Race Telemetry" },
  /* Cockpit opening under the halo — image y 50% (crop keeps centre at centre) */
  "/compare": { origin: "58% 50%", part: "Cockpit", label: "Head-to-Head" },
  /* Sidepod inlet, ahead of the rear tyre — image y 58% */
  "/live": { origin: "42% 60.9%", part: "Sidepod", label: "Live Race" },
};

/** Where the camera should pull back FROM when arriving at "/". */
export const ZOOM_OUT_KEY = "f1cinematic:zoomOutOrigin";

type Zoom = { origin: string; part: string; label: string } | null;
type Ctx = { play: (href: string, label?: string) => void; zoom: Zoom };

const CinematicCtx = createContext<Ctx>({ play: () => {}, zoom: null });
export const useCinematic = () => useContext(CinematicCtx);

/** Camera dive duration; navigation fires just before the end. */
const DIVE_MS = 1150;

export default function RouteCinematic({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [zoom, setZoom] = useState<Zoom>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    []
  );

  const play = useCallback(
    (href: string, label?: string) => {
      if (href === pathname) return;

      /* Reduced motion: no camera work at all, just go. */
      if (reduced) {
        router.push(href);
        return;
      }

      /* Heading home → hand the pull-out to the landing page, which knows
         how to reassemble the car around the point we left from. */
      if (href === "/") {
        const from = CAR_FOCUS[pathname]?.origin;
        try {
          if (from) sessionStorage.setItem(ZOOM_OUT_KEY, from);
        } catch {
          /* private mode — the car simply fades in instead */
        }
        router.push(href);
        return;
      }

      const focus = CAR_FOCUS[href];
      /* No mapped bodywork for this route: plain navigation. */
      if (!focus) {
        router.push(href);
        return;
      }

      /* The dive plays every time. It IS the navigation metaphor here, not
         a splash screen — skipping it on repeat visits would make the
         spatial relationship feel broken rather than considered. */
      setZoom({ ...focus, label: label ?? focus.label });
      router.prefetch?.(href);
      timers.current.push(setTimeout(() => router.push(href), DIVE_MS));
      timers.current.push(setTimeout(() => setZoom(null), DIVE_MS + 550));
    },
    [pathname, reduced, router]
  );

  return (
    <CinematicCtx.Provider value={{ play, zoom }}>
      {children}

      {/* Blackout that closes over the dive, so the destination is never
          seen assembling behind a half-scaled car. */}
      <AnimatePresence>
        {zoom && (
          <motion.div
            key="dive"
            className="pointer-events-none fixed inset-0 z-[100] bg-carbon-950"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4, ease: EASE.out } }}
            transition={{ duration: 0.5, ease: EASE.in, delay: 0.55 }}
            aria-hidden
          >
            {/* Readout appears only once the camera is inside the bodywork */}
            <motion.div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: 0.95 }}
            >
              <p className="eyebrow">{zoom.part}</p>
              <p className="font-display text-2xl font-black uppercase italic tracking-tight text-carbon-100 sm:text-4xl">
                {zoom.label}
              </p>
              <span className="mt-2 h-px w-24 overflow-hidden bg-carbon-700">
                <motion.span
                  className="block h-full bg-f1red"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.4, ease: EASE.out, delay: 1 }}
                />
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </CinematicCtx.Provider>
  );
}
