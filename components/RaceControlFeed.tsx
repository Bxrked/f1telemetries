"use client";

import { useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { rowReveal } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";

/**
 * Race control rail — flags, safety car, penalties, track limits.
 *
 * Chronological with newest at the bottom, so it reads like a timing
 * screen. Auto-scroll only follows the newest notice when the reader is
 * already parked at the bottom. Team radio lives in the race replay,
 * where a clip can play at the moment it was sent.
 */

/** Category → accent classes for the rule + tag. */
const CATEGORY_STYLE: Record<string, { rule: string; text: string; label: string }> = {
  red:     { rule: "bg-f1red",         text: "text-f1red-bright",  label: "Red flag" },
  sc:      { rule: "bg-sector-yellow", text: "text-sector-yellow", label: "Safety car" },
  vsc:     { rule: "bg-sector-yellow", text: "text-sector-yellow", label: "VSC" },
  penalty: { rule: "bg-sector-yellow", text: "text-sector-yellow", label: "Penalty" },
  limits:  { rule: "bg-carbon-600",    text: "text-carbon-300",    label: "Track limits" },
  yellow:  { rule: "bg-sector-yellow", text: "text-sector-yellow", label: "Yellow" },
  green:   { rule: "bg-sector-green",  text: "text-sector-green",  label: "Clear" },
  drs:     { rule: "bg-sector-green",  text: "text-sector-green",  label: "DRS" },
  info:    { rule: "bg-carbon-600",    text: "text-carbon-400",    label: "Control" },
};

const clock = (t: number) => new Date(t).toISOString().slice(11, 19);

export default function RaceControlFeed({ messages }: { messages: any[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const forceVisible = useForceVisible();

  /* Track whether the reader is parked at the bottom (40px of slack). */
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  /* Follow the newest notice ONLY when already at the bottom, so reading
     back through the race is never yanked away. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !atBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  if (!messages?.length) {
    return (
      <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 rounded-row bg-carbon-900/40 text-center">
        <p className="timing text-label text-carbon-400">No race control messages</p>
        <p className="max-w-xs text-data leading-relaxed text-carbon-400">Nothing was issued for this session.</p>
      </div>
    );
  }

  return (
    /* Flex column so the rail scrolls inside whatever height the panel
       gives it, instead of a fixed max-height. */
    <div className="flex h-full min-h-0 flex-col">
      <p className="timing mb-2 shrink-0 text-micro uppercase tracking-wider text-carbon-400">
        {messages.length} notices · oldest first
      </p>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto rounded-row border border-carbon-700 bg-carbon-900/40"
      >
        <ul className="divide-y divide-carbon-800">
          {messages.map((m, i) => {
            const cat = CATEGORY_STYLE[m.category] ?? CATEGORY_STYLE.info;
            return (
              <motion.li
                key={`${m.t}-${i}`}
                /* Stagger is capped in rowReveal, so a long race doesn't
                   cascade for seconds — only the first rows are delayed. */
                custom={i}
                variants={rowReveal}
                initial={forceVisible ? false : "hidden"}
                animate="show"
                className="flex items-start gap-3 px-3 py-2"
              >
                {/* Timing gutter — fixed width so bursts stay aligned */}
                <div className="timing w-14 shrink-0 pt-0.5 text-right">
                  <p className="text-data font-bold tabular-nums text-carbon-300">L{m.lap}</p>
                  <p className="text-micro tabular-nums text-carbon-400">{clock(m.t)}</p>
                </div>

                <span aria-hidden className={`mt-0.5 w-[3px] shrink-0 self-stretch ${cat.rule}`} />

                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className={`timing text-micro font-bold uppercase tracking-wider ${cat.text}`}>{cat.label}</span>
                  {m.code && (
                    <span className="timing text-micro font-bold tracking-wider" style={{ color: m.color ?? undefined }}>
                      {m.code}
                    </span>
                  )}
                  <p className="w-full break-words text-data leading-relaxed text-carbon-300">{m.message}</p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
