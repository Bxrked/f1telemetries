"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";

/**
 * A number that counts up from zero the first time it scrolls into view.
 *
 * Only for headline figures — a stat that is read once, like a lap count
 * or a points total. Table cells and anything the eye compares across rows
 * stay static: a column of moving digits is noise, not information.
 *
 * Renders the final value outright under reduced motion, or when the
 * motion probe says reveals can't be trusted (see MotionProvider).
 */
export default function CountUp({
  value,
  decimals = 0,
  duration = 0.9,
  delay = 0,
  className = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px 0px" });
  const reduced = useReducedMotion();
  const forceVisible = useForceVisible();
  const still = reduced || forceVisible || !Number.isFinite(value);
  const [shown, setShown] = useState(still ? value : 0);

  useEffect(() => {
    if (still) {
      setShown(value);
      return;
    }
    if (!inView) return;
    const controls = animate(0, value, {
      duration,
      delay,
      ease: EASE.out,
      onUpdate: setShown,
    });
    return () => controls.stop();
  }, [inView, still, value, duration, delay]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {shown.toFixed(decimals)}
    </span>
  );
}
