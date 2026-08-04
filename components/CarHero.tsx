"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Fullscreen car reveal.
 *
 * The camera move is baked into the footage, which is why this replaced
 * the two-still version — a real orbit needs real motion, and no amount
 * of 3D-transforming flat images produces one.
 *
 * Playback rules:
 *  - muted + playsInline + autoplay: the only combination browsers allow
 *    to start without a user gesture. Without `muted` autoplay is blocked.
 *  - Holds on the last frame instead of looping, so the page settles into
 *    a still hero rather than replaying forever in the corner of the eye.
 *  - Reduced motion: jumps straight to the final frame, no movement.
 */
export default function CarHero({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    if (reduced) {
      /* Seek to the end and hold — the reveal's destination, no motion. */
      const settle = () => {
        v.currentTime = Math.max(0, (v.duration || 0) - 0.05);
        v.pause();
      };
      if (v.readyState >= 1) settle();
      else v.addEventListener("loadedmetadata", settle, { once: true });
      return;
    }

    /* Autoplay can still be refused (power saving, strict settings). The
       poster frame stays up in that case rather than a blank box. */
    v.play().catch(() => {});
  }, [reduced]);

  return (
    <video
      ref={ref}
      className={`h-full w-full object-cover ${className}`}
      src="/car-reveal.mp4"
      muted
      playsInline
      autoPlay={!reduced}
      preload="auto"
      aria-label="Formula 1 car reveal"
    />
  );
}
