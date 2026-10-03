"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { EASE, SPRING, rowReveal } from "@/lib/motion";
import { useForceVisible } from "../MotionProvider";


const SECTION_LABEL: Record<string, string> = {
  "TRACK INTERVIEWS": "On the podium",
  "PRESS CONFERENCE": "Press conference",
  "QUESTIONS FROM THE FLOOR": "Questions from the floor",
};
const titleCase = (s: string) => SECTION_LABEL[s] ?? s.charAt(0) + s.slice(1).toLowerCase();

/**
 * Post-race interviews — the podium in their own words, from the FIA's
 * press conference transcript. One driver at a time: each answer with
 * the question that prompted it, grouped by where it was said.
 *
 * Quotes are the FIA's; every view credits it and links the full
 * transcript.
 */
export default function Interviews({ data, interviews }: { data: any; interviews: any }) {
  const forceVisible = useForceVisible();
  const [pick, setPick] = useState(0);

  /* FIA names ("George RUSSELL") → our drivers, by surname, for colour and code. */
  const podium = useMemo(() => {
    if (interviews?.status !== "ok") return [];
    const ours = Object.entries(data.drivers).map(([num, d]: [string, any]) => ({ num: +num, ...d }));
    return interviews.drivers.map((d: any, i: number) => {
      const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      const match = ours.find((o: any) => plain((o.name ?? "").trim().split(/\s+/).pop() ?? "") === plain(d.lastName));
      return { ...d, i, code: match?.code ?? d.lastName.slice(0, 3).toUpperCase(), color: match?.teamColor ?? "#8B95A7" };
    });
  }, [data, interviews]);

  if (!interviews) {
    return (
      <div className="space-y-2 p-1">
        <div className="skeleton h-12" />
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
      </div>
    );
  }

  if (interviews.status !== "ok") {
    return (
      <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col items-center gap-2 border-b border-carbon-700 px-4 pb-3 pt-2 text-center">
        <p className="timing text-label font-bold uppercase tracking-wider text-carbon-300">
          {interviews.status === "not-published" ? "Not published yet" : "Couldn't reach the FIA"}
        </p>
        <p className="max-w-xs text-data leading-relaxed text-carbon-400">
          {interviews.status === "not-published"
            ? "The FIA posts the post-race press conference transcript a few hours after the chequered flag. Check back later."
            : "The FIA's site didn't respond. The transcript may still be there."}
        </p>
        <a
          href={interviews.source}
          target="_blank"
          rel="noopener noreferrer"
          className="timing mt-1 flex items-center gap-1 text-micro font-bold uppercase tracking-wider text-carbon-300 underline-offset-2 hover:text-carbon-100 hover:underline"
        >
          fia.com <ExternalLink size={11} />
        </a>
      </div>
      </div>
    );
  }

  const driver = podium[pick];
  /* This driver's answers, each with the question that prompted it. */
  const bySection = interviews.sections
    .map((s: any) => ({
      title: s.title,
      note: s.note,
      items: s.exchanges.flatMap((e: any) =>
        e.answers.filter((a: any) => a.speaker === pick).map((a: any) => ({ q: e.q, asker: e.asker, a: a.text }))
      ),
    }))
    .filter((s: any) => s.items.length);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Podium picker */}
      <div className="mb-2 grid grid-cols-3 gap-1">
        {podium.map((d: any) => (
          <button
            key={d.i}
            type="button"
            onClick={() => setPick(d.i)}
            aria-pressed={pick === d.i}
            className={`relative overflow-hidden rounded-row border px-2 pb-1.5 pt-2 text-left transition-colors duration-micro
              ${pick === d.i ? "border-carbon-500 bg-carbon-800" : "border-carbon-700 hover:border-carbon-600"}`}
          >
            <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: d.color }} />
            {pick === d.i && (
              <motion.span layoutId="interview-pick" transition={SPRING.panel} className="absolute inset-x-0 bottom-0 h-[2px] bg-carbon-100" />
            )}
            <span className={`timing block text-micro font-bold ${d.pos === 1 ? "text-sector-yellow" : "text-carbon-400"}`}>P{d.pos}</span>
            <span className="font-display text-base font-black uppercase leading-none tracking-wide text-carbon-100">{d.code}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pick}
          className="min-h-0 flex-1 overflow-y-auto pr-1"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE.out } }}
          exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE.in } }}
        >
          <p className="mb-2 text-data text-carbon-400">
            <span className="font-bold text-carbon-100">{driver.name}</span> · {driver.team}
          </p>
          {bySection.map((s: any) => (
            <section key={s.title} className="mb-3">
              <p className="eyebrow mb-1.5 border-b border-carbon-800 pb-1">
                {titleCase(s.title)}
                {s.note && <span className="normal-case tracking-normal text-carbon-500"> · {s.note.replace(/^Conducted by /, "with ")}</span>}
              </p>
              <ol className="space-y-3">
                {s.items.map((it: any, k: number) => (
                  <motion.li key={k} custom={k} variants={rowReveal} initial={forceVisible ? false : "hidden"} animate="show">
                    {it.q && (
                      <p className="text-data leading-relaxed text-carbon-400">
                        <span className="timing mr-1 font-bold text-carbon-500">Q</span>
                        {it.q}
                        {it.asker && <span className="text-carbon-500"> — {it.asker}</span>}
                      </p>
                    )}
                    <div className="mt-1 border-l-[3px] pl-2.5" style={{ borderColor: driver.color }}>
                      {it.a.split(/\n\n+/).map((para: string, j: number) => (
                        <p key={j} className="mb-1 text-label leading-relaxed text-carbon-100 last:mb-0">
                          {para}
                        </p>
                      ))}
                    </div>
                  </motion.li>
                ))}
              </ol>
            </section>
          ))}
        </motion.div>
      </AnimatePresence>

      <a
        href={interviews.source}
        target="_blank"
        rel="noopener noreferrer"
        className="timing mt-2 flex shrink-0 items-center justify-between gap-2 border-t border-carbon-700 pt-2 text-micro text-carbon-400 transition-colors duration-micro hover:text-carbon-100"
      >
        <span>Transcript © FIA{interviews.date ? ` · ${interviews.date}` : ""}</span>
        <span className="flex items-center gap-1 font-bold uppercase tracking-wider">
          Full transcript <ExternalLink size={11} />
        </span>
      </a>
    </div>
  );
}
