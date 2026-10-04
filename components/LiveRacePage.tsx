"use client";

import RaceReplay from "./RaceReplay";
import PublisherNotice from "./PublisherNotice";

/**
 * Race replay page — the latest completed Grand Prix, every lap.
 * Full-bleed like the telemetry board: the map wants the width.
 */
export default function LiveRacePage() {
  return (
    <>
      <PublisherNotice page="replay" />
      {/* A stage, like Teammates: from lg up it is exactly the space the nav
          (and the notice, when there is one) leaves — RaceReplay fills it
          and nothing scrolls; below lg the pieces stack and the page scrolls. */}
      <main className="relative min-h-0 w-full min-w-0 flex-1 bg-black">
        <RaceReplay />
      </main>
    </>
  );
}
