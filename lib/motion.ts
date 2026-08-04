/**
 * Motion system — the single source of truth for every animation.
 *
 * Rules encoded here, so no component invents its own numbers:
 *  - Spring physics for anything spatial; cubic-bezier only for fades.
 *  - Entrances ease OUT (fast start, soft landing). Exits ease IN and run
 *    ~65% of the entrance duration, so dismissal feels responsive.
 *  - NO overshoot/bounce on data rows. On dense informational UI the
 *    wobble reads as sloppy, not playful.
 *  - Stagger is capped: a 116-row radio rail must not cascade for 4
 *    seconds. Only the first STAGGER_CAP rows are delayed; the rest snap
 *    in, which is indistinguishable once they're below the fold.
 *  - Reduced motion is handled globally by <MotionConfig reducedMotion="user">
 *    in app/layout.tsx, on top of the CSS block in globals.css.
 */

import type { Transition, Variants } from "framer-motion";

/** Expo-style curves. `out` for entrances, `in` for exits. */
export const EASE = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  in: [0.7, 0, 0.84, 0] as [number, number, number, number],
};

/** Durations in seconds. Micro-interactions 150–250ms, layout 300–400ms. */
export const DUR = {
  hover: 0.15,
  micro: 0.18,
  layout: 0.35,
  exit: 0.12,
};

export const SPRING = {
  /** Layout + shared-element moves. Settles ~350ms, no visible overshoot. */
  panel: { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.9 },
  /** Press feedback. Snappier, tighter. */
  press: { type: "spring" as const, stiffness: 400, damping: 25 },
};

/** Per-row stagger step, and the row index past which delay stops growing. */
export const STAGGER = 0.035;
export const STAGGER_CAP = 14;

/** Delay for row `i`, flattened past the cap so long lists stay fast. */
export const rowDelay = (i: number) => Math.min(i, STAGGER_CAP) * STAGGER;

/**
 * Shared viewport config: animate once, and start slightly before the
 * element is fully on screen so it's settled by the time it's read.
 */
export const VIEWPORT = { once: true, margin: "-60px 0px" };

/** Panel / card reveal. Used by the shared Panel shell. */
export const panelReveal: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.layout, ease: EASE.out },
  },
};

/** List row reveal. Pass the row index as a custom prop. */
export const rowReveal: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DUR.micro, ease: EASE.out, delay: rowDelay(i) },
  }),
};

/** Content swap inside a container that keeps its own box. */
export const crossfade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DUR.micro, ease: EASE.out } },
  exit: { opacity: 0, transition: { duration: DUR.exit, ease: EASE.in } },
};

/** Standard press feedback for buttons and tappable cards. */
export const PRESS = { scale: 0.97 };
