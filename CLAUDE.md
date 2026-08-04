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

Three standalone Node scripts hit the live APIs and print geometry/health reports. They are the debugging tool for this codebase — read-only, no install, no dev server:

```bash
node diag.mjs        # what OpenF1 actually returns for the track trace (loop closure, teleports, grid-vs-track bounds)
node diag2.mjs       # tests the current trace algorithm against live data
node diag-track.mjs  # reproduces getTrackOutline() + replay dot placement, reports geometry
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

### Progressive loading

`TelemetryDashboard` fires all ~12 feeds independently and paints each panel as its data lands, rather than awaiting the slowest. Cheap Jolpica feeds are launched first for perceived speed. Panels render `PanelLoading` until their key is populated.

## Conventions

- **Services are `.js`, components are `.tsx`.** `allowJs` is on; the data layer is plain JavaScript with heavy JSDoc.
- **Path alias:** `@/*` → repo root (`@/services/f1Service`, `@/components/Panel`).
- **Timing display:** always use the `format.js` helpers. F1 convention is m:ss.mmm at or above a minute, raw seconds for sector splits — `formatLapTime` handles the switch, `formatClock` always shows m:ss, `formatSector` suffixes `s`.
- **Styling:** Tailwind with a custom `"Parc Fermé Dark"` token set in `tailwind.config.ts` — `carbon-*` surfaces, `f1red`, `sector-{purple,green,yellow}` (FIA timing-screen colours), `tyre-*` compound colours. Dark mode is hardcoded on `<html className="dark">`. Three font CSS variables (`--font-display` Titillium Web, `--font-body` Inter, `--font-timing` JetBrains Mono) are set in `app/layout.tsx`; timing data uses the mono face.
- **Curated tables need manual upkeep.** `CONSTRUCTOR_COLORS`, `COUNTRY_CODES`, and `CIRCUIT_FACTS` in `f1Service.js` are hand-maintained because no API serves them. Unmapped circuits degrade gracefully (`null` facts, `"No record on file"`); unmapped constructors fall back to grey `#8B95A7`.

## Heuristics that are intentionally conservative

Several derived metrics use thresholds chosen to avoid reporting things that didn't happen. Preserve the intent if you touch them:

- **Overtakes** (`getReplayEvents`) count only ±1 position swaps, skip the first 90s, exclude swaps within 35s of either car's pit stop, and merge repeat swaps of the same pair within 45s (DRS ping-pong).
- **Clean laps** for pace and degradation exclude pit-out laps, lap 1 (standing start), and anything more than 7% over that driver's median (safety car, traffic).
- **Vmax** uses the *second*-highest speed sample, so one glitched reading can't set a record.
- **Position worm** is derived from lap-completion timestamps rather than a positions endpoint — the rank of cumulative time to complete N laps *is* the order after lap N.
