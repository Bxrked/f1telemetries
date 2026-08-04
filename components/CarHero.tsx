"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Source of the hero clip.
 *
 * public/ is gitignored — the footage is third-party media and doesn't
 * belong in a public repo — so a clone or CI build has no local file.
 * Set NEXT_PUBLIC_CAR_VIDEO_URL to a hosted copy (Vercel Blob, S3, any
 * CDN) and it's used instead; otherwise we fall back to the local path
 * for development.
 */
const VIDEO_SRC = process.env.NEXT_PUBLIC_CAR_VIDEO_URL || "/car-reveal.mp4";

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
  /* A missing clip must degrade to a designed backdrop, not a black void
     with buttons floating on it. */
  const [failed, setFailed] = useState(false);

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

  /* Fallback: a lit carbon backdrop rather than nothing. Keeps the page
     looking deliberate on any clone or deploy without the media. */
  if (failed) {
    return (
      <div
        className={`h-full w-full ${className}`}
        aria-hidden
        style={{
          background:
            "radial-gradient(120% 90% at 50% 8%, rgba(225,6,0,0.16), transparent 60%)," +
            "radial-gradient(80% 60% at 50% 100%, rgba(225,6,0,0.06), transparent 70%)," +
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 4px)",
        }}
      />
    );
  }

  return (
    <video
      ref={ref}
      className={`h-full w-full object-cover ${className}`}
      src={VIDEO_SRC}
      muted
      playsInline
      autoPlay={!reduced}
      preload="auto"
      onError={() => setFailed(true)}
      aria-label="Formula 1 car reveal"
    />
  );
}
