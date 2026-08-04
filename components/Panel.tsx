"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { panelReveal, VIEWPORT } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";

interface PanelProps {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Feed mode for THIS panel's data: "live" | "mock". */
  feed?: string;
  /** Stretch the body to the panel's full height (for fixed-height rows). */
  fill?: boolean;
}

/**
 * Shared card shell: carbon surface, hairline border, red pit-board notch.
 * Every dashboard module renders inside a Panel for strict scannability.
 *
 * Reveals once when scrolled into view. Panels above the fold animate on
 * mount; everything below cascades as you scroll, so the dashboard never
 * animates twelve sections at once.
 */
export default function Panel({ eyebrow, title, action, children, className = "", feed, fill }: PanelProps) {
  const isDemo = feed === "mock";
  const forceVisible = useForceVisible();
  return (
    <motion.section
      variants={panelReveal}
      /* Either IO drives the reveal, or we paint the final state outright.
         `initial={false}` is deliberate: it renders the "show" values on
         first paint with NO animation, so the panel appears even where
         requestAnimationFrame never ticks (non-compositing document) —
         animating a failsafe would just reintroduce the blank-page bug. */
      {...(forceVisible
        ? { initial: false as const, animate: "show" as const }
        : { initial: "hidden" as const, whileInView: "show" as const, viewport: VIEWPORT })}
      className={`group relative overflow-hidden rounded-panel border bg-carbon-850 shadow-panel
        transition-colors duration-micro ease-out-expo
        ${fill ? "flex flex-col" : ""}
        ${isDemo ? "border-sector-yellow/40" : "border-carbon-700 hover:border-carbon-600"} ${className}`}
    >
      {/* Notch — yellow when this panel is showing demo data */}
      <span
        className={`absolute left-0 top-4 h-7 w-[2px] rounded-r ${isDemo ? "bg-sector-yellow" : "bg-f1red"}`}
      />
      {/* Padding follows the data-dense dashboard spec (8–12px, not 20).
          Airy cards are the single biggest reason a data board reads as
          generic SaaS rather than an instrument. */}
      <header className="flex items-start justify-between gap-3 px-3 pb-1.5 pt-2.5">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="font-display text-base font-bold uppercase leading-none tracking-wide text-carbon-100">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && (
            <span
              title="Live data unavailable for this section — showing built-in demo data. These numbers are NOT from the current race."
              className="timing shrink-0 rounded-row border border-sector-yellow/50 bg-sector-yellow/10 px-1.5 py-0.5 text-micro font-bold uppercase tracking-wider text-sector-yellow"
            >
              Demo data
            </span>
          )}
          {action}
        </div>
      </header>
      {/* min-h-0 lets a scrolling child shrink inside the flex column
          instead of forcing the panel taller than its row. */}
      <div className={`px-3 pb-3 ${fill ? "min-h-0 flex-1" : ""}`}>{children}</div>
    </motion.section>
  );
}
