"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getTeammateBattles, getDriverHeadshots, getFeedStatus } from "@/services/f1Service";
import { DUR, EASE, SPRING, VIEWPORT, rowDelay } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";
import MockDataBanner from "./MockDataBanner";
import PageTitle from "./PageTitle";
import CountUp from "./CountUp";

/**
 * Teammate battles — who beats who inside each team, over the season.
 *
 * One card per team: the two drivers face each other, the driver who is
 * ahead on the left, the rows won between them, and five rows whose bars
 * grow outward from the centre (the winner's in team colour). The rules
 * behind the numbers live in services/teammates.js.
 *
 * Motion, in reading order as a card scrolls in: the card rises, the
 * portraits wipe up out of a team-colour panel, the score counts, then
 * the bars draw row by row. Per-row figures stay still — they're compared
 * across the card, and moving digits there would be noise.
 */

type Sort = "order" | "closest" | "onesided";
const SORTS: { id: Sort; label: string }[] = [
  { id: "order", label: "Championship" },
  { id: "closest", label: "Closest" },
  { id: "onesided", label: "One-sided" },
];

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
const show = (key: string, v: number | null) => (v == null ? "–" : key === "best" ? ordinal(v) : String(v));

/** Bar length 0..1. Counts scale to the larger side; a finishing place to the grid. */
const fill = (key: string, v: number | null, other: number | null) => {
  if (v == null) return 0;
  if (key === "best") return Math.max(0.06, (23 - v) / 22);
  const max = Math.max(v, other ?? 0);
  return max > 0 ? v / max : 0;
};

/** How lopsided a pairing is: rows won, then the share of the counted duels. */
const lopsided = (t: any) => {
  const duels = t.rows.filter((r: any) => ["race", "quali", "fastest"].includes(r.key) && r.a + r.b > 0);
  const share = duels.reduce((s: number, r: any) => s + Math.abs(r.a - r.b) / (r.a + r.b), 0) / (duels.length || 1);
  return Math.abs(t.score.a - t.score.b) + share;
};

const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
};

/* ---- Motion ---- */
const cardReveal = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE.out, delay: (i % 2) * 0.08, when: "beforeChildren" as const },
  }),
};
const panelWipe = {
  hidden: { clipPath: "inset(100% 0% 0% 0%)" },
  show: { clipPath: "inset(0% 0% 0% 0%)", transition: { duration: 0.5, ease: EASE.out } },
};
const portraitRise = {
  hidden: { opacity: 0, y: 16, scale: 1.08 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: EASE.out, delay: 0.12 } },
};
const nameSlide = (dir: 1 | -1) => ({
  hidden: { opacity: 0, x: dir * -10 },
  show: { opacity: 1, x: 0, transition: { duration: DUR.layout, ease: EASE.out, delay: 0.18 } },
});
const scorePop = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { duration: DUR.layout, ease: EASE.out, delay: 0.22 } },
};
const rowFade = {
  hidden: { opacity: 0 },
  show: (i: number = 0) => ({ opacity: 1, transition: { duration: DUR.micro, ease: EASE.out, delay: 0.3 + rowDelay(i) * 2 } }),
};
const barGrow = {
  hidden: { scaleX: 0 },
  show: (i: number = 0) => ({ scaleX: 1, transition: { duration: 0.6, ease: EASE.out, delay: 0.34 + rowDelay(i) * 2 } }),
};

/** Drawn helmet in team colour — shown when a driver has no photo. */
function Helmet({ color, number, flip }: { color: string; number: number | null; flip: boolean }) {
  const ink = isLight(color) ? "#0B0C0F" : "#F2F3F5";
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <g transform={flip ? "translate(100 0) scale(-1 1)" : undefined}>
        <path d="M16 63 C16 33 39 16 62 18 C82 20 91 38 88 55 L86 67 C84 77 74 83 60 83 L33 83 C23 83 16 75 16 63 Z" fill={color} />
        <path d="M20 50 C26 30 44 21 62 22" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" opacity={0.55} />
        <path d="M52 41 L87 45 L86 59 L57 61 C50 58 48 47 52 41 Z" fill="#0B0C0F" />
        <path d="M56 45 L83 48" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" opacity={0.35} />
        <path d="M33 83 L60 83 C68 83 75 81 80 77 L44 74 Z" fill="#0B0C0F" opacity={0.35} />
      </g>
      {number != null && (
        <text
          x={flip ? 66 : 34}
          y={66}
          textAnchor="middle"
          fill={ink}
          style={{ font: "700 15px var(--font-timing), monospace" }}
        >
          {number}
        </text>
      )}
    </svg>
  );
}

function Portrait({ driver, color, src, flip }: { driver: any; color: string; src?: string; flip: boolean }) {
  const [failed, setFailed] = useState(false);
  const photo = src && !failed;
  return (
    <motion.div
      variants={panelWipe}
      className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-row sm:h-24 sm:w-24"
      style={{
        background: `linear-gradient(to top, color-mix(in srgb, ${color} 60%, #0B0C0F), color-mix(in srgb, ${color} 14%, #0B0C0F))`,
      }}
    >
      <motion.div
        variants={portraitRise}
        className={`h-full w-full transition-transform duration-layout ease-out-expo group-hover:-translate-y-0.5 ${photo ? "" : "p-1.5 sm:p-2"}`}
      >
        {photo ? (
          /* Plain <img>: remote F1 media, already small; nothing for next/image to optimise. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={driver.name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <Helmet color={color} number={driver.number} flip={flip} />
        )}
      </motion.div>
    </motion.div>
  );
}

function Driver({ driver, color, src, side, ahead }: { driver: any; color: string; src?: string; side: "a" | "b"; ahead: boolean }) {
  const right = side === "b";
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${right ? "flex-row-reverse text-right" : ""}`}>
      {/* Drawn helmets face the middle (the right one is mirrored); photos never are. */}
      <Portrait driver={driver} color={color} src={src} flip={right} />
      <motion.div variants={nameSlide(right ? -1 : 1)} className="min-w-0">
        <p
          className={`font-display text-2xl font-black uppercase italic leading-none tracking-tight sm:text-3xl ${ahead ? "text-carbon-100" : "text-carbon-300"}`}
        >
          {driver.code}
        </p>
        {/* Surname alone on phones — the full name doesn't fit beside the score. */}
        <p className="mt-1 truncate text-data text-carbon-400">
          <span className="sm:hidden">{driver.name.split(" ").slice(-1)[0]}</span>
          <span className="hidden sm:inline">{driver.name}</span>
        </p>
      </motion.div>
    </div>
  );
}

function Row({ row, color, i, a, b }: { row: any; color: string; i: number; a: string; b: string }) {
  const bar = (side: "a" | "b") => {
    const v = row[side], other = row[side === "a" ? "b" : "a"];
    const won = row.winner === side;
    return (
      <span className="relative block h-[6px] bg-carbon-800">
        <motion.span
          custom={i}
          variants={barGrow}
          className={`absolute inset-y-0 ${side === "a" ? "right-0 origin-right" : "left-0 origin-left"}`}
          style={{ width: `${fill(row.key, v, other) * 100}%`, background: won ? color : "#3A4352" }}
        />
      </span>
    );
  };
  const value = (side: "a" | "b") => (
    <span
      className={`timing text-label font-bold ${side === "a" ? "text-left" : "text-right"} ${row.winner === side ? "text-carbon-100" : "text-carbon-400"}`}
    >
      {show(row.key, row[side])}
    </span>
  );
  return (
    <motion.li
      custom={i}
      variants={rowFade}
      className="grid grid-cols-[2.25rem_1fr_6.25rem_1fr_2.25rem] items-center gap-2 py-[5px] sm:grid-cols-[3rem_1fr_6.5rem_1fr_3rem]"
      aria-label={`${row.label}: ${a} ${show(row.key, row.a)}, ${b} ${show(row.key, row.b)}`}
    >
      {value("a")}
      {bar("a")}
      <span className="eyebrow whitespace-nowrap text-center">{row.label}</span>
      {bar("b")}
      {value("b")}
    </motion.li>
  );
}

function TeamCard({ team, heads, i, forceVisible }: { team: any; heads: Record<string, string>; i: number; forceVisible: boolean }) {
  return (
    <motion.article
      layout
      custom={i}
      variants={cardReveal}
      {...(forceVisible
        ? { initial: false as const, animate: "show" as const }
        : { initial: "hidden" as const, whileInView: "show" as const, viewport: VIEWPORT })}
      transition={{ layout: SPRING.panel }}
      style={{ ["--team" as any]: team.color }}
      className="group relative overflow-hidden rounded-panel border border-carbon-700 bg-carbon-850 p-3 shadow-panel
        transition-colors duration-micro ease-out-expo hover:border-[color-mix(in_srgb,var(--team)_55%,#232A37)] sm:p-4"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2">
          <span className="h-4 w-[3px] shrink-0" style={{ background: team.color }} />
          <span className="truncate font-display text-base font-bold uppercase leading-none tracking-wide text-carbon-100">
            {team.name}
          </span>
        </h2>
        <span className="timing shrink-0 text-micro uppercase tracking-wider text-carbon-400">
          {team.together} {team.together === 1 ? "race" : "races"} together
        </span>
      </header>

      <div className="flex items-center gap-2 sm:gap-4">
        <Driver driver={team.a} color={team.color} src={heads[team.a.code]} side="a" ahead={team.score.a >= team.score.b} />
        <motion.div variants={scorePop} className="shrink-0 text-center">
          <p className="font-display text-3xl font-black italic leading-none text-carbon-100 sm:text-4xl">
            <CountUp value={team.score.a} duration={0.7} delay={0.25} />
            <span className="mx-1 text-carbon-500">–</span>
            <span className="text-carbon-400">
              <CountUp value={team.score.b} duration={0.7} delay={0.25} />
            </span>
          </p>
          <p className="eyebrow mt-1.5">Rows won</p>
        </motion.div>
        <Driver driver={team.b} color={team.color} src={heads[team.b.code]} side="b" ahead={team.score.b > team.score.a} />
      </div>

      <ul className="mt-3 border-t border-carbon-700/70 pt-2">
        {team.rows.map((row: any, k: number) => (
          <Row key={row.key} row={row} color={team.color} i={k} a={team.a.code} b={team.b.code} />
        ))}
      </ul>

      {team.others.length > 0 && (
        <p className="timing mt-2 text-micro uppercase tracking-wider text-carbon-500">
          Also drove ·{" "}
          {team.others.map((d: any) => `${d.code} (${d.races} ${d.races === 1 ? "race" : "races"})`).join(", ")}
        </p>
      )}
    </motion.article>
  );
}

export default function TeammatesPage() {
  const [data, setData] = useState<any>(null);
  const [feed, setFeed] = useState<any>(null);
  const [heads, setHeads] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<Sort>("order");
  const forceVisible = useForceVisible();

  useEffect(() => {
    getTeammateBattles().then((d) => {
      setData(d);
      setFeed(getFeedStatus());
    });
    /* Photos are decoration: they arrive when they arrive, helmets until then. */
    getDriverHeadshots().then(setHeads);
  }, []);

  const teams = useMemo(() => {
    if (!data) return [];
    const list = [...data.teams];
    if (sort === "closest") list.sort((x, y) => lopsided(x) - lopsided(y));
    if (sort === "onesided") list.sort((x, y) => lopsided(y) - lopsided(x));
    return list;
  }, [data, sort]);

  return (
    <main className="w-full min-w-0 px-4 py-6 sm:px-6">
      <PageTitle
        eyebrow={
          <>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-f1red-bright" />
            {data ? `Season ${data.season} · after round ${data.afterRound}` : "Season so far"}
          </>
        }
        title="Teammate Battles"
        tone={(_, i) => (i === 1 ? "text-carbon-400" : "text-carbon-100")}
        meta={
          <p className="max-w-2xl text-data leading-relaxed text-carbon-400">
            Same car, so the only driver you can really be measured against. Race result counts races both finished;
            qualifying and fastest lap count sessions where both set a time; sprints add to points only.
          </p>
        }
        aside={
          <div className="flex rounded-row border border-carbon-600 bg-carbon-950/85 p-0.5" role="group" aria-label="Sort teams">
            {SORTS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                aria-pressed={sort === id}
                className={`timing relative z-10 px-3 py-1 text-micro font-bold uppercase tracking-wider transition-colors duration-micro
                  ${sort === id ? "text-white" : "text-carbon-400 hover:text-carbon-100"}`}
              >
                {sort === id && (
                  <motion.span layoutId="teammates-sort" className="absolute inset-0 -z-10 rounded-[3px] bg-f1red" transition={SPRING.panel} />
                )}
                {label}
              </button>
            ))}
          </div>
        }
      />

      <MockDataBanner feed={feed} only={["teammates"]} />

      {!data ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton flex h-[290px] items-center justify-center rounded-panel">
              <span className="timing relative z-10 flex items-center gap-2 text-micro uppercase tracking-wider text-carbon-500">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
                acquiring season
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {teams.map((team: any, i: number) => (
            <TeamCard key={team.id} team={team} heads={heads} i={i} forceVisible={forceVisible} />
          ))}
        </div>
      )}
    </main>
  );
}
