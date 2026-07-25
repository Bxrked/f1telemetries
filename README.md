# 🏁 F1 Telemetries — f1telemetries.com

Live Formula 1 race analytics, self-updating after every Grand Prix.

Premium dark-mode race analytics dashboard for the **Monaco Grand Prix**, built with
Next.js (App Router), Tailwind CSS, Recharts and Lucide icons. Ships with a fully
mocked, API-shaped data layer so it runs immediately — and swaps to live data
(OpenF1 / Jolpica-Ergast) without touching a single component.

## Quick start

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Project structure

```
f1-telemetry-dashboard/
├── app/
│   ├── layout.tsx            # Fonts, metadata, global SiteNav
│   ├── globals.css           # Carbon-weave background, timing-screen utilities
│   ├── page.tsx              # Homepage (landing, countdown, section cards)
│   ├── telemetry/page.tsx    # Post-race telemetry dashboard
│   └── live/page.tsx         # Live race / broadcast replay
├── components/
│   ├── SiteNav.tsx             # Sticky global navigation
│   ├── HomeLanding.tsx         # Homepage hero, countdown, section cards
│   ├── LiveRacePage.tsx        # Live-race page shell (replay today, live later)
│   ├── RaceReplay.tsx          # Broadcast engine: dots, running order, seek/speed
│   ├── TelemetryDashboard.tsx  # Orchestrator: parallel data load + grid layout
│   ├── DashboardHeader.tsx     # Event title, round, live-feed badge
│   ├── Panel.tsx               # Shared card shell (red pit-board notch)
│   ├── ChartTooltip.tsx        # Shared dark Recharts tooltip
│   ├── TrackMap.tsx            # Live circuit outline traced from car telemetry
│   │                           #   (any track); Monaco fallback, animated car dot
│   ├── StatStrip.tsx           # Laps / length / lap record / track temp / weather
│   ├── SectorChart.tsx         # S1–S3 bars w/ FIA purple-green-yellow + mini-sectors
│   ├── TyreStintTimeline.tsx   # Per-driver compound stints scaled to lap count
│   ├── PitStopTable.tsx        # Pit-in/out, lane time, stationary leaderboard
│   ├── DegradationChart.tsx    # Lap time vs stint age + deg slope per compound
│   ├── PositionChanges.tsx     # Diverging grid→flag gain/loss bars
│   ├── DemographicsCard.tsx    # Age histogram, field average, team averages
│   ├── ScheduleStrip.tsx       # Season calendar + live countdown to next race
│   ├── StandingsPanel.tsx      # WDC / WCC standings, tabbed, points bars
│   └── TelemetryCharts.tsx     # Vmax speed trap + average racing pace
└── services/
    ├── config.js               # Live-data switch, season, endpoints, cache TTLs
    ├── format.js               # Shared lap/sector time formatters (m:ss.mmm)
    ├── apiClient.js            # Cached fetch (in-memory TTL + timeout)
    └── f1Service.js            # ⭐ LIVE Jolpica/OpenF1 getters w/ mock fallback
```

## Deploying (Vercel — free)

1. Push this folder to a GitHub repository.
2. Go to vercel.com → New Project → import the repo. Vercel auto-detects Next.js; no configuration needed.
3. Deploy. You get a permanent URL; every `git push` redeploys automatically.

Notes: all data fetching is client-side against public APIs, so no environment
variables or server config are required. Netlify and Cloudflare Pages work the
same way. When (if) you add the OpenF1 true-live subscription, its credentials
go in a Vercel environment variable + a Next.js route handler — never client code.

## Custom domain (f1telemetries.com)

After deploying to Vercel: Project → Settings → Domains → add `f1telemetries.com`
(and `www.f1telemetries.com`). Vercel shows the DNS records to add at your registrar —
typically an `A` record for the apex pointing at Vercel's IP, and a `CNAME` for `www`.
HTTPS is issued automatically once DNS propagates (usually minutes, up to 24h).

The domain is already wired into `app/layout.tsx` (metadata, Open Graph, canonical URLs),
`app/sitemap.ts` and `app/robots.ts` — no other changes needed.

## Live data status

| Feed | Source | Status |
|---|---|---|
| Season schedule + latest/next resolver | Jolpica | ✅ LIVE |
| Countdown to next race | Jolpica dates | ✅ LIVE |
| WDC / WCC standings | Jolpica | ✅ LIVE |
| Session info + circuit facts | Jolpica + curated | ✅ LIVE |
| Weather | OpenF1 | ✅ LIVE (best-effort) |
| Drivers / results / position changes / demographics | Jolpica | ✅ LIVE |
| Track outline (any circuit, traced from car telemetry) | OpenF1 /location | ✅ LIVE |
| Race replay: animated car dots + running order + gaps | OpenF1 location/position/intervals | ✅ LIVE (historical) |
| Replay events: overtake detection + SC/VSC/red/penalties | computed + OpenF1 race_control | ✅ LIVE |
| Team radio clips (real pit-wall audio, synced markers) | OpenF1 team_radio | ✅ LIVE |
| Position worm (lap-by-lap running order) | derived from OpenF1 laps | ✅ LIVE |
| Position worm (lap-by-lap running order) | OpenF1 position+laps (shared/cached) | ✅ LIVE |
| Sector analysis + lap duel (P1 vs P2) | OpenF1 laps | ✅ LIVE |
| Tyre stints | OpenF1 stints | ✅ LIVE |
| Pit stops (lane time, honest columns) | OpenF1 pit | ✅ LIVE |
| Tyre degradation (field-wide least-squares fit) | OpenF1 laps+stints | ✅ LIVE |
| Vmax speed traps + average pace | OpenF1 laps | ✅ LIVE |

Every live getter falls back to mock data on failure — the header badge
shows LIVE / PARTIAL LIVE / MOCK so you always know what you're looking at.
Master switch: `USE_LIVE_DATA` in `services/config.js`.

## Going live (API integration)

Every getter in `services/f1Service.js` is `async` and documents its real-world
mapping. Example:

```js
// before (mock)
export async function getPitStops() {
  await simulateLatency();
  return [...PIT_STOPS].sort((a, b) => a.stationary - b.stationary);
}

// after (live)
export async function getPitStops() {
  const res = await fetch(`https://api.openf1.org/v1/pit?session_key=${SESSION_KEY}`);
  const raw = await res.json();
  return raw.map(mapOpenF1Pit).sort((a, b) => a.stationary - b.stationary);
}
```

Components consume only the returned shapes — no refactor required.

## Design system — "Parc Fermé Dark"

| Token | Value | Use |
|---|---|---|
| `carbon.950 → 100` | `#08090C → #E7EAF0` | Carbon-fibre surface scale |
| `f1red` | `#E10600` / `#FF1E00` | Official F1 neon-red accent |
| `sector.purple` | `#B44CFF` | Overall fastest (FIA convention) |
| `sector.green` | `#2EE07C` | Personal best |
| `sector.yellow` | `#FFD644` | Slower |
| `tyre.*` | Pirelli sidewall colours | Soft / Medium / Hard / Inter / Wet |

Typography: **Titillium Web** (display — the family F1's brand uses),
**Inter** (body), **JetBrains Mono** (all timing values, tabular numerals).

Accessibility floor: responsive to mobile, `prefers-reduced-motion` respected,
fixed-height hover readouts so layouts never jump.
