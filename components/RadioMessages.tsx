"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, RadioTower } from "lucide-react";
import { rowReveal, SPRING, PRESS } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";

/**
 * Radio & race control rail.
 *
 * Two row kinds, rendered honestly:
 *  - "radio"   — pit-wall audio. OpenF1 ships NO transcript, so these
 *                rows are a play button, not a quote.
 *  - "control" — race control notices, the only source with real text.
 *
 * Ordering is chronological with newest at the bottom, so the rail reads
 * like a timing screen. Auto-scroll only follows the newest message when
 * the user is already parked at the bottom.
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

export default function RadioMessages({ messages }: { messages: any[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const forceVisible = useForceVisible();

  /* Track whether the user is parked at the bottom. 40px of slack so a
     near-bottom position still counts as "following". */
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  /* Follow the newest message ONLY when already at the bottom, so reading
     back through the race is never yanked away. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !atBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const toggleClip = useCallback(
    (url: string) => {
      if (!audioRef.current) audioRef.current = new Audio();
      const el = audioRef.current;
      if (nowPlaying === url) {
        el.pause();
        setNowPlaying(null);
        return;
      }
      el.src = url;
      el.play().catch(() => setNowPlaying(null));
      setNowPlaying(url);
      el.onended = () => setNowPlaying(null);
    },
    [nowPlaying]
  );

  /* Never leave audio playing behind the panel. */
  useEffect(() => () => audioRef.current?.pause(), []);

  if (!messages?.length) {
    return (
      <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 rounded-row bg-carbon-900/40 text-center">
        <RadioTower size={20} className="text-carbon-600" />
        <p className="timing text-xs text-carbon-400">No radio or race control messages</p>
        <p className="max-w-xs text-[11px] leading-relaxed text-carbon-400">
          Nothing was broadcast for this session.
        </p>
      </div>
    );
  }

  const radioCount = messages.filter((m) => m.kind === "radio").length;

  return (
    /* Flex column so the rail scrolls inside whatever height the panel
       gives it, instead of a fixed max-height. */
    <div className="flex h-full min-h-0 flex-col">
      <p className="timing mb-2 flex shrink-0 flex-wrap items-center gap-x-2 text-micro uppercase tracking-wider text-carbon-400">
        <span>{messages.length} messages</span>
        <span className="text-carbon-600">·</span>
        <span>{radioCount} radio clips</span>
        <span className="text-carbon-600">·</span>
        <span>oldest first</span>
      </p>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto rounded-row border border-carbon-700 bg-carbon-900/40"
      >
        <ul className="divide-y divide-carbon-800">
          {messages.map((m, i) => {
            const isRadio = m.kind === "radio";
            const cat = CATEGORY_STYLE[m.category] ?? CATEGORY_STYLE.info;
            const playing = isRadio && nowPlaying === m.url;

            return (
              <motion.li
                key={`${m.t}-${i}`}
                /* Stagger is capped in rowReveal, so a 116-row race doesn't
                   cascade for four seconds — only the first rows are delayed. */
                custom={i}
                variants={rowReveal}
                initial={forceVisible ? false : "hidden"}
                animate="show"
                className="flex items-start gap-3 px-3 py-2 transition-colors duration-micro ease-out-expo hover:bg-carbon-800/40"
              >
                {/* Timing gutter — fixed width so bursts stay aligned */}
                <div className="timing w-14 shrink-0 pt-0.5 text-right">
                  <p className="text-[11px] font-bold tabular-nums text-carbon-300">L{m.lap}</p>
                  <p className="text-[9px] tabular-nums text-carbon-400">{clock(m.t)}</p>
                </div>

                {/* Colour anchor: team colour for radio, category for control */}
                <span
                  aria-hidden
                  className={`mt-0.5 w-[3px] shrink-0 self-stretch rounded-full ${isRadio ? "" : cat.rule}`}
                  style={isRadio ? { backgroundColor: m.color } : undefined}
                />

                <div className="min-w-0 flex-1">
                  {isRadio ? (
                    <div className="flex items-center gap-2">
                      <span
                        className="timing text-xs font-bold tracking-wider"
                        style={{ color: m.color }}
                      >
                        {m.code}
                      </span>
                      <span className="truncate text-[11px] text-carbon-400">{m.name}</span>
                      <motion.button
                        type="button"
                        whileTap={PRESS}
                        transition={SPRING.press}
                        onClick={() => toggleClip(m.url)}
                        aria-label={`${playing ? "Pause" : "Play"} team radio from ${m.name}, lap ${m.lap}`}
                        className="ml-auto flex shrink-0 items-center gap-1.5 rounded border border-carbon-600 bg-carbon-800
                          px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-carbon-300
                          transition-colors hover:border-f1red/60 hover:text-f1red-bright"
                      >
                        {playing ? <Pause size={11} /> : <Play size={11} />}
                        {playing ? "Playing" : "Radio"}
                      </motion.button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className={`timing text-[9px] font-bold uppercase tracking-wider ${cat.text}`}>
                        {cat.label}
                      </span>
                      {m.code && (
                        <span
                          className="timing text-[10px] font-bold tracking-wider"
                          style={{ color: m.color ?? undefined }}
                        >
                          {m.code}
                        </span>
                      )}
                      <p className="w-full break-words text-[11px] leading-relaxed text-carbon-300">
                        {m.message}
                      </p>
                    </div>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
