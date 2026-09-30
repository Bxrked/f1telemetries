"use client";

import RaceReplay from "./RaceReplay";

/**
 * Race replay page — the latest completed Grand Prix, every lap.
 * Full-bleed like the telemetry board: the map wants the width.
 */
export default function LiveRacePage() {
  return (
    <main className="w-full min-w-0 px-4 py-6 sm:px-6">
      <RaceReplay />
    </main>
  );
}
