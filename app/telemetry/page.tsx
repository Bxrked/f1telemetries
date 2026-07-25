import TelemetryDashboard from "@/components/TelemetryDashboard";

export const metadata = {
  title: "Post-Race Telemetry",
  description:
    "Sector analysis, tyre strategy, pit stop leaderboard, degradation models, speed traps and championship standings for the latest Grand Prix.",
  alternates: { canonical: "/telemetry" },
};

export default function TelemetryPage() {
  return <TelemetryDashboard />;
}
