"use client";

import { ReactNode } from "react";

interface PanelProps {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Feed mode for THIS panel's data: "live" | "mock". */
  feed?: string;
}

/**
 * Shared card shell: carbon surface, hairline border, red pit-board notch.
 * Every dashboard module renders inside a Panel for strict scannability.
 */
export default function Panel({ eyebrow, title, action, children, className = "", feed }: PanelProps) {
  const isDemo = feed === "mock";
  return (
    <section
      className={`group relative overflow-hidden rounded-xl border bg-carbon-850 shadow-panel
        transition-colors duration-300 ${isDemo ? "border-sector-yellow/40" : "border-carbon-700 hover:border-carbon-600"} ${className}`}
    >
      {/* Notch — yellow when this panel is showing demo data */}
      <span
        className={`absolute left-0 top-5 h-8 w-[3px] rounded-r ${isDemo ? "bg-sector-yellow" : "bg-f1red shadow-red-glow"}`}
      />
      <header className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-carbon-100">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && (
            <span
              title="Live data unavailable for this section — showing built-in demo data. These numbers are NOT from the current race."
              className="timing shrink-0 rounded border border-sector-yellow/50 bg-sector-yellow/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sector-yellow"
            >
              Demo data
            </span>
          )}
          {action}
        </div>
      </header>
      <div className="px-6 pb-6">{children}</div>
    </section>
  );
}
