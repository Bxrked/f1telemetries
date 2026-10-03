"use client";

/**
 * The telemetry page's exhibits in ONE visual language.
 *
 * Every ranked comparison is the same row: face, code, a thin hard-edged
 * bar in the driver's team colour, the figure on the right. The fastest
 * of all is FIA purple, as on a timing screen. No chart library for these
 * — they are rows of rectangles, and drawing them directly keeps sectors,
 * speed traps, pace, pit stops and tyre stints looking like one
 * instrument instead of five widgets.
 *
 * Motion: a list cascades in when it scrolls into view (rows, then their
 * bars), and the purple row gets a brief wash once the cascade lands.
 * Figures never animate — they're read across rows. Nothing here reacts
 * to the pointer: rows are for reading, and a page that dims and lights
 * as the mouse crosses it was distracting.
 */

import { ReactNode, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { EASE, rowDelay } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";
import { formatClock, formatLapTime } from "@/services/format";
import { COMPOUND } from "@/lib/chartTheme";

export type People = Record<string, { thumb?: string | null; teamColor?: string; name?: string }>;

const PURPLE = "#B44CFF";
const GREEN = "#2EE07C";
const NEUTRAL = "#8B95A7";

/* ---- Entrance: a list reveals once, when it's seen ----------------------- */

const rowIn = {
  hidden: { opacity: 0, x: -10 },
  show: (i: number = 0) => ({ opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE.out, delay: rowDelay(i) } }),
};
const barIn = {
  hidden: { scaleX: 0 },
  show: (i: number = 0) => ({ scaleX: 1, transition: { duration: 0.55, ease: EASE.out, delay: 0.15 + rowDelay(i) } }),
};

/**
 * A list whose rows (variants above) play when it scrolls into view.
 * Driven by `animate`, not `whileInView`: rows added later ("show all")
 * inherit the label and animate in, where a whileInView parent would
 * leave them stranded at "hidden".
 */
export function Reveal({ children, className, as = "ol" }: { children: ReactNode; className?: string; as?: "ol" | "ul" | "div" }) {
  const ref = useRef<any>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });
  const forceVisible = useForceVisible();
  const Tag: any = motion[as];
  return (
    <Tag ref={ref} initial={forceVisible ? false : "hidden"} animate={forceVisible || seen ? "show" : "hidden"} className={className}>
      {children}
    </Tag>
  );
}

/** Face thumbnail on a team-colour tile; the tile alone if there's no photo. */
export function Face({ src, color, size = 28 }: { src?: string | null; color: string; size?: number }) {
  const [bad, setBad] = useState(false);
  return (
    <span
      className="block shrink-0 overflow-hidden rounded-row"
      style={{ width: size, height: size, background: `linear-gradient(to top, color-mix(in srgb, ${color} 55%, #0B0C0F), color-mix(in srgb, ${color} 12%, #0B0C0F))` }}
    >
      {src && !bad && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className="h-full w-full object-cover" />
      )}
    </span>
  );
}

/** A bar that draws with its list (transform only). */
function Bar({ pct, color, i, tick = false }: { pct: number; color: string; i: number; tick?: boolean }) {
  return (
    <span className="relative block h-[6px] bg-carbon-800/80">
      {tick ? (
        <motion.span custom={i} variants={barIn} className="absolute inset-y-[-2px] left-0 w-[3px] origin-left" style={{ background: color }} />
      ) : (
        <motion.span
          custom={i}
          variants={barIn}
          className="absolute inset-y-0 left-0 origin-left"
          style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, background: color }}
        />
      )}
    </span>
  );
}

type RankRow = { code: string; value: number; color?: string; note?: ReactNode };

/**
 * Ranked rows, best first.
 *  - "gap"   (times): the bar is the deficit to the best, so the leader
 *            has none and a tenth looks like a tenth. Figure + "+0.214".
 *  - "level" (speeds): the bar is the value itself above a floor just
 *            under the slowest, so the field's spread is visible.
 */
export function RankList({
  rows,
  people,
  mode,
  fmt,
  gapFmt,
  compact = false,
  valueClass,
}: {
  rows: RankRow[];
  people: People;
  mode: "gap" | "level";
  fmt: (v: number) => string;
  gapFmt?: (d: number) => string;
  compact?: boolean;
  /** Extra colour for a row's figure (e.g. FIA green for a near-best). */
  valueClass?: (row: RankRow, i: number) => string | undefined;
}) {
  if (!rows.length) return <p className="text-data text-carbon-400">No data for this session.</p>;
  const best = rows[0].value;
  const values = rows.map((r) => r.value);
  const maxGap = Math.max(...values.map((v) => Math.abs(v - best))) || 1;
  const lo = Math.min(...values), hi = Math.max(...values);
  const floor = lo - (hi - lo) * 0.3;
  return (
    <Reveal>
      {rows.map((r, i) => {
        const who = people[r.code] ?? {};
        const color = r.color ?? who.teamColor ?? NEUTRAL;
        const gap = Math.abs(r.value - best);
        const pct = mode === "gap" ? gap / maxGap : (r.value - floor) / (hi - floor || 1);
        return (
          <motion.li
            key={`${r.code}-${i}`}
            custom={i}
            variants={rowIn}
            title={who.name}
            className={`relative grid items-center gap-2 py-[3px] ${
              compact ? "grid-cols-[1.5rem_2.25rem_1fr_auto]" : "grid-cols-[1rem_1.5rem_2.5rem_1fr_auto]"
            }`}
          >
            {!compact && <span className={`timing text-right text-micro ${i < 3 ? "text-carbon-200" : "text-carbon-500"}`}>{i + 1}</span>}
            <Face src={who.thumb} color={color} size={compact ? 20 : 22} />
            <span className="timing text-label font-bold text-carbon-100">{r.code}</span>
            <Bar pct={pct} color={i === 0 && mode === "gap" ? PURPLE : color} i={i} tick={mode === "gap" && i === 0} />
            <span className="timing flex items-baseline justify-end gap-2 whitespace-nowrap">
              {r.note}
              {gapFmt && i > 0 && <span className="text-micro text-carbon-500">{gapFmt(gap)}</span>}
              <span className={`text-label font-bold ${i === 0 ? "" : valueClass?.(r, i) ?? "text-carbon-100"}`} style={i === 0 ? { color: PURPLE } : undefined}>
                {fmt(r.value)}
              </span>
            </span>
            {/* The fastest row lands with a brief purple wash once the
                cascade has finished — the answer, underlined once. */}
            {i === 0 && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -inset-x-1.5 inset-y-0"
                style={{ background: `linear-gradient(to right, ${PURPLE}33, transparent 70%)` }}
                variants={{
                  hidden: { opacity: 0 },
                  show: { opacity: [0, 1, 0], transition: { duration: 1.1, times: [0, 0.2, 1], delay: 0.55 + rowDelay(rows.length) } },
                }}
              />
            )}
          </motion.li>
        );
      })}
    </Reveal>
  );
}

/* ---- Sectors ------------------------------------------------------------ */

export function SectorBoard({ data, people }: { data: any; people: People }) {
  const { rows, best, miniSectors } = data;
  const a = people[miniSectors.driverA]?.teamColor ?? PURPLE;
  const bRaw = people[miniSectors.driverB]?.teamColor ?? GREEN;
  const b = bRaw === a ? "#E7EAF0" : bRaw; // two team-mates: keep them apart
  return (
    <div>
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-3">
        {([1, 2, 3] as const).map((n) => {
          const key = `s${n}`;
          const sorted: RankRow[] = [...rows].sort((x: any, y: any) => x[key] - y[key]).map((r: any) => ({ code: r.code, value: r[key], color: r.teamColor }));
          return (
            <div key={key}>
              <p className="eyebrow mb-2 flex items-baseline justify-between border-b border-carbon-800 pb-1.5">
                <span>Sector {n}</span>
                <span className="timing" style={{ color: PURPLE }}>
                  {best[key].toFixed(3)}s
                </span>
              </p>
              <RankList
                rows={sorted}
                people={people}
                mode="gap"
                compact
                fmt={(v) => v.toFixed(3)}
                gapFmt={(d) => `+${d.toFixed(3)}`}
                /* FIA convention: green = within 0.150 s of the best. */
                valueClass={(r) => (r.value - best[key] <= 0.15 ? "text-sector-green" : undefined)}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-carbon-800 pt-3">
        <p className="timing flex flex-wrap gap-x-4 gap-y-1 text-micro uppercase tracking-wider text-carbon-300">
          <span className="flex items-center gap-1.5"><span className="h-3 w-[3px]" style={{ background: PURPLE }} /> Fastest of all</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] bg-sector-green" /> Within 0.150s</span>
          <span className="text-carbon-500">Bar = gap to the fastest</span>
        </p>
        <p className="timing text-data text-carbon-300">
          Ideal lap <span className="font-bold" style={{ color: PURPLE }}>{formatLapTime(best.s1 + best.s2 + best.s3)}</span>
        </p>
      </div>

      {/* Lap duel: who was quicker on each sampled lap, in their own colours.
          The strip fills lap by lap, the way the race did. */}
      <div className="mt-6">
        <p className="eyebrow mb-2">
          {miniSectors.title ?? "Mini-sectors"} · {miniSectors.driverA} v {miniSectors.driverB}
          {miniSectors.subtitle ? ` · ${miniSectors.subtitle}` : ""}
        </p>
        <Reveal as="div" className="flex gap-[3px]">
          {miniSectors.splits.map((w: string, i: number) => (
            <motion.span
              key={i}
              variants={{
                hidden: { opacity: 0, scaleY: 0.2 },
                show: { opacity: 1, scaleY: 1, transition: { duration: 0.25, ease: EASE.out, delay: i * 0.035 } },
              }}
              title={`${i + 1}: ${w === "EQ" ? "even" : w === "A" ? miniSectors.driverA : miniSectors.driverB}`}
              className="h-3 flex-1 origin-bottom"
              style={{ background: w === "A" ? a : w === "B" ? b : "#3A4352" }}
            />
          ))}
        </Reveal>
        <div className="timing mt-1.5 flex justify-between text-micro font-bold text-carbon-300">
          <span className="flex items-center gap-1.5"><span className="h-3 w-[3px]" style={{ background: a }} />{miniSectors.driverA} · {miniSectors.splits.filter((w: string) => w === "A").length}</span>
          <span className="flex items-center gap-1.5">{miniSectors.splits.filter((w: string) => w === "B").length} · {miniSectors.driverB}<span className="h-3 w-[3px]" style={{ background: b }} /></span>
        </div>
      </div>
    </div>
  );
}

/* ---- Speed traps + race pace ------------------------------------------- */

export function SpeedAndPace({ data, people }: { data: any; people: People }) {
  const head = (label: string, note: string) => (
    <p className="eyebrow mb-2 flex items-baseline justify-between border-b border-carbon-800 pb-1.5">
      <span>{label}</span>
      <span className="text-carbon-500">{note}</span>
    </p>
  );
  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
      <div>
        {head("Speed trap", "km/h · highest first")}
        <RankList
          rows={data.vmax.map((d: any) => ({ code: d.code, value: d.vmax, color: d.teamColor }))}
          people={people}
          mode="level"
          fmt={(v) => v.toFixed(1)}
          gapFmt={(d) => `−${d.toFixed(1)}`}
        />
      </div>
      <div>
        {head("Race pace", "average clean lap · bar = gap to the quickest")}
        <RankList
          rows={data.pace.map((d: any) => ({ code: d.code, value: d.avgPace, color: d.teamColor }))}
          people={people}
          mode="gap"
          fmt={(v) => formatClock(v, 3)}
          gapFmt={(d) => `+${d.toFixed(3)}`}
        />
      </div>
    </div>
  );
}

/* ---- Tyre stints -------------------------------------------------------- */

export function StintBoard({ stints, totalLaps, people }: { stints: any[]; totalLaps: number; people: People }) {
  const used = [...new Set(stints.flatMap((d) => d.stints.map((s: any) => s.compound)))].filter((c) => COMPOUND[c as string]) as string[];
  return (
    <div>
      <Reveal>
        {stints.map((driver, row) => {
          const who = people[driver.code] ?? {};
          return (
            <motion.li
              key={driver.code}
              custom={row}
              variants={rowIn}
              title={who.name}
              className="grid grid-cols-[1.5rem_2.5rem_1fr] items-center gap-2 py-[3px]"
            >
              <Face src={who.thumb} color={who.teamColor ?? NEUTRAL} size={22} />
              <span className="timing text-label font-bold text-carbon-100">{driver.code}</span>
              {/* Each row unrolls from lap 1 to the flag, staggered down the field. */}
              <span className="block h-[10px] bg-carbon-800/80">
                <motion.span
                  custom={row}
                  variants={{
                    hidden: { scaleX: 0 },
                    show: (i: number = 0) => ({ scaleX: 1, transition: { duration: 0.7, ease: EASE.out, delay: 0.15 + rowDelay(i) } }),
                  }}
                  className="flex h-full origin-left"
                >
                  {driver.stints.map((s: any, i: number) => (
                    <span
                      key={i}
                      title={`${s.compound} · laps ${s.from}–${s.to} (${s.to - s.from + 1})`}
                      className="h-full border-r-2 border-black last:border-r-0"
                      style={{ width: `${((s.to - s.from + 1) / totalLaps) * 100}%`, background: COMPOUND[s.compound] ?? "#5B6678" }}
                    />
                  ))}
                </motion.span>
              </span>
            </motion.li>
          );
        })}
      </Reveal>
      <div className="timing ml-[4.75rem] mt-1.5 flex justify-between text-micro text-carbon-500">
        <span>L1</span>
        <span>L{Math.round(totalLaps / 2)}</span>
        <span>L{totalLaps}</span>
      </div>
      <p className="timing mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-carbon-800 pt-3 text-micro uppercase tracking-wider text-carbon-300">
        {used.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="h-3 w-[3px]" style={{ background: COMPOUND[c] }} />
            {c.toLowerCase()}
          </span>
        ))}
        <span className="text-carbon-500">Point at a stint for its laps</span>
      </p>
    </div>
  );
}

/* ---- Pit stops ----------------------------------------------------------- */

export function PitBoard({ pitStops, people }: { pitStops: any[]; people: People }) {
  const [all, setAll] = useState(false);
  /* Demo data has wheels-stopped times; live data only the pit-lane time. */
  const stationary = pitStops[0]?.stationary != null;
  const metric = (p: any) => (stationary ? p.stationary : p.laneTime);
  const shown = all ? pitStops : pitStops.slice(0, 12);
  const rows: RankRow[] = shown.map((p) => ({
    code: p.code,
    value: metric(p),
    note: <span className="text-micro text-carbon-500">L{p.lap}</span>,
  }));
  return (
    <div>
      <p className="eyebrow mb-2 flex items-baseline justify-between border-b border-carbon-800 pb-1.5">
        <span>{stationary ? "Stationary time" : "Time in the pit lane"}</span>
        <span className="text-carbon-500">quickest first · {pitStops.length} stops</span>
      </p>
      <RankList rows={rows} people={people} mode="level" fmt={(v) => `${v.toFixed(stationary ? 2 : 1)}s`} />
      {pitStops.length > 12 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="timing mt-3 text-micro font-bold uppercase tracking-wider text-carbon-300 hover:text-carbon-100"
        >
          {all ? "Show the quickest 12" : `Show all ${pitStops.length} stops`}
        </button>
      )}
    </div>
  );
}
