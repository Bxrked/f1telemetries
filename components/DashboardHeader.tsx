"use client";

import { motion } from "framer-motion";
import PageTitle from "./PageTitle";
import { rowReveal } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";

const FEED_STYLE: Record<string, { label: string; dot: string; text: string }> = {
  loading: { label: "Syncing", dot: "bg-carbon-400", text: "text-carbon-300" },
  live: { label: "Live data", dot: "bg-sector-green", text: "text-sector-green" },
  partial: { label: "Partial live", dot: "bg-sector-yellow", text: "text-sector-yellow" },
  mock: { label: "Offline · demo", dot: "bg-carbon-400", text: "text-carbon-300" },
};

const PODIUM_LABEL = ["P1", "P2", "P3"];

/**
 * Race headline: the event name, where and when, and — once the results
 * feed lands — the podium, which is the first thing anyone opening a
 * post-race board wants to know.
 */
export default function DashboardHeader({
  session,
  feed,
  podium,
}: {
  session: any;
  feed?: any;
  podium?: { code: string; name: string; teamColor: string }[];
}) {
  const f = FEED_STYLE[feed?.mode ?? "mock"];
  const forceVisible = useForceVisible();
  /* "Grand Prix" is the constant; the country is the news. */
  const words = session.meetingName.split(" ");
  const constantFrom = words.findIndex((w: string) => /^grand$/i.test(w));

  return (
    <PageTitle
      eyebrow={
        <>
          <span className="inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
          Round {session.round} · {session.season} season · {session.sessionType}
        </>
      }
      title={session.meetingName}
      tone={(_, i) => (constantFrom > 0 && i >= constantFrom ? "text-carbon-400" : "text-carbon-100")}
      meta={
        <p className="timing flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-carbon-300">
          <span className="text-carbon-100">{session.circuitName}</span>
          <span className="text-carbon-600">/</span>
          <span>{session.location}</span>
          <span className="text-carbon-600">/</span>
          <span className={`flex items-center gap-1.5 ${f.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${f.dot} ${feed?.mode === "live" ? "animate-pulse-dot" : ""}`} />
            {f.label}
            {feed?.mode === "partial" && (
              <span className="text-carbon-400">
                {feed.live}/{feed.total}
              </span>
            )}
          </span>
        </p>
      }
      aside={
        podium?.length ? (
          <ol className="flex items-stretch gap-1.5" aria-label="Podium">
            {podium.slice(0, 3).map((d, i) => (
              <motion.li
                key={d.code}
                custom={i + 4}
                variants={rowReveal}
                initial={forceVisible ? false : "hidden"}
                animate="show"
                title={d.name}
                className="relative flex min-w-[84px] flex-col justify-between overflow-hidden rounded-row border border-carbon-700 bg-carbon-900/70 px-3 pb-2 pt-2.5"
              >
                <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: d.teamColor }} />
                <span className={`timing text-micro font-bold ${i === 0 ? "text-sector-yellow" : "text-carbon-400"}`}>
                  {PODIUM_LABEL[i]}
                </span>
                <span className="font-display text-xl font-black uppercase leading-none tracking-wide text-carbon-100">
                  {d.code}
                </span>
              </motion.li>
            ))}
          </ol>
        ) : null
      }
    />
  );
}
