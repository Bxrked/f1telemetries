"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { floorIndex } from "@/services/replayModel";
import { EVENT_COLOR } from "./ReplayTimeline";

const TYPE_LABEL: Record<string, string> = {
  start: "Start",
  overtake: "Overtake",
  sc: "Safety car",
  "sc-end": "Green",
  vsc: "VSC",
  "vsc-end": "Green",
  red: "Red flag",
  "red-end": "Restart",
  pit: "Pit",
  fastest: "Fastest lap",
  retired: "Retired",
  penalty: "Penalty",
  chequered: "Finish",
  radio: "Team radio",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "racing", label: "Racing", types: ["overtake", "fastest", "start", "chequered"] },
  { key: "incidents", label: "Incidents", types: ["sc", "sc-end", "vsc", "vsc-end", "red", "red-end", "retired", "penalty"] },
  { key: "pit", label: "Pits", types: ["pit"] },
  { key: "radio", label: "Radio", types: ["radio"] },
] as const;

/**
 * Race event log. Everything up to the playhead is lit; what's still to
 * come is dimmed, so the list doubles as a "what's next" preview. The
 * list follows the playhead unless the reader has scrolled away — then
 * it waits until they come back.
 */
export default function EventFeed({
  data,
  t,
  onJump,
  playingUrl,
}: {
  data: any;
  t: number;
  onJump: (e: any) => void;
  /** Team radio clip playing now, if any. */
  playingUrl: string | null;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const listRef = useRef<HTMLOListElement>(null);
  const follow = useRef(true);

  const events = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) as any;
    return f?.types ? data.events.filter((e: any) => f.types.includes(e.type)) : data.events;
  }, [data, filter]);
  const times = useMemo(() => events.map((e: any) => e.t), [events]);
  const current = floorIndex(times, t);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !follow.current || current < 0) return;
    const row = list.children[current] as HTMLElement | undefined;
    if (row) list.scrollTo({ top: row.offsetTop - list.clientHeight / 2, behavior: "smooth" });
  }, [current]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Five filters in a ~230px column: labels size to their text rather
          than equal slots, and the bar scrolls rather than clip if a
          narrow screen can't fit them. */}
      <div className="mb-1.5 flex shrink-0 gap-0.5 overflow-x-auto rounded-row border border-carbon-700 bg-carbon-900 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`timing flex-auto whitespace-nowrap rounded-[3px] px-0.5 py-0.5 text-micro font-bold uppercase transition-colors duration-micro
              ${filter === f.key ? "bg-carbon-600 text-white" : "text-carbon-400 hover:text-carbon-100"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ol
        ref={listRef}
        className="relative min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => {
          /* Follow only while the current row is in view. */
          const list = e.currentTarget;
          const row = list.children[current] as HTMLElement | undefined;
          if (!row) return;
          follow.current = row.offsetTop >= list.scrollTop - 40 && row.offsetTop <= list.scrollTop + list.clientHeight + 40;
        }}
      >
        {events.map((e: any, i: number) => {
          const past = i <= current;
          const now = i === current;
          const isRadio = e.type === "radio";
          const playing = isRadio && playingUrl === e.url;
          /* Radio rows wear the team's colour; the rest their event colour. */
          const color = isRadio ? data.drivers[e.nums[0]]?.teamColor ?? EVENT_COLOR.radio : EVENT_COLOR[e.type];
          return (
            <li key={`${e.t}-${i}`}>
              <button
                type="button"
                onClick={() => onJump(e)}
                className={`group flex w-full items-start gap-2 border-b border-carbon-800/80 px-1.5 py-1.5 text-left transition-colors duration-micro hover:bg-carbon-800/60
                  ${now ? "bg-carbon-800/70" : ""}`}
              >
                <span className={`timing w-7 shrink-0 pt-px text-right text-micro ${past ? "text-carbon-300" : "text-carbon-500"}`}>
                  L{e.lap}
                </span>
                <span
                  className="mt-0.5 h-3.5 w-[3px] shrink-0 transition-opacity duration-micro"
                  style={{ background: color, opacity: past ? 1 : 0.35 }}
                />
                <span className="min-w-0">
                  <span
                    className="timing block text-micro font-bold uppercase tracking-wider transition-colors duration-micro"
                    style={{ color: past ? color : "#434D5E" }}
                  >
                    {TYPE_LABEL[e.type] ?? e.type}
                  </span>
                  <span className={`block truncate text-data transition-colors duration-micro ${past ? "text-carbon-100" : "text-carbon-500"}`}>
                    {e.label}
                  </span>
                </span>
                {isRadio && (
                  <span
                    aria-label={playing ? "Stop clip" : "Play clip"}
                    className={`ml-auto mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-row border transition-colors duration-micro
                      ${playing ? "border-carbon-400 bg-carbon-700 text-carbon-100" : "border-carbon-700 text-carbon-400 group-hover:border-carbon-600 group-hover:text-carbon-100"}`}
                  >
                    {playing ? <Square size={9} fill="currentColor" /> : <Play size={10} className="translate-x-px" />}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
