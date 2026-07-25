import LiveRacePage from "@/components/LiveRacePage";

export const metadata = {
  title: "Live Race",
  description:
    "Broadcast-style animated race map: every car as a labelled dot with live running order, gaps, overtake markers and team radio.",
  alternates: { canonical: "/live" },
};

export default function LivePage() {
  return <LiveRacePage />;
}
