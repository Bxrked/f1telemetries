"use client";

import { useEffect, useState } from "react";
import { getPublisherLag } from "@/services/f1Service";

/**
 * "Some data is still on its way."
 *
 * Shown while Jolpica — the results provider — hasn't published the newest
 * race. Either OpenF1 is standing in for it (state "bridged": the race is
 * on screen, but standings and retirement reasons aren't in yet), or
 * neither source has it and pages still show the previous race ("waiting").
 * It is not dismissible: it says something true about what's on the page,
 * and it removes itself as soon as Jolpica catches up.
 *
 * Rendered ABOVE a page's <main>, as its own row in the body's flex
 * column, so the full-screen stages (Teammates, Race Replay) simply get
 * that much less height instead of being covered.
 */

export type PublisherLag = {
  state: "bridged" | "waiting";
  round: number;
  publishedRound: number;
  raceName: string;
  /** Where the bridged grid came from; anything but "timing" has no penalties applied. */
  grid?: "timing" | "qualifying" | "finish-order";
} | null;

/** What the site is waiting on from its results provider, if anything. */
export function usePublisherLag(): PublisherLag {
  const [lag, setLag] = useState<PublisherLag>(null);
  useEffect(() => {
    let on = true;
    getPublisherLag().then((l: PublisherLag) => on && setLag(l));
    return () => {
      on = false;
    };
  }, []);
  return lag;
}

function detail(lag: NonNullable<PublisherLag>, page: "telemetry" | "replay" | "compare" | "teammates") {
  /* Teammates is built from the provider's results alone, so whichever
     state we're in, the newest race simply isn't in its tallies. */
  if (page === "teammates") {
    return `Our results provider hasn't published the ${lag.raceName} yet, so that race isn't counted in these tallies. It will be added here automatically.`;
  }
  if (lag.state === "waiting") {
    return `Our results provider hasn't published the ${lag.raceName} yet, so this page still shows the previous race. It will switch automatically.`;
  }
  const missing = ["standings", lag.grid !== "timing" ? "grid penalties" : null, "retirement reasons"].filter(Boolean) as string[];
  const list = missing.length > 2 ? `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}` : missing.join(" and ");
  return `Our results provider hasn't published this race yet, so ${list} are missing for now. They'll appear here automatically.`;
}

export default function PublisherNotice({ page }: { page: "telemetry" | "replay" | "compare" | "teammates" }) {
  const lag = usePublisherLag();
  if (!lag) return null;
  return (
    <aside role="status" className="relative z-10 w-full shrink-0 border-b border-carbon-800 bg-carbon-950 px-4 py-2 pl-5 sm:px-6 sm:pl-7">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-sector-yellow" />
      <p className="text-data leading-relaxed text-carbon-300">
        <span className="timing mr-2 font-bold uppercase tracking-wider text-carbon-100">Some data is still on its way.</span>
        We&apos;re a small non-profit project on a small budget. {detail(lag, page)}
      </p>
    </aside>
  );
}
