import ComparePage from "@/components/ComparePage";

export const metadata = {
  title: "Head-to-Head",
  description:
    "Compare any two drivers from the latest Grand Prix: best sectors, race pace, top speed, lap-by-lap duel, cumulative gap and pit strategy.",
  alternates: { canonical: "/compare" },
};

export default function Compare() {
  return <ComparePage />;
}
