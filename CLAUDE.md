# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # next dev
npm run build   # next build
npm start       # next start (after build)
```

There is **no test framework, linter, or typecheck script** in this project. `npm run build` is the only verification gate — it runs the Next.js compiler, which is what will catch type and import errors. Note that `tsconfig.json` sets `strict: false` and `noImplicitAny: false`, so TypeScript catches much less than usual.

### Diagnostic scripts

Six standalone Node scripts hit the live APIs and print geometry/health reports. They are the debugging tool for this codebase — read-only, no install, no dev server:

```bash
node diag.mjs        # what OpenF1 actually returns for the track trace (loop closure, teleports, grid-vs-track bounds)
node diag2.mjs       # tests the current trace algorithm against live data
node diag-track.mjs  # reproduces getTrackOutline() + replay dot placement, reports geometry
LAP_M=6003 node diag-replay.mjs [session_key]  # replay lap-mode placement vs real GPS, in metres (LAP_M = circuit length)
node diag-interviews.mjs [year slug]           # FIA transcript parser against fia.com (e.g. 2026 monaco)
node diag-teammates.mjs [season]               # teammate battle tables from the live season (default: current)
```

Reach for these before touching track-tracing or replay coordinate code. They exist because that code failed in ways only visible against real API responses.

## Architecture

### Three-layer data flow

```
services/config.js     → feature switch, API bases, cache TTLs
services/apiClient.js  → hardened fetch (rate limit, dedupe, retry, 2-tier cache)
services/f1Service.js  → all domain getters, live-with-mock-fallback
components/*.tsx       → "use client" consumers
```

Components never fetch directly. Every network call goes through `fetchJson` in `apiClient.js`, and every domain concept is a `get*()` export from `f1Service.js`.

### Two upstream APIs, joined by session resolution

- **Jolpica** (`api.jolpi.ca`, Ergast-compatible) — race-level data: schedule, standings, classifications.
- **OpenF1** (`api.openf1.org`) — telemetry-grade data: laps, stints, pit, location, position, race control, team radio.

These have no shared identifier. `resolveOpenF1Session(race)` bridges them by **matching a Jolpica race to an OpenF1 race session within a 2-day window of the race date**, returning the `session_key` every OpenF1 endpoint requires. Any new telemetry getter starts by calling `openF1Context()`, which does this and also returns the classification finish order.

### The fallback contract

Every public getter is wrapped in `withFallback(name, liveFn, mockFn)`. If `liveFn` throws — for any reason — it logs once, records the feed as `"mock"`, and serves the mock body. The UI stays alive; `getFeedStatus()` reports `live | partial | mock` and drives the header badge and `MockDataBanner`.

Consequences to respect when editing:

- **Throwing is the correct way to reject bad live data.** Getters deliberately `throw` on sparse or degenerate results (`"too few drivers with full sector data"`, `"worm series too sparse"`) rather than rendering something misleading. Don't replace these with silent defaults.
- Mock reference data is a full Monaco GP dataset near the top of `f1Service.js` and must stay shape-compatible with whatever `liveFn` returns.
- `USE_LIVE_DATA` in `config.js` is the master switch — set it `false` to force everything to mock.

### Rate limiting is load-bearing

OpenF1's free tier is **3 requests/second**. `apiClient.js` implements a per-host sliding-window scheduler (`HOST_LIMITS`), in-flight deduplication, retry with backoff, and a memory + `localStorage` cache. Exceeding the cap produces 429s, which cascade into mock fallback across the whole dashboard — this was the original cause of the "everything is mock" behaviour.

So: **do not add bare `fetch()` calls.** Route through `fetchJson`. Prefer reusing an already-cached heavy fetch (`openF1AllLaps`) over adding endpoints — four getters share that one call.

### Track tracing and the shared-transform invariant

The circuit outline is traced from real GPS (`/location`) for one clean mid-race lap, not from stored track maps. `pickLapCandidates` takes up to 5 laps from *different drivers* (one faulty GPS unit shouldn't consume every attempt), scores each by `closureError` (end-to-start gap ÷ bounding diagonal), and draws the best.

Two hard-won constraints, both documented at length in the source:

1. **Lap selection is the only filtering that works.** Spike filters, loop truncation, and gap-breaking were all tried and each broke the map in a new way — distance-per-sample scales with speed, so cutting on distance deletes straights. `tracePath` in `format.js` is deliberately a dumb polyline.
2. **The outline and the car dots must share one coordinate frame.** `buildTransform()` / `projectToTrack()` exist so the replay projects both from the same bounds and the same `sessionKey`. Deriving them separately puts cars beside the track instead of on it. `traceSessionCircuit` caches one trace per session so the map and replay can't diverge.

### Race replay (`/live`)

`services/replayModel.js` is pure maths (no fetch, no React) so `diag-replay.mjs` runs the exact same code against real GPS. Keep it that way.

- **Lap mode** places every car from cached lap timing: each sector is time-warped onto the *reference lap's* speed profile (the GPS lap already traced for the circuit outline). Measured at Baku 2026: median 11 m along-track under green (constant-speed-per-sector was 34 m, per-lap 73 m). Weak spot: the lap a Safety Car is deployed on — speed changes mid-sector and three splits can't locate it. GPS mode covers those moments.
- **GPS mode** (≤5×) streams `/location` one leader-lap window at a time (±4 s overlap), current + next lap in flight, 4 windows kept. `fetchJson(..., { store: false })` — never cache bulk GPS in the shared cache (~1 MB/lap). The canvas crossfades lap→GPS per car, so a late chunk never freezes or hides a car.
- **Tower order and gaps are continuous.** Order is race distance (the same as the map); a gap is "how long ago the car ahead was where this car is now", found by binary search on the car ahead's (monotonic) race distance — so it moves with the cars and can't go negative. Once cars take the flag, the **official classification** decides their order and gaps (Jolpica `Time.millis`): OpenF1 lap stamps are only good to ~0.2 s — at Baku 2026 they put VER over the line 3 ms before RUS, who won by 0.196 s. An earlier version stepped gaps at timing lines; it read as frozen for ~35 s at 1×.
- OpenF1 `pit.date` is the pit **exit** (0.88–0.95 lane-times after the in-lap's line, 36 stops measured). Race control writes `VSC DEPLOYED` / `VSC ENDING`, not the spelled-out form.
- The canvas reads the playback clock from a ref every frame; React state is sampled at 8 Hz. Don't put per-frame values in React state.
- **Team radio lives in the replay, not the dashboard.** `getReplayTimeline` returns `radio` clips (audio only — OpenF1 has no transcript, never invent text) and `"radio"` events. `useTeamRadio` plays one clip at a time with a 2-deep queue; the clock loop auto-plays clips it crosses at ≤2× (clips run in real time). Seeking stops radio; pausing the race pauses it. Browsers refuse audio no click started, so the first auto clip after page load can be held behind a "tap to hear it" chip. The dashboard's rail is `getRaceControl` / `RaceControlFeed` only — it also feeds the position worm's SC bands.
- **Post-race interviews** come from the FIA's press conference transcript (top three only — nothing exists for the rest of the field). `app/api/interviews/route.ts` fetches it server-side (fia.com has no CORS), with `year`/`race` validated so it can only ever request the FIA transcript URL pattern, cached 30 min. `services/fiaTranscript.js` parses line by line because pages differ (one `<p>` per line vs one `<p>` with `<br>`s); it returns null rather than guess. fia.com answers unknown URLs with its news index (200), so "not published" = no transcript found, not a 404. Never mock quotes. Run `node diag-interviews.mjs [year slug]` if the tab ever shows "not published" for an old race.
- **Motion is curved on purpose.** The reference line is a centripetal Catmull-Rom loop resampled at ~2 m, and distance-over-time is monotone-cubic, so heading and speed are continuous; GPS mode interpolates with the same spline. Straight segments between ~4 Hz GPS samples made cars snap direction (up to 27°/frame) and lurch in speed (up to 69%/frame) at 1×; the curves bring that to 7° and 25%. The replay draws its track from this same smoothed line — don't switch it back to `outline.sectors`, or cars sit off the drawn track in corners. Frame rate was never the problem: 60 fps with no frame over 20 ms, measured in headless Chrome.
- **2D / 3D toggle** (map panel, remembered in localStorage). `replay/Replay3D.tsx` is three.js, loaded with `next/dynamic` (no SSR) so the ~600 kB only downloads for people who switch. It owns no clock: it reads RaceReplay's `clockRef`, `focus` and `speakingRef` every frame like the canvas does, so switching mid-race carries on from the same instant. Elevation is the reference lap's GPS `z` (median-filtered, `pointAtDist3`), shown at true scale (`ELEVATION = 1`; the track is wider and the cars 2× real size, so hills read gentler than they are). Cars are one instanced fleet (`replay/buildCar.ts`, ~9 draw calls for the field — one mesh per car was ~750 and lagged); keep pixel ratio ≤1.5 and smoothing time-based (`1 - exp(-dt/τ)`). 3D places by timing only (no GPS), so the source chip is hidden there. No WebGL → `onUnsupported` falls back to 2D and hides the toggle.

### Homepage intro (`components/HomeIntro.tsx`)

The F1 mark is a hole in a black layer; the real hero video shows through it, reframed so the car sits inside the letterforms, then the hole scales ~70x around a point in the "1" (fly-through) while the footage eases back to normal framing. One rAF clock writes SVG attributes directly.

- **Plays every time home is shown** — landing, reload, or navigating back in the app. The play/skip check (`decide`) is pure, no storage, so React's dev double-invoke can't make it disagree with itself. Arriving through a page transition it waits for `transitionBusy()` to clear: the ribbons' tails reveal its black layer, then the mark wipes in.
- Skips: reduced motion, background tab, any click/key/scroll/touch, 7 s failsafe. Waits ≤1.5 s for the video to be playable (it's also the hero loader).
- `CAR` in HomeIntro is where the car sits in frame 0 of `car-reveal.mp4` — **re-measure it if the hero video changes**. While framing, the video element is sized to the whole picture: `object-fit: cover` crops to the element box and a transform scales the cropped box, which cut the car off on portrait phones.
- The mark is a vector (`lib/f1Mark.ts`, traced from the logo art, 97.8 % pixel overlap); the nav uses the same shape via `F1Mark`.

### Page transitions (`components/RouteCinematic.tsx`)

`useCinematic().play(href, label)` — nav links and the home cards call it (modifier clicks stay native). Two fat SVG strokes (F1 red, then carbon) are drawn along one S-shaped racing line with a moving dash, three top-down cars riding the leading edge; once covered, the destination name shows, the route changes, and the sweep waits for the new pathname (≥380 ms so the name can be read, ≤4 s) before the tails chase the heads off. Stroke width 1500 in a 1600×1000 `slice` box covers any aspect — re-check coverage (`isPointInStroke` over a grid) if the line or width changes. Portrait screens turn the box 90° so the sweep runs the long way. Reduced motion: plain navigation. Labels: `ROUTE_LABELS`.

### Teammate battles (`/teammates`)

Season-long head-to-head inside each team, **one team per screen**. `services/teammates.js` is pure (no fetch, no React) so `diag-teammates.mjs` prints the same tables from the live season — run it before changing a rule.

- **Jolpica only** (`/results`, `/qualifying`, `/sprint`, paged 100 rows at a time and stitched by round with `mergeRaces` — a race can straddle a page). Raw pages are fetched `store: false` (~600 kB a season); only the computed table is cached (`f1teammates:v3`, 6 h — bump the key when the shape changes).
- **Rows:** qualifying head-to-head, race head-to-head, reached Q2, reached Q3, points. **Rules:** the pair is the two drivers with the most races started together (others are listed as "also drove", not compared). Race counts only races **both were classified** in; the three qualifying rows count only sessions both took part in; sprints add to points, never to the race tally. "Reached Q2/Q3" = the `Q2`/`Q3` field is **present** on the Jolpica row (it's there, possibly empty, for anyone who was in that session) — not a position cut-off, which changes with grid size. The driver ahead (rows won, then points) takes the left seat.
- **The page never scrolls.** Wheel, arrow keys, swipe, the rail and the step buttons move between teams (championship order); the address follows as `#team-id` and opens on that team. After a wheel step, input is ignored until the wheel has been quiet for 160 ms — trackpad inertia outlasts any fixed lock and stepped two teams per flick.
- **Portraits** are formula1.com's season cutouts, address built from team + driver name (`seasonPortraitUrl` — pattern and slugs documented there, 22/22 for 2026; **re-check the team slugs each season**), cropped by their image server to waist-up 560×760. A 404 falls back to the drawn team-colour helmet. Only `media.formula1.com` is in the CSP `img-src`. Photos are never mirrored (logos would read backwards). The first request for a new crop is slow while their server generates it; the page preloads two teams either side.
- **Flags** are local files in `public/flags` (flag-icons, MIT), chosen by `FLAG_CODES` (Jolpica nationality → ISO code, curated in `f1Service.js`); an unmapped nationality shows no flag. Each is drawn whole, at its own 4:3 shape, across the top of the driver's column — filling the tall column cropped every flag to a slice (France read as blue and grey). Only the inner and lower edges are feathered, with two nested single masks (`mask-composite` did not apply reliably).
- Per-side motion variants are built by function, not read from `custom`: during an exit AnimatePresence passes its own `custom` (the step direction) to every child.
- The nav shows tab names from `lg` up and icons below: with five tabs the names wrapped at 1280.

### Head-to-Head (`/compare`)

Any two drivers from the latest race, in the Teammates visual language. The first screen is the verdict (`DriverSide` cutouts + flags, rows won, five headline rows); a strip of the whole field swaps either side; below, the page scrolls through numbered, unboxed sections (pace, race execution, lap trace, cumulative gap, lap duel, strategy) — the charts need the width, so unlike Teammates this page scrolls.

- **Picking:** "Left/Right" (or a side's Change button) chooses which side the next chip replaces. The address carries the pairing (`#rus-ver`) and opens on it; default is P1 v P2.
- **Colour:** each driver wears their team colour; for two drivers of the same team the right-hand one takes a neutral (`ALT_LIGHT`/`ALT_DARK`). The old fixed purple/green is gone.
- **Rows are data** (`RowDef`): `lower` = lower is better, `neutral` = no winner (e.g. "best lap on"), `scale` = the difference that counts as a lot for that metric. With a `scale` the winner's bar is full and the other shortens with the gap — a 0.05 s deficit must not look like half; without it bars are proportional (counts). The headline "rows won" counts only the five headline rows.
- `components/DriverCutout.tsx` is shared with Teammates (cutout, flag fade, helmet fallback, enter/show/exit variants inherited from the parent). `getDriverComparison` adds `portrait`, `thumb` (96 px face for the strip), `flag`, `nationality`, and the race identity; names use Jolpica's spelling (OpenF1 capitalises the surname).
- **Swap performance:** the verdict follows a pick at once; `Breakdown` (memoised) gets the pairing `DETAIL_DELAY_MS` later so six sections and the gap chart don't rebuild during the swap. Keep swap motion compositor-only: bars animate `scaleX` (not `width`), flags fade and drift (an animated `clip-path` repainted the 80 kB Spain/Mexico/Brazil flags every frame). Main-thread frame times were already clean when this stuttered — the cost was paint, which headless Chrome doesn't show.
- Data is OpenF1, so during a live F1 session the page falls back to demo data (no portraits there — helmets).

### Progressive loading

`TelemetryDashboard` fires all ~12 feeds independently and paints each panel as its data lands, rather than awaiting the slowest. Cheap Jolpica feeds are launched first for perceived speed. Panels render `PanelLoading` until their key is populated.

## Conventions

- **Services are `.js`, components are `.tsx`.** `allowJs` is on; the data layer is plain JavaScript with heavy JSDoc.
- **Path alias:** `@/*` → repo root (`@/services/f1Service`, `@/components/Panel`).
- **Timing display:** always use the `format.js` helpers. F1 convention is m:ss.mmm at or above a minute, raw seconds for sector splits — `formatLapTime` handles the switch, `formatClock` always shows m:ss, `formatSector` suffixes `s`.
- **Styling:** Tailwind with a custom `"Parc Fermé Dark"` token set in `tailwind.config.ts` — `carbon-*` surfaces, `f1red`, `sector-{purple,green,yellow}` (FIA timing-screen colours), `tyre-*` compound colours. Dark mode is hardcoded on `<html className="dark">`. Three font CSS variables (`--font-display` Titillium Web, `--font-body` Inter, `--font-timing` JetBrains Mono) are set in `app/layout.tsx`; timing data uses the mono face.
- **Motion primitives — reuse, don't reinvent.** All timings/eases live in `lib/motion.ts`. Page headlines use `PageTitle` (masked word rise → red rule wipe → meta). Headline figures use `CountUp` (never table cells — columns compared row-by-row stay static). Ticking readouts use `RollingDigits`; countdowns use `lib/useCountdown`. Every entrance must honour `useForceVisible()` (`initial={forceVisible ? false : ...}`) so content can never be stranded at opacity 0.
- **No decorative chrome.** No icons in panel headers, no emoji, no rounded-lg/xl cards — radii are `rounded-panel` / `rounded-row` only. Colour marks are 3px rules (`w-[3px]`), not dots or pills.
- **Curated tables need manual upkeep.** `COUNTRY_CODES` and `CIRCUIT_FACTS` in `f1Service.js` are hand-maintained because no API serves them; unmapped circuits degrade gracefully (`null` facts, `"No record on file"`). **Team colours live only in `services/teamColors.js`** — both APIs (Jolpica constructorId, OpenF1 team_name) resolve through `teamColorFor()`, so never read OpenF1's `team_colour` directly. Colours are tuned for the dark background (same-hue teams pushed apart), not copied from liveries; a team the table doesn't know falls back to the API's own hex.

## Heuristics that are intentionally conservative

Several derived metrics use thresholds chosen to avoid reporting things that didn't happen. Preserve the intent if you touch them:

- **Overtakes** (`getReplayEvents`) count only ±1 position swaps, skip the first 90s, exclude swaps within 35s of either car's pit stop, and merge repeat swaps of the same pair within 45s (DRS ping-pong).
- **Clean laps** for pace and degradation exclude pit-out laps, lap 1 (standing start), and anything more than 7% over that driver's median (safety car, traffic).
- **Vmax** uses the *second*-highest speed sample, so one glitched reading can't set a record.
- **Position worm** is derived from lap-completion timestamps rather than a positions endpoint — the rank of cumulative time to complete N laps *is* the order after lap N.
