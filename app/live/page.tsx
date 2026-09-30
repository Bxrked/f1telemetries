import { redirect } from "next/navigation";
import LiveRacePage from "@/components/LiveRacePage";
import { FEATURES } from "@/services/features";

export const metadata = {
  title: "Race Replay",
  description:
    "Replay the latest Grand Prix lap by lap: every car on the circuit, the running order and gaps, safety cars, overtakes and pit stops.",
  alternates: { canonical: "/live" },
};

export default function LivePage() {
  /* Replay shelved. The route stays mounted and redirects rather than 404s,
     so old links and bookmarks land somewhere useful. LiveRacePage below is
     still imported and type-checked — flip FEATURES.raceReplay to restore. */
  if (!FEATURES.raceReplay) redirect("/telemetry");

  return <LiveRacePage />;
}
