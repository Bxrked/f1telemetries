"use client";

import { AnimatePresence, motion } from "framer-motion";
import { EASE } from "@/lib/motion";

/**
 * Split-flap style readout: each character sits in its own fixed slot, and
 * only the slots whose character changed roll. A ticking countdown then
 * moves one digit a second instead of re-rendering the whole string, which
 * is what a timing board does.
 *
 * Reduced motion: MotionConfig drops the transform, leaving a plain swap.
 */
export default function RollingDigits({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex tabular-nums ${className}`} aria-label={text} role="text">
      {text.split("").map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className="relative inline-block overflow-hidden"
          /* Digits get a fixed slot so the string never reflows mid-roll;
             separators keep their natural width. */
          style={{ width: /\d/.test(ch) ? "1ch" : undefined }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch}
              className="inline-block"
              initial={{ y: "-100%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE.out }}
            >
              {ch === " " ? " " : ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
