"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { floorIndex } from "@/services/replayModel";

/** Event → marker colour. Only events worth scanning for sit on the bar. */
export const EVENT_COLOR: Record<string, string> = {
  start: "#E7EAF0",
  overtake: "#2EE07C",
  sc: "#FFD644",
  vsc: "#FFD644",
  red: "#FF1E00",
  "sc-end": "#8B95A7",
  "vsc-end": "#8B95A7",
  "red-end": "#8B95A7",
  pit: "#8B95A7",
  fastest: "#B44CFF",
  retired: "#FF1E00",
  penalty: "#3B9BFF",
  chequered: "#E7EAF0",
  radio: "#8B95A7",
};
const ON_BAR = new Set(["overtake", "fastest", "retired", "penalty", "red"]);

/**
 * Race scrubber. Drag anywhere to seek; neutralisations are shaded
 * behind the bar, lap marks run underneath, and notable events stand
 * above it as ticks you can click to jump to.
 */
export default function ReplayTimeline({
  data,
  t,
  from,
  to,
  onSeek,
  onRadio,
  playingUrl,
}: {
  data: any;
  t: number;
  from: number;
  to: number;
  onSeek: (t: number) => void;
  onRadio: (e: any) => void;
  playingUrl: string | null;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const tl = data.timeline;
  const span = to - from || 1;
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - from) / span) * 100))}%`;

  const tAt = useCallback(
    (clientX: number) => {
      const r = barRef.current!.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      return { x: f * r.width, t: from + f * span };
    },
    [from, span]
  );

  const markers = useMemo(() => data.events.filter((e: any) => ON_BAR.has(e.type)), [data]);
  const radioMarks = useMemo(() => data.events.filter((e: any) => e.type === "radio"), [data]);
  const eventTimes = useMemo(() => markers.map((e: any) => e.t), [markers]);

  /* Hover readout: lap under the cursor and the nearest marker, if close. */
  const hoverInfo = useMemo(() => {
    if (!hover) return null;
    const lap = tl.lapAt(hover.t);
    const i = floorIndex(eventTimes, hover.t);
    const near = [markers[i], markers[i + 1]]
      .filter(Boolean)
      .sort((a: any, b: any) => Math.abs(a.t - hover.t) - Math.abs(b.t - hover.t))[0];
    const px = barRef.current ? barRef.current.getBoundingClientRect().width / span : 0;
    return { lap, event: near && Math.abs(near.t - hover.t) * px < 6 ? near : null };
  }, [hover, tl, eventTimes, markers, span]);

  const lapMarks = useMemo(() => {
    const out: { n: number; t: number }[] = [];
    tl.lapNumbers.forEach((n: number, i: number) => {
      if (n === 1 || n % 5 === 0) out.push({ n, t: tl.leaderStarts[i] });
    });
    return out;
  }, [tl]);

  return (
    <div className="select-none">
      {/* Event ticks */}
      <div className="relative h-3.5">
        {markers.map((e: any, i: number) => (
          <button
            key={i}
            type="button"
            onClick={() => onSeek(e.t - 4000)}
            aria-label={`Lap ${e.lap}: ${e.label}`}
            className="absolute bottom-0 h-2.5 w-[3px] -translate-x-1/2 origin-bottom transition-transform duration-micro hover:scale-y-150"
            style={{ left: pct(e.t), background: EVENT_COLOR[e.type] }}
          />
        ))}
      </div>

      {/* Bar */}
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label="Race timeline"
        aria-valuemin={1}
        aria-valuemax={tl.totalLaps}
        aria-valuenow={tl.lapAt(t)}
        aria-valuetext={`Lap ${tl.lapAt(t)} of ${tl.totalLaps}`}
        className="group relative h-6 cursor-pointer touch-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDragging(true);
          onSeek(tAt(e.clientX).t);
        }}
        onPointerMove={(e) => {
          const h = tAt(e.clientX);
          setHover(h);
          if (dragging) onSeek(h.t);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onPointerLeave={() => !dragging && setHover(null)}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden bg-carbon-800 transition-[height] duration-micro group-hover:h-2">
          {/* Neutralisation bands */}
          {data.status.map((s: any, i: number) => (
            <span
              key={i}
              className="absolute inset-y-0"
              style={{
                left: pct(s.from),
                width: `calc(${pct(s.to)} - ${pct(s.from)})`,
                background:
                  s.type === "red"
                    ? "rgba(255,30,0,0.55)"
                    : s.type === "vsc"
                      ? "repeating-linear-gradient(90deg, rgba(255,214,68,0.5) 0 4px, transparent 4px 7px)"
                      : "rgba(255,214,68,0.5)",
              }}
            />
          ))}
          {/* Played portion */}
          <span className="absolute inset-y-0 left-0 bg-f1red/80" style={{ width: pct(t) }} />
        </div>

        {/* Playhead */}
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 bg-carbon-100 shadow-[0_0_0_2px_#08090C]"
          style={{ left: pct(t) }}
        />

        {/* Hover readout */}
        {hover && hoverInfo && (
          <span
            className="pointer-events-none absolute bottom-full mb-5 -translate-x-1/2 whitespace-nowrap rounded-row border border-carbon-600 bg-carbon-950/95 px-2 py-1 text-micro text-carbon-300 shadow-panel"
            style={{ left: hover.x }}
          >
            <span className="timing font-bold text-carbon-100">L{hoverInfo.lap}</span>
            {hoverInfo.event && <span className="ml-2">{hoverInfo.event.label}</span>}
          </span>
        )}
      </div>

      {/* Team radio: one team-coloured mark per clip, under the bar */}
      {radioMarks.length > 0 && (
        <div className="relative h-2.5">
          {radioMarks.map((e: any, i: number) => {
            const id = data.drivers[e.nums[0]] ?? {};
            const playing = playingUrl === e.url;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onRadio(e)}
                aria-label={`Lap ${e.lap}: ${id.code ?? ""} team radio`}
                title={`L${e.lap} · ${id.code ?? ""} radio`}
                className={`absolute top-0 w-[3px] -translate-x-1/2 origin-top transition-transform duration-micro hover:scale-y-150 ${playing ? "h-2.5" : "h-1.5"}`}
                style={{ left: pct(e.t), background: id.teamColor, opacity: playing ? 1 : 0.75 }}
              />
            );
          })}
        </div>
      )}

      {/* Lap marks */}
      <div className="relative h-4">
        {lapMarks.map((m) => (
          <span
            key={m.n}
            className="timing absolute top-0 -translate-x-1/2 text-micro text-carbon-500"
            style={{ left: pct(m.t) }}
          >
            L{m.n}
          </span>
        ))}
      </div>
    </div>
  );
}
