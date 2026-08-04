import { redirect } from "next/navigation";
import LiveRacePage from "@/components/LiveRacePage";
import { FEATURES } from "@/services/features";

export const metadata = {
  title: "Live Race",
  description:
    "Broadcast-style animated race map: every car as a labelled dot with live running order, gaps, overtake markers and team radio.",
  alternates: { canonical: "/live" },
};

export default function LivePage() {
  /* Replay shelved. The route stays mounted and redirects rather than 404s,
     so old links and bookmarks land somewhere useful. LiveRacePage below is
     still imported and type-checked — flip FEATURES.raceReplay to restore. */
  if (!FEATURES.raceReplay) redirect("/telemetry");

  return <LiveRacePage />;
}
