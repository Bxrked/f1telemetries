/**
 * f1Service.js — Data abstraction layer (LIVE + mock fallback)
 * ------------------------------------------------------------------
 * Every getter tries the live API first (Jolpica for race-level data,
 * OpenF1 for telemetry-grade data), and silently falls back to mock
 * data if the fetch fails or USE_LIVE_DATA is off. The dashboard can
 * read getFeedStatus() to display which mode each feed resolved to.
 *
 * LIVE TODAY (step 1–2): schedule, standings, session info + weather,
 *   drivers, position changes, demographics.
 * STILL MOCK (step 3–4): sectors, stints, pit stops, degradation,
 *   performance — these need raw-lap computation, coming next.
 * ------------------------------------------------------------------
 */

import { USE_LIVE_DATA, SEASON, JOLPICA_BASE, OPENF1_BASE, TTL } from "./config";
import { fetchJson } from "./apiClient";

/* ================================================================
 * FEED STATUS + FALLBACK WRAPPER
 * ================================================================ */

const feedStatus = {};

async function withFallback(name, liveFn, mockFn) {
  if (USE_LIVE_DATA && typeof fetch !== "undefined") {
    try {
      const out = await liveFn();
      feedStatus[name] = "live";
      return out;
    } catch (err) {
      // Graceful degradation: log once, serve the mock, keep the UI alive.
      console.warn(`[f1Service] ${name}: live fetch failed → mock fallback (${err?.message})`);
    }
  }
  feedStatus[name] = "mock";
  return mockFn();
}

/** Aggregate feed mode for the header badge: live | partial | mock. */
export function getFeedStatus() {
  const vals = Object.values(feedStatus);
  const live = vals.filter((v) => v === "live").length;
  const mode = !vals.length || live === 0 ? "mock" : live === vals.length ? "live" : "partial";
  return { mode, live, total: vals.length, detail: { ...feedStatus } };
}

/* ================================================================
 * LIVE MAPPING TABLES
 * (colours / circuit facts aren't served by any API — curated here)
 * ================================================================ */

const CONSTRUCTOR_COLORS = {
  red_bull: "#3671C6",
  ferrari: "#E8002D",
  mclaren: "#FF8000",
  mercedes: "#27F4D2",
  aston_martin: "#229971",
  williams: "#64C4FF",
  alpine: "#0093CC",
  sauber: "#52E252",
  audi: "#52E252",
  rb: "#6692FF",
  racing_bulls: "#6692FF",
  haas: "#B6BABD",
};
const teamColor = (constructorId) => CONSTRUCTOR_COLORS[constructorId] ?? "#8B95A7";

const COUNTRY_CODES = {
  Australia: "AUS", China: "CHN", Japan: "JPN", Bahrain: "BHR",
  "Saudi Arabia": "SAU", USA: "USA", "United States": "USA", Italy: "ITA",
  Monaco: "MON", Canada: "CAN", Spain: "ESP", Austria: "AUT",
  UK: "GBR", "Great Britain": "GBR", Hungary: "HUN", Belgium: "BEL",
  Netherlands: "NED", Azerbaijan: "AZE", Singapore: "SGP", Mexico: "MEX",
  Brazil: "BRA", Qatar: "QAT", UAE: "UAE", "United Arab Emirates": "UAE",
};
const countryCode = (c) => COUNTRY_CODES[c] ?? (c ?? "").slice(0, 3).toUpperCase();

/** Static circuit facts by Ergast circuitId (decorative metadata). */
const CIRCUIT_FACTS = {
  monaco:        { lengthKm: 3.337, corners: 19, record: { time: "1:12.909", driver: "Lewis Hamilton", year: 2021 } },
  silverstone:   { lengthKm: 5.891, corners: 18, record: { time: "1:27.097", driver: "Max Verstappen", year: 2020 } },
  red_bull_ring: { lengthKm: 4.318, corners: 10, record: { time: "1:05.619", driver: "Carlos Sainz", year: 2020 } },
  villeneuve:    { lengthKm: 4.361, corners: 14, record: { time: "1:13.078", driver: "Valtteri Bottas", year: 2019 } },
  hungaroring:   { lengthKm: 4.381, corners: 14, record: { time: "1:16.627", driver: "Lewis Hamilton", year: 2020 } },
  monza:         { lengthKm: 5.793, corners: 11, record: { time: "1:21.046", driver: "Rubens Barrichello", year: 2004 } },
  spa:           { lengthKm: 7.004, corners: 19, record: { time: "1:46.286", driver: "Valtteri Bottas", year: 2018 } },
  suzuka:        { lengthKm: 5.807, corners: 18, record: { time: "1:30.983", driver: "Lewis Hamilton", year: 2019 } },
  jeddah:        { lengthKm: 6.174, corners: 27, record: { time: "1:30.734", driver: "Lewis Hamilton", year: 2021 } },
  imola:         { lengthKm: 4.909, corners: 19, record: { time: "1:15.484", driver: "Lewis Hamilton", year: 2020 } },
  zandvoort:     { lengthKm: 4.259, corners: 14, record: { time: "1:11.097", driver: "Lewis Hamilton", year: 2021 } },
  americas:      { lengthKm: 5.513, corners: 20, record: { time: "1:36.169", driver: "Charles Leclerc", year: 2019 } },
  rodriguez:     { lengthKm: 4.304, corners: 17, record: { time: "1:17.774", driver: "Valtteri Bottas", year: 2021 } },
  interlagos:    { lengthKm: 4.309, corners: 15, record: { time: "1:10.540", driver: "Valtteri Bottas", year: 2018 } },
  yas_marina:    { lengthKm: 5.281, corners: 16, record: { time: "1:26.103", driver: "Max Verstappen", year: 2021 } },
  albert_park:   { lengthKm: 5.278, corners: 14, record: { time: "1:19.813", driver: "Charles Leclerc", year: 2024 } },
  shanghai:      { lengthKm: 5.451, corners: 16, record: { time: "1:32.238", driver: "Michael Schumacher", year: 2004 } },
  baku:          { lengthKm: 6.003, corners: 20, record: { time: "1:43.009", driver: "Charles Leclerc", year: 2019 } },
};

/* ================================================================
 * LIVE FETCHERS — Jolpica (Ergast-compatible)
 * ================================================================ */

const raceDateIso = (race) =>
  race.time ? `${race.date}T${race.time}` : `${race.date}T14:00:00Z`;

async function jolpicaSchedule() {
  const json = await fetchJson(`${JOLPICA_BASE}/${SEASON}.json?limit=100`, { ttl: TTL.schedule });
  const table = json?.MRData?.RaceTable;
  if (!table?.Races?.length) throw new Error("empty race table");
  return table;
}

/** One call returns every race winner of the season (position=1 filter). */
async function jolpicaSeasonWinners() {
  const json = await fetchJson(`${JOLPICA_BASE}/${SEASON}/results/1.json?limit=100`, { ttl: TTL.results });
  const map = {};
  (json?.MRData?.RaceTable?.Races ?? []).forEach((r) => {
    map[+r.round] = {
      winner: r.Results?.[0]?.Driver?.code ?? null,
      laps: +(r.Results?.[0]?.laps ?? 0) || null,
    };
  });
  return map;
}

async function jolpicaLatestRaceResults() {
  const json = await fetchJson(`${JOLPICA_BASE}/${SEASON}/last/results.json?limit=100`, { ttl: TTL.results });
  const race = json?.MRData?.RaceTable?.Races?.[0];
  if (!race?.Results?.length) throw new Error("no completed race results yet");
  return race;
}

const ageFrom = (dobIso) => {
  if (!dobIso) return null;
  const dob = new Date(dobIso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
};

const mapResultRow = (r, fieldSize) => {
  const grid = +r.grid === 0 ? fieldSize : +r.grid; // grid 0 = pit-lane start
  const finish = +r.position;
  const finished = r.status === "Finished" || /^\+\d+ Laps?$/.test(r.status);
  return {
    id: +r.number,
    code: r.Driver.code ?? r.Driver.familyName.slice(0, 3).toUpperCase(),
    name: `${r.Driver.givenName} ${r.Driver.familyName}`,
    team: r.Constructor.constructorId,
    teamName: r.Constructor.name,
    teamColor: teamColor(r.Constructor.constructorId),
    age: ageFrom(r.Driver.dateOfBirth),
    grid,
    finish,
    points: +r.points,
    status: r.status,
    dnf: !finished,
    delta: grid - finish,
  };
};

/* ================================================================
 * LIVE FETCHERS — OpenF1 (session resolver + weather)
 * ================================================================ */

/**
 * Session resolver: match the latest Jolpica race to an OpenF1 race
 * session by date (same weekend). Returns the session_key that all
 * OpenF1 telemetry endpoints require (used by the step 3–4 getters).
 */
export async function resolveOpenF1Session(race) {
  const year = +race.season;
  const sessions = await fetchJson(
    `${OPENF1_BASE}/sessions?year=${year}&session_name=Race`,
    { ttl: TTL.sessions }
  );
  if (!Array.isArray(sessions) || !sessions.length) throw new Error("no OpenF1 sessions");
  const raceTime = new Date(raceDateIso(race)).getTime();
  const DAY = 86_400_000;
  const match = sessions.find(
    (s) => Math.abs(new Date(s.date_start).getTime() - raceTime) < 2 * DAY
  );
  if (!match) throw new Error("no OpenF1 session matched race date");
  return { sessionKey: match.session_key, meetingKey: match.meeting_key };
}

async function openF1LatestWeather(sessionKey) {
  const samples = await fetchJson(
    `${OPENF1_BASE}/weather?session_key=${sessionKey}`,
    { ttl: TTL.weather }
  );
  if (!Array.isArray(samples) || !samples.length) throw new Error("no weather samples");
  const w = samples[samples.length - 1];
  return {
    condition: w.rainfall > 0 ? "Rain" : "Clear",
    airTempC: Math.round(w.air_temperature),
    trackTempC: Math.round(w.track_temperature),
    humidityPct: Math.round(w.humidity),
    windKph: Math.round((w.wind_speed ?? 0) * 3.6),
    rainProbabilityPct: w.rainfall > 0 ? 90 : 5,
  };
}

/* ================================================================
 * MOCK REFERENCE DATA — Monaco Grand Prix (unchanged fallback)
 * ================================================================ */

const SIMULATED_LATENCY_MS = 350;
const simulateLatency = () =>
  new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));

export const TEAMS = {
  RBR: { name: "Red Bull Racing", color: "#3671C6" },
  FER: { name: "Ferrari", color: "#E8002D" },
  MCL: { name: "McLaren", color: "#FF8000" },
  MER: { name: "Mercedes", color: "#27F4D2" },
  AST: { name: "Aston Martin", color: "#229971" },
  WIL: { name: "Williams", color: "#64C4FF" },
  ALP: { name: "Alpine", color: "#0093CC" },
  SAU: { name: "Sauber", color: "#52E252" },
};

const DRIVERS = [
  { id: 16, code: "LEC", name: "Charles Leclerc",  team: "FER", age: 28, grid: 1,  finish: 1,  points: 25 },
  { id: 4,  code: "NOR", name: "Lando Norris",     team: "MCL", age: 26, grid: 3,  finish: 2,  points: 18 },
  { id: 1,  code: "VER", name: "Max Verstappen",   team: "RBR", age: 28, grid: 2,  finish: 3,  points: 15 },
  { id: 81, code: "PIA", name: "Oscar Piastri",    team: "MCL", age: 25, grid: 4,  finish: 4,  points: 12 },
  { id: 63, code: "RUS", name: "George Russell",   team: "MER", age: 28, grid: 6,  finish: 5,  points: 10 },
  { id: 44, code: "HAM", name: "Lewis Hamilton",   team: "FER", age: 41, grid: 5,  finish: 6,  points: 8 },
  { id: 23, code: "ALB", name: "Alex Albon",       team: "WIL", age: 30, grid: 11, finish: 7,  points: 6 },
  { id: 55, code: "SAI", name: "Carlos Sainz",     team: "WIL", age: 31, grid: 9,  finish: 8,  points: 4 },
  { id: 14, code: "ALO", name: "Fernando Alonso",  team: "AST", age: 44, grid: 7,  finish: 9,  points: 2 },
  { id: 10, code: "GAS", name: "Pierre Gasly",     team: "ALP", age: 30, grid: 12, finish: 10, points: 1 },
  { id: 27, code: "HUL", name: "Nico Hülkenberg",  team: "SAU", age: 38, grid: 10, finish: 11, points: 0 },
  { id: 18, code: "STR", name: "Lance Stroll",     team: "AST", age: 27, grid: 8,  finish: 12, points: 0 },
];

const SESSION = {
  meetingName: "Monaco Grand Prix",
  circuitName: "Circuit de Monaco",
  location: "Monte Carlo, Monaco",
  round: 8,
  season: 2026,
  sessionType: "Race",
  totalLaps: 78,
  trackLengthKm: 3.337,
  lapRecord: { time: "1:12.909", driver: "Lewis Hamilton", year: 2021 },
  weather: {
    condition: "Clear",
    airTempC: 26,
    trackTempC: 42,
    humidityPct: 58,
    windKph: 9,
    rainProbabilityPct: 5,
  },
  corners: 19,
  drsZones: 1,
};

const SECTOR_TIMES = [
  { code: "LEC", s1: 18.412, s2: 33.981, s3: 19.902 },
  { code: "NOR", s1: 18.487, s2: 33.845, s3: 19.964 },
  { code: "VER", s1: 18.455, s2: 33.899, s3: 20.041 },
  { code: "PIA", s1: 18.552, s2: 33.918, s3: 20.087 },
  { code: "RUS", s1: 18.601, s2: 34.102, s3: 20.114 },
  { code: "HAM", s1: 18.577, s2: 34.055, s3: 20.052 },
  { code: "ALB", s1: 18.734, s2: 34.288, s3: 20.233 },
  { code: "SAI", s1: 18.699, s2: 34.310, s3: 20.198 },
];

const MINI_SECTORS = {
  driverA: "LEC",
  driverB: "NOR",
  splits: ["A", "A", "B", "A", "EQ", "B", "B", "A", "A", "B", "A", "A", "EQ", "B", "A", "B", "A", "A"],
};

const STINTS = [
  { code: "LEC", stints: [{ compound: "MEDIUM", from: 1, to: 32 }, { compound: "HARD", from: 33, to: 78 }] },
  { code: "NOR", stints: [{ compound: "MEDIUM", from: 1, to: 35 }, { compound: "HARD", from: 36, to: 78 }] },
  { code: "VER", stints: [{ compound: "MEDIUM", from: 1, to: 29 }, { compound: "HARD", from: 30, to: 78 }] },
  { code: "PIA", stints: [{ compound: "HARD", from: 1, to: 44 }, { compound: "MEDIUM", from: 45, to: 78 }] },
  { code: "RUS", stints: [{ compound: "MEDIUM", from: 1, to: 33 }, { compound: "HARD", from: 34, to: 78 }] },
  { code: "HAM", stints: [{ compound: "HARD", from: 1, to: 47 }, { compound: "MEDIUM", from: 48, to: 78 }] },
  { code: "ALB", stints: [{ compound: "SOFT", from: 1, to: 18 }, { compound: "HARD", from: 19, to: 55 }, { compound: "SOFT", from: 56, to: 78 }] },
  { code: "SAI", stints: [{ compound: "MEDIUM", from: 1, to: 38 }, { compound: "HARD", from: 39, to: 78 }] },
  { code: "ALO", stints: [{ compound: "HARD", from: 1, to: 50 }, { compound: "MEDIUM", from: 51, to: 78 }] },
  { code: "GAS", stints: [{ compound: "SOFT", from: 1, to: 21 }, { compound: "HARD", from: 22, to: 78 }] },
  { code: "HUL", stints: [{ compound: "MEDIUM", from: 1, to: 40 }, { compound: "HARD", from: 41, to: 78 }] },
  { code: "STR", stints: [{ compound: "MEDIUM", from: 1, to: 31 }, { compound: "HARD", from: 32, to: 78 }] },
];

const PIT_STOPS = [
  { code: "NOR", lap: 35, stationary: 2.02, pitIn: "1:04:11.204", pitOut: "1:04:31.882", laneTime: 20.678 },
  { code: "VER", lap: 29, stationary: 2.11, pitIn: "0:53:02.117", pitOut: "0:53:22.930", laneTime: 20.813 },
  { code: "LEC", lap: 32, stationary: 2.24, pitIn: "0:58:41.664", pitOut: "0:59:02.591", laneTime: 20.927 },
  { code: "RUS", lap: 33, stationary: 2.31, pitIn: "1:00:38.409", pitOut: "1:00:59.412", laneTime: 21.003 },
  { code: "PIA", lap: 44, stationary: 2.19, pitIn: "1:20:19.958", pitOut: "1:20:40.812", laneTime: 20.854 },
  { code: "HAM", lap: 47, stationary: 2.40, pitIn: "1:25:57.330", pitOut: "1:26:18.451", laneTime: 21.121 },
  { code: "SAI", lap: 38, stationary: 2.47, pitIn: "1:09:44.271", pitOut: "1:10:05.470", laneTime: 21.199 },
  { code: "ALB", lap: 19, stationary: 2.28, pitIn: "0:34:29.815", pitOut: "0:34:50.767", laneTime: 20.952 },
  { code: "ALB", lap: 55, stationary: 2.35, pitIn: "1:40:12.007", pitOut: "1:40:33.038", laneTime: 21.031 },
  { code: "ALO", lap: 50, stationary: 2.58, pitIn: "1:31:23.554", pitOut: "1:31:44.870", laneTime: 21.316 },
  { code: "GAS", lap: 21, stationary: 2.66, pitIn: "0:38:07.442", pitOut: "0:38:28.848", laneTime: 21.406 },
  { code: "HUL", lap: 40, stationary: 2.72, pitIn: "1:13:20.190", pitOut: "1:13:41.663", laneTime: 21.473 },
  { code: "STR", lap: 31, stationary: 2.91, pitIn: "0:56:49.026", pitOut: "0:57:10.702", laneTime: 21.676 },
];

const PERFORMANCE = [
  { code: "VER", vmax: 296.4, avgPace: 76.41 },
  { code: "LEC", vmax: 294.8, avgPace: 76.18 },
  { code: "NOR", vmax: 293.9, avgPace: 76.25 },
  { code: "PIA", vmax: 293.1, avgPace: 76.52 },
  { code: "HAM", vmax: 292.6, avgPace: 76.77 },
  { code: "RUS", vmax: 291.8, avgPace: 76.70 },
  { code: "SAI", vmax: 290.9, avgPace: 77.12 },
  { code: "ALB", vmax: 290.2, avgPace: 77.05 },
  { code: "ALO", vmax: 288.7, avgPace: 77.36 },
  { code: "GAS", vmax: 288.1, avgPace: 77.49 },
  { code: "HUL", vmax: 287.4, avgPace: 77.63 },
  { code: "STR", vmax: 286.8, avgPace: 77.81 },
];

const seeded = (seed) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const DEG_MODEL = [
  { compound: "SOFT",   base: 74.62, slope: 0.112 },
  { compound: "MEDIUM", base: 75.08, slope: 0.064 },
  { compound: "HARD",   base: 75.58, slope: 0.037 },
];

const buildDegradationSeries = (laps = 26) => {
  const rand = seeded(2026);
  return Array.from({ length: laps }, (_, i) => {
    const lap = i + 1;
    const row = { lap };
    DEG_MODEL.forEach(({ compound, base, slope }) => {
      const noise = (rand() - 0.5) * 0.14;
      row[compound] = +(base + slope * lap + noise).toFixed(3);
    });
    return row;
  });
};

const daysFromNow = (days, hour = 15) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const MOCK_SCHEDULE = [
  { round: 1,  gp: "Australian GP",     circuit: "Albert Park",       country: "AUS", date: daysFromNow(-110), winner: "VER" },
  { round: 2,  gp: "Chinese GP",        circuit: "Shanghai",          country: "CHN", date: daysFromNow(-96),  winner: "NOR" },
  { round: 3,  gp: "Japanese GP",       circuit: "Suzuka",            country: "JPN", date: daysFromNow(-82),  winner: "VER" },
  { round: 4,  gp: "Bahrain GP",        circuit: "Sakhir",            country: "BHR", date: daysFromNow(-68),  winner: "LEC" },
  { round: 5,  gp: "Saudi Arabian GP",  circuit: "Jeddah",            country: "SAU", date: daysFromNow(-61),  winner: "PIA" },
  { round: 6,  gp: "Miami GP",          circuit: "Miami",             country: "USA", date: daysFromNow(-40),  winner: "NOR" },
  { round: 7,  gp: "Emilia-Romagna GP", circuit: "Imola",             country: "ITA", date: daysFromNow(-26),  winner: "LEC" },
  { round: 8,  gp: "Monaco GP",         circuit: "Monte Carlo",       country: "MON", date: daysFromNow(-12),  winner: "LEC" },
  { round: 9,  gp: "Canadian GP",       circuit: "Gilles Villeneuve", country: "CAN", date: daysFromNow(9) },
  { round: 10, gp: "Austrian GP",       circuit: "Red Bull Ring",     country: "AUT", date: daysFromNow(23) },
  { round: 11, gp: "British GP",        circuit: "Silverstone",       country: "GBR", date: daysFromNow(37) },
  { round: 12, gp: "Hungarian GP",      circuit: "Hungaroring",       country: "HUN", date: daysFromNow(51) },
];

const DRIVER_STANDINGS = [
  { code: "LEC", points: 161, wins: 3 },
  { code: "NOR", points: 158, wins: 2 },
  { code: "VER", points: 149, wins: 2 },
  { code: "PIA", points: 141, wins: 1 },
  { code: "RUS", points: 98,  wins: 0 },
  { code: "HAM", points: 92,  wins: 0 },
  { code: "ALB", points: 44,  wins: 0 },
  { code: "SAI", points: 39,  wins: 0 },
  { code: "ALO", points: 27,  wins: 0 },
  { code: "GAS", points: 15,  wins: 0 },
  { code: "HUL", points: 9,   wins: 0 },
  { code: "STR", points: 8,   wins: 0 },
];

/* ================================================================
 * MOCK BUILDERS (fallback bodies)
 * ================================================================ */

const mockDrivers = () =>
  DRIVERS.map((d) => ({
    ...d,
    teamName: TEAMS[d.team].name,
    teamColor: TEAMS[d.team].color,
    dnf: false,
    status: "Finished",
    delta: d.grid - d.finish,
  }));

const mockSchedule = () => {
  const now = Date.now();
  const rounds = MOCK_SCHEDULE.map((r) => ({
    ...r,
    status: new Date(r.date).getTime() < now ? "completed" : "upcoming",
  }));
  const completed = rounds.filter((r) => r.status === "completed");
  return {
    season: SESSION.season,
    rounds,
    latest: completed[completed.length - 1] ?? null,
    nextRace: rounds.find((r) => r.status === "upcoming") ?? null,
  };
};

const mockStandings = () => {
  const drivers = DRIVER_STANDINGS.map((s, i) => {
    const d = DRIVERS.find((x) => x.code === s.code);
    return {
      pos: i + 1,
      ...s,
      name: d.name,
      teamName: TEAMS[d.team].name,
      teamColor: TEAMS[d.team].color,
      gap: DRIVER_STANDINGS[0].points - s.points,
    };
  });
  const byTeam = {};
  DRIVER_STANDINGS.forEach((s) => {
    const d = DRIVERS.find((x) => x.code === s.code);
    byTeam[d.team] = (byTeam[d.team] ?? 0) + s.points;
  });
  const constructors = Object.entries(byTeam)
    .map(([key, points]) => ({ team: TEAMS[key].name, color: TEAMS[key].color, points }))
    .sort((a, b) => b.points - a.points)
    .map((c, i, arr) => ({ pos: i + 1, ...c, gap: arr[0].points - c.points }));
  return { afterRound: 8, drivers, constructors };
};

const demographicsFrom = (drivers) => {
  const withAge = drivers.filter((d) => d.age != null);
  const bins = [
    { label: "20–24", min: 20, max: 24 },
    { label: "25–29", min: 25, max: 29 },
    { label: "30–34", min: 30, max: 34 },
    { label: "35–39", min: 35, max: 39 },
    { label: "40+", min: 40, max: 99 },
  ];
  const distribution = bins.map((b) => ({
    bin: b.label,
    count: withAge.filter((d) => d.age >= b.min && d.age <= b.max).length,
  }));
  const averageAge = +(withAge.reduce((s, d) => s + d.age, 0) / withAge.length).toFixed(1);
  const byTeam = {};
  withAge.forEach((d) => {
    (byTeam[d.teamName] ??= { color: d.teamColor, ages: [] }).ages.push(d.age);
  });
  const teamAges = Object.entries(byTeam)
    .map(([team, { color, ages }]) => ({
      team,
      color,
      avgAge: +(ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1),
    }))
    .sort((a, b) => a.avgAge - b.avgAge);
  return {
    distribution,
    averageAge,
    teamAges,
    youngest: Math.min(...withAge.map((d) => d.age)),
    oldest: Math.max(...withAge.map((d) => d.age)),
  };
};

/* ================================================================
 * PUBLIC API
 * ================================================================ */

/** Season calendar + latest/next race resolver (Jolpica). */
export async function getSeasonSchedule() {
  return withFallback(
    "schedule",
    async () => {
      const [table, winners] = await Promise.all([jolpicaSchedule(), jolpicaSeasonWinners()]);
      const now = Date.now();
      const rounds = table.Races.map((r) => ({
        round: +r.round,
        gp: r.raceName.replace(" Grand Prix", " GP"),
        circuit: r.Circuit.circuitName,
        circuitId: r.Circuit.circuitId,
        country: countryCode(r.Circuit.Location?.country),
        date: raceDateIso(r),
        winner: winners[+r.round]?.winner ?? null,
        laps: winners[+r.round]?.laps ?? null,
        status: new Date(raceDateIso(r)).getTime() < now ? "completed" : "upcoming",
      }));
      const completed = rounds.filter((r) => r.status === "completed" && r.winner);
      return {
        season: +table.season,
        rounds,
        latest: completed[completed.length - 1] ?? null,
        nextRace: rounds.find((r) => r.status === "upcoming") ?? null,
      };
    },
    async () => {
      await simulateLatency();
      return mockSchedule();
    }
  );
}

/** WDC + WCC standings (Jolpica). */
export async function getStandings() {
  return withFallback(
    "standings",
    async () => {
      const [dj, cj] = await Promise.all([
        fetchJson(`${JOLPICA_BASE}/${SEASON}/driverstandings.json?limit=100`, { ttl: TTL.standings }),
        fetchJson(`${JOLPICA_BASE}/${SEASON}/constructorstandings.json?limit=100`, { ttl: TTL.standings }),
      ]);
      const dl = dj?.MRData?.StandingsTable?.StandingsLists?.[0];
      const cl = cj?.MRData?.StandingsTable?.StandingsLists?.[0];
      if (!dl?.DriverStandings?.length) throw new Error("no driver standings yet");
      const leaderPts = +dl.DriverStandings[0].points;
      const drivers = dl.DriverStandings.map((s) => ({
        pos: +s.position,
        code: s.Driver.code ?? s.Driver.familyName.slice(0, 3).toUpperCase(),
        name: `${s.Driver.givenName} ${s.Driver.familyName}`,
        points: +s.points,
        wins: +s.wins,
        teamName: s.Constructors?.[0]?.name ?? "—",
        teamColor: teamColor(s.Constructors?.[0]?.constructorId),
        gap: leaderPts - +s.points,
      }));
      const cLeaderPts = +(cl?.ConstructorStandings?.[0]?.points ?? 0);
      const constructors = (cl?.ConstructorStandings ?? []).map((s) => ({
        pos: +s.position,
        team: s.Constructor.name,
        color: teamColor(s.Constructor.constructorId),
        points: +s.points,
        gap: cLeaderPts - +s.points,
      }));
      return { afterRound: +dl.round, drivers, constructors };
    },
    async () => {
      await simulateLatency();
      return mockStandings();
    }
  );
}

/** Session info: latest race identity + circuit facts + live weather. */
export async function getSessionInfo() {
  return withFallback(
    "session",
    async () => {
      const race = await jolpicaLatestRaceResults();
      const facts = CIRCUIT_FACTS[race.Circuit.circuitId] ?? {};
      /* Weather is best-effort: a miss here shouldn't sink session info. */
      let weather = { ...SESSION.weather };
      try {
        const { sessionKey } = await resolveOpenF1Session(race);
        weather = await openF1LatestWeather(sessionKey);
      } catch (err) {
        console.warn(`[f1Service] weather unavailable, using defaults (${err?.message})`);
      }
      return {
        meetingName: race.raceName,
        circuitName: race.Circuit.circuitName,
        location: `${race.Circuit.Location.locality}, ${race.Circuit.Location.country}`,
        round: +race.round,
        season: +race.season,
        sessionType: "Race",
        totalLaps: +race.Results[0].laps,
        trackLengthKm: facts.lengthKm ?? null,
        lapRecord: facts.record ?? { time: "—", driver: "No record on file", year: "" },
        weather,
        corners: facts.corners ?? null,
        drsZones: null,
      };
    },
    async () => {
      await simulateLatency();
      return { ...SESSION };
    }
  );
}

/** Latest race classification (Jolpica /last/results). */
export async function getDrivers() {
  return withFallback(
    "drivers",
    async () => {
      const race = await jolpicaLatestRaceResults();
      return race.Results.map((r) => mapResultRow(r, race.Results.length));
    },
    async () => {
      await simulateLatency();
      return mockDrivers();
    }
  );
}

/** Grid → flag deltas, sorted by biggest gain. */
export async function getPositionChanges() {
  const drivers = await getDrivers();
  feedStatus.positions = feedStatus.drivers;
  return drivers
    .map(({ code, name, teamColor, grid, finish, delta, dnf, status }) => ({
      code, name, teamColor, grid, finish, delta, dnf, status,
    }))
    .sort((a, b) => b.delta - a.delta);
}

/** Field demographics — computed from whichever driver set resolved. */
export async function getDemographics() {
  const drivers = await getDrivers();
  feedStatus.demographics = feedStatus.drivers;
  return demographicsFrom(drivers);
}


/**
 * Clean a raw GPS trace into a drawable racing line.
 * OpenF1 location data can contain teleports: duplicate timestamps,
 * momentary dropouts, or samples that slip in from another lap/driver.
 * Connecting those in time order draws long chords straight across the
 * circuit — the "map crosses itself" symptom. We drop any sample that
 * jumps more than a few multiples of the median step from the last good
 * point, which removes the chords while keeping the true racing line.
 */
function cleanTracePoints(pts) {
  if (pts.length < 20) return pts;
  const steps = [];
  for (let i = 1; i < pts.length; i++) {
    steps.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const sorted = [...steps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const limit = median * 6;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    if (Math.hypot(pts[i][0] - prev[0], pts[i][1] - prev[1]) <= limit) out.push(pts[i]);
  }
  return out;
}

/** A valid lap trace must return roughly to where it started. */
function traceClosesLoop(pts, tolerance = 0.25) {
  if (pts.length < 20) return false;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const gap = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return diag > 0 && gap / diag <= tolerance;
}

/**
 * Track outline traced from real car telemetry (OpenF1 /location).
 * One clean mid-race lap from any driver draws the circuit for ANY
 * track; sector boundaries are split by the lap's sector timestamps.
 * Returns null on fallback → TrackMap renders the illustrative layout.
 */
export async function getTrackOutline() {
  return withFallback(
    "trackOutline",
    async () => {
      const race = await jolpicaLatestRaceResults();
      const { sessionKey } = await resolveOpenF1Session(race);

      /* Pick a clean reference lap from a mid-race window: all sectors
         timed, not a pit-out lap. Window > single lap = far more robust. */
      const laps = await fetchJson(
        `${OPENF1_BASE}/laps?session_key=${sessionKey}&lap_number>=8&lap_number<=14`,
        { ttl: TTL.sessions, timeout: 20_000 }
      );
      const lap = (Array.isArray(laps) ? laps : []).find(
        (l) =>
          l.date_start &&
          l.duration_sector_1 &&
          l.duration_sector_2 &&
          l.duration_sector_3 &&
          !l.is_pit_out_lap
      );
      if (!lap) throw new Error(`no clean reference lap (got ${Array.isArray(laps) ? laps.length : 0} rows)`);

      const t0 = new Date(lap.date_start).getTime();
      const totalMs =
        (lap.lap_duration ??
          lap.duration_sector_1 + lap.duration_sector_2 + lap.duration_sector_3) * 1000;
      const iso = (ms) => new Date(ms).toISOString();

      /* ~3.7 Hz positional samples across exactly one lap (~280 points). */
      const raw = await fetchJson(
        `${OPENF1_BASE}/location?session_key=${sessionKey}` +
          `&driver_number=${lap.driver_number}` +
          `&date>${encodeURIComponent(iso(t0))}&date<${encodeURIComponent(iso(t0 + totalMs))}`,
        { ttl: TTL.sessions, timeout: 30_000 }
      );
      if (!Array.isArray(raw) || raw.length < 50)
        throw new Error(`insufficient location samples (got ${Array.isArray(raw) ? raw.length : "non-array"})`);

      /* Keep only this driver's samples inside the lap window, drop
         null/zero fixes, then strip teleports before drawing. */
      const cleaned = raw
        .filter((p) => p.x != null && p.y != null && !(p.x === 0 && p.y === 0))
        .filter((p) => p.driver_number == null || p.driver_number === lap.driver_number)
        .map((p) => ({ ...p, _t: new Date(p.date).getTime() }))
        .filter((p) => p._t >= t0 && p._t <= t0 + totalMs)
        .sort((a, b) => a._t - b._t);
      const keptXY = cleanTracePoints(cleaned.map((p) => [p.x, p.y]));
      const keptSet = new Set(keptXY.map(([x, y]) => `${x}|${y}`));
      const sorted = cleaned.filter((p) => keptSet.has(`${p.x}|${p.y}`));
      if (!traceClosesLoop(sorted.map((p) => [p.x, p.y])))
        throw new Error("trace does not close a lap");

      /* Normalize world coordinates into the 660×360 SVG viewBox. */
      const xs = sorted.map((p) => p.x);
      const ys = sorted.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const W = 660, H = 360, PAD = 30;
      const scale = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxY - minY || 1));
      const ox = (W - (maxX - minX) * scale) / 2;
      const oy = (H - (maxY - minY) * scale) / 2;
      const toSvg = (p) => [
        +(ox + (p.x - minX) * scale).toFixed(1),
        +(H - (oy + (p.y - minY) * scale)).toFixed(1), // flip: SVG y grows downward
      ];

      /* Split points into sectors by the reference lap's sector times. */
      const b1 = t0 + lap.duration_sector_1 * 1000;
      const b2 = b1 + lap.duration_sector_2 * 1000;
      const sectors = { s1: [], s2: [], s3: [] };
      /* Raw world coords too: the replay re-projects the outline and the
         car dots from SHARED bounds, so they can never drift apart. */
      const sectorsRaw = { s1: [], s2: [], s3: [] };
      sorted.forEach((p) => {
        const t = new Date(p.date).getTime();
        const key = t <= b1 ? "s1" : t <= b2 ? "s2" : "s3";
        sectors[key].push(toSvg(p));
        sectorsRaw[key].push([p.x, p.y]);
      });

      /* Stitch segment joints and close the loop for a continuous line. */
      if (sectors.s1.length && sectors.s2.length) sectors.s2.unshift(sectors.s1[sectors.s1.length - 1]);
      if (sectors.s2.length && sectors.s3.length) sectors.s3.unshift(sectors.s2[sectors.s2.length - 1]);
      if (sectors.s3.length && sectors.s1.length) sectors.s3.push(sectors.s1[0]);
      if (sectorsRaw.s1.length && sectorsRaw.s2.length) sectorsRaw.s2.unshift(sectorsRaw.s1[sectorsRaw.s1.length - 1]);
      if (sectorsRaw.s2.length && sectorsRaw.s3.length) sectorsRaw.s3.unshift(sectorsRaw.s2[sectorsRaw.s2.length - 1]);
      if (sectorsRaw.s3.length && sectorsRaw.s1.length) sectorsRaw.s3.push(sectorsRaw.s1[0]);
      if (sectors.s1.length < 5 || sectors.s2.length < 5 || sectors.s3.length < 5)
        throw new Error("sector split produced degenerate segments");

      return {
        source: "telemetry",
        sectors,
        sectorsRaw,
        viewBox: { W, H, PAD },
        referenceDriver: lap.driver_number,
        lap: lap.lap_number,
        /* Same transform used for the outline — replay dots reuse it so
           live car coordinates land exactly on the traced circuit. */
        transform: { minX, minY, scale, ox, oy, H },
      };
    },
    async () => {
      await simulateLatency();
      return null; // TrackMap falls back to the illustrative layout
    }
  );
}

/* ================================================================
 * SHARED OPENF1 CONTEXT (telemetry getters)
 * ================================================================ */

/** Latest race + its OpenF1 session key + classification order. */
async function openF1Context() {
  const race = await jolpicaLatestRaceResults();
  const { sessionKey } = await resolveOpenF1Session(race);
  const finishOrder = race.Results.map((r) => +r.number); // car numbers, P1 first
  return { race, sessionKey, finishOrder };
}

/** driver_number → identity map from OpenF1 (includes live team colours). */
async function openF1Drivers(sessionKey) {
  const rows = await fetchJson(`${OPENF1_BASE}/drivers?session_key=${sessionKey}`, { ttl: TTL.results });
  if (!Array.isArray(rows) || !rows.length) throw new Error("no OpenF1 drivers");
  const map = {};
  rows.forEach((d) => {
    map[d.driver_number] = {
      code: d.name_acronym ?? String(d.driver_number),
      name: d.full_name ?? d.broadcast_name ?? `#${d.driver_number}`,
      teamName: d.team_name ?? "—",
      teamColor: d.team_colour ? `#${d.team_colour}` : "#8B95A7",
    };
  });
  return map;
}

/** Every lap of the race — ONE heavy fetch shared by four getters. */
async function openF1AllLaps(sessionKey) {
  const laps = await fetchJson(`${OPENF1_BASE}/laps?session_key=${sessionKey}`, {
    ttl: TTL.results,
    timeout: 30_000,
  });
  if (!Array.isArray(laps) || laps.length < 40) throw new Error("insufficient lap data");
  return laps;
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/** Least-squares slope for [x, y] points; null if too few samples. */
const fitSlope = (pts) => {
  const n = pts.length;
  if (n < 6) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  pts.forEach(([x, y]) => { sx += x; sy += y; sxx += x * x; sxy += x * y; });
  const denom = n * sxx - sx * sx;
  return denom ? (n * sxy - sx * sy) / denom : null;
};

/* ---- STILL MOCK (step 3–4: raw-lap computation via OpenF1) ------ */

const classifySector = (t, sectorBest) => {
  if (t === sectorBest) return "purple";
  if (t - sectorBest <= 0.15) return "green";
  return "yellow";
};

const buildSectorPayload = (times, miniSectors) => {
  const best = {
    s1: Math.min(...times.map((d) => d.s1)),
    s2: Math.min(...times.map((d) => d.s2)),
    s3: Math.min(...times.map((d) => d.s3)),
  };
  return {
    best,
    rows: times.map((d) => ({
      ...d,
      lap: +(d.s1 + d.s2 + d.s3).toFixed(3),
      class1: classifySector(d.s1, best.s1),
      class2: classifySector(d.s2, best.s2),
      class3: classifySector(d.s3, best.s3),
    })),
    miniSectors,
  };
};

export async function getSectorAnalysis() {
  return withFallback(
    "sectors",
    async () => {
      const { sessionKey, finishOrder } = await openF1Context();
      const [laps, drivers] = await Promise.all([
        openF1AllLaps(sessionKey),
        openF1Drivers(sessionKey),
      ]);

      /* Best sector per driver across the race; top 8 finishers shown. */
      const top8 = finishOrder.slice(0, 8);
      const times = top8
        .map((num) => {
          const own = laps.filter((l) => l.driver_number === num);
          const bestOf = (key) => {
            const vals = own.map((l) => l[key]).filter((v) => v > 0);
            return vals.length ? Math.min(...vals) : null;
          };
          const s1 = bestOf("duration_sector_1");
          const s2 = bestOf("duration_sector_2");
          const s3 = bestOf("duration_sector_3");
          if (s1 == null || s2 == null || s3 == null) return null;
          return { code: drivers[num]?.code ?? String(num), s1: +s1.toFixed(3), s2: +s2.toFixed(3), s3: +s3.toFixed(3) };
        })
        .filter(Boolean);
      if (times.length < 4) throw new Error("too few drivers with full sector data");

      /* Lap duel: P1 vs P2 across 18 evenly sampled racing laps.
         (OpenF1 has no micro-splits, so the strip is repurposed honestly.) */
      const [p1, p2] = finishOrder;
      const duelLaps = (num) =>
        laps
          .filter((l) => l.driver_number === num && l.lap_duration > 0 && !l.is_pit_out_lap)
          .reduce((m, l) => ((m[l.lap_number] = l.lap_duration), m), {});
      const a = duelLaps(p1), b = duelLaps(p2);
      const common = Object.keys(a).map(Number).filter((n) => b[n]).sort((x, y) => x - y);
      if (common.length < 18) throw new Error("too few common laps for duel");
      const step = (common.length - 1) / 17;
      const splits = Array.from({ length: 18 }, (_, i) => {
        const lapN = common[Math.round(i * step)];
        const diff = a[lapN] - b[lapN];
        return Math.abs(diff) <= 0.05 ? "EQ" : diff < 0 ? "A" : "B";
      });
      return buildSectorPayload(times, {
        driverA: drivers[p1]?.code ?? "P1",
        driverB: drivers[p2]?.code ?? "P2",
        splits,
        title: "Lap duel",
        subtitle: "18 sampled racing laps",
      });
    },
    async () => {
      await simulateLatency();
      return buildSectorPayload(SECTOR_TIMES, MINI_SECTORS);
    }
  );
}

const COMPOUND_ALIASES = { INTERMEDIATE: "INTER", WET: "WET", SOFT: "SOFT", MEDIUM: "MEDIUM", HARD: "HARD" };

export async function getTyreStints() {
  return withFallback(
    "stints",
    async () => {
      const { sessionKey, finishOrder } = await openF1Context();
      const [rows, drivers] = await Promise.all([
        fetchJson(`${OPENF1_BASE}/stints?session_key=${sessionKey}`, { ttl: TTL.results }),
        openF1Drivers(sessionKey),
      ]);
      if (!Array.isArray(rows) || !rows.length) throw new Error("no stint data");
      const byDriver = {};
      rows.forEach((s) => {
        (byDriver[s.driver_number] ??= []).push({
          stintNumber: s.stint_number,
          compound: COMPOUND_ALIASES[s.compound] ?? s.compound ?? "UNKNOWN",
          from: s.lap_start,
          to: s.lap_end,
        });
      });
      /* Classification order, every classified driver. */
      return finishOrder
        .filter((num) => byDriver[num]?.length)
        .map((num) => ({
          code: drivers[num]?.code ?? String(num),
          stints: byDriver[num]
            .sort((a, b) => a.stintNumber - b.stintNumber)
            .map(({ compound, from, to }) => ({ compound, from, to })),
        }));
    },
    async () => {
      await simulateLatency();
      return STINTS;
    }
  );
}

export async function getPitStops() {
  return withFallback(
    "pits",
    async () => {
      const { sessionKey } = await openF1Context();
      const [rows, drivers] = await Promise.all([
        fetchJson(`${OPENF1_BASE}/pit?session_key=${sessionKey}`, { ttl: TTL.results }),
        openF1Drivers(sessionKey),
      ]);
      if (!Array.isArray(rows) || !rows.length) throw new Error("no pit data");
      /* OpenF1 provides pit-lane duration + timestamp (no wheels-stopped
         time), so the leaderboard ranks lane time in live mode. */
      return rows
        .filter((p) => p.pit_duration > 0)
        .map((p) => ({
          code: drivers[p.driver_number]?.code ?? String(p.driver_number),
          lap: p.lap_number,
          laneTime: +(+p.pit_duration).toFixed(3),
          stationary: null,
          timeOfDay: p.date
            ? new Date(p.date).toISOString().slice(11, 19)
            : null,
        }))
        .sort((a, b) => a.laneTime - b.laneTime);
    },
    async () => {
      await simulateLatency();
      return [...PIT_STOPS].sort((a, b) => a.stationary - b.stationary);
    }
  );
}

export async function getDegradation() {
  return withFallback(
    "degradation",
    async () => {
      const { sessionKey } = await openF1Context();
      const [laps, stints] = await Promise.all([
        openF1AllLaps(sessionKey),
        fetchJson(`${OPENF1_BASE}/stints?session_key=${sessionKey}`, { ttl: TTL.results }),
      ]);
      if (!Array.isArray(stints) || !stints.length) throw new Error("no stint data");

      /* Index laps per driver, filter to clean racing laps (drop pit
         in/out laps and anything >7% over the driver's median — SC etc). */
      const byDriver = {};
      laps.forEach((l) => {
        if (l.lap_duration > 0) (byDriver[l.driver_number] ??= []).push(l);
      });
      /* Exclude pit-out laps, outliers, AND lap 1 (standing start
         pollutes "stint age 1" with a slow launch lap). */
      const cleanLap = (l, med) =>
        !l.is_pit_out_lap && l.lap_number > 1 && l.lap_duration <= med * 1.07;

      /* Collect (stintAge, lapTime) samples per compound, field-wide. */
      const samples = {};
      stints.forEach((s) => {
        const compound = COMPOUND_ALIASES[s.compound] ?? s.compound;
        if (!compound || compound === "UNKNOWN") return;
        const own = byDriver[s.driver_number] ?? [];
        const med = median(own.map((l) => l.lap_duration));
        if (!med) return;
        own.forEach((l) => {
          if (l.lap_number < s.lap_start || l.lap_number > s.lap_end) return;
          if (!cleanLap(l, med)) return;
          const stintAge = l.lap_number - s.lap_start + 1 + (s.tyre_age_at_start ?? 0);
          (samples[compound] ??= []).push([stintAge, l.lap_duration]);
        });
      });

      /* Slopes via least squares; series = mean lap time per stint age. */
      const slopes = Object.entries(samples)
        .map(([compound, pts]) => ({ compound, slope: fitSlope(pts) }))
        .filter((s) => s.slope != null && s.slope > -0.5 && s.slope < 1)
        .map((s) => ({ ...s, slope: +s.slope.toFixed(3) }));
      if (!slopes.length) throw new Error("degradation fit failed");

      const maxAge = 26;
      const series = [];
      for (let age = 1; age <= maxAge; age++) {
        const row = { lap: age };
        let any = false;
        slopes.forEach(({ compound }) => {
          const pts = samples[compound].filter(([x]) => x === age).map(([, y]) => y);
          if (pts.length >= 3) {
            row[compound] = +(pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(3);
            any = true;
          }
        });
        if (any) series.push(row);
      }
      if (series.length < 8) throw new Error("degradation series too sparse");
      return { series, slopes };
    },
    async () => {
      await simulateLatency();
      return {
        series: buildDegradationSeries(),
        slopes: DEG_MODEL.map(({ compound, slope }) => ({ compound, slope })),
      };
    }
  );
}

export async function getPerformanceMetrics() {
  return withFallback(
    "performance",
    async () => {
      const { sessionKey } = await openF1Context();
      const [laps, drivers] = await Promise.all([
        openF1AllLaps(sessionKey),
        openF1Drivers(sessionKey),
      ]);
      const byDriver = {};
      laps.forEach((l) => (byDriver[l.driver_number] ??= []).push(l));

      const rows = Object.entries(byDriver)
        .map(([num, own]) => {
          const speeds = own
            .map((l) => Math.max(l.st_speed ?? 0, l.i1_speed ?? 0, l.i2_speed ?? 0))
            .filter((v) => v > 0)
            .sort((a, b) => b - a);
          const durations = own.map((l) => l.lap_duration).filter((v) => v > 0);
          if (speeds.length < 5 || durations.length < 10) return null;
          const med = median(durations);
          const clean = durations.filter((d) => d <= med * 1.07);
          const id = drivers[num] ?? {};
          return {
            code: id.code ?? String(num),
            name: id.name ?? `#${num}`,
            teamColor: id.teamColor ?? "#8B95A7",
            vmax: +(speeds[1] ?? speeds[0]).toFixed(1), // 2nd-highest resists single-sample glitches
            avgPace: +(clean.reduce((a, b) => a + b, 0) / clean.length).toFixed(2),
          };
        })
        .filter(Boolean);
      if (rows.length < 6) throw new Error("too few drivers with speed/pace data");
      return {
        vmax: [...rows].sort((a, b) => b.vmax - a.vmax),
        pace: [...rows].sort((a, b) => a.avgPace - b.avgPace),
      };
    },
    async () => {
      await simulateLatency();
      const withTeam = PERFORMANCE.map((p) => {
        const d = DRIVERS.find((x) => x.code === p.code);
        return { ...p, teamColor: TEAMS[d.team].color, name: d.name };
      });
      return {
        vmax: [...withTeam].sort((a, b) => b.vmax - a.vmax),
        pace: [...withTeam].sort((a, b) => a.avgPace - b.avgPace),
      };
    }
  );
}

/**
 * Position worm: running order at the end of every lap.
 * Derived from lap completion timestamps (start + duration) — the rank
 * of cumulative time to complete N laps IS the position after lap N.
 * Zero new endpoints: reuses the cached all-laps fetch.
 */
export async function getPositionWorm() {
  return withFallback(
    "worm",
    async () => {
      const { sessionKey, finishOrder } = await openF1Context();
      const [laps, drivers] = await Promise.all([
        openF1AllLaps(sessionKey),
        openF1Drivers(sessionKey),
      ]);

      /* driver → (lapNumber → completion timestamp) */
      const completion = {};
      laps.forEach((l) => {
        if (!l.date_start || !(l.lap_duration > 0)) return;
        (completion[l.driver_number] ??= {})[l.lap_number] =
          new Date(l.date_start).getTime() + l.lap_duration * 1000;
      });

      const maxLap = Math.max(...laps.map((l) => l.lap_number ?? 0));
      if (!isFinite(maxLap) || maxLap < 5) throw new Error("too few laps for worm");

      const rows = [];
      for (let n = 1; n <= maxLap; n++) {
        const finishers = Object.entries(completion)
          .filter(([, byLap]) => byLap[n] != null)
          .map(([num, byLap]) => ({ num: +num, t: byLap[n] }))
          .sort((a, b) => a.t - b.t);
        if (finishers.length < 2) continue;
        const row = { lap: n };
        finishers.forEach((f, i) => {
          const code = drivers[f.num]?.code ?? String(f.num);
          row[code] = i + 1;
        });
        rows.push(row);
      }
      if (rows.length < 5) throw new Error("worm series too sparse");

      /* Driver legend in classification order (retirees last). */
      const legend = finishOrder
        .filter((num) => completion[num])
        .map((num) => ({
          code: drivers[num]?.code ?? String(num),
          name: drivers[num]?.name ?? `#${num}`,
          teamColor: drivers[num]?.teamColor ?? "#8B95A7",
        }));

      return { rows, legend, maxLap };
    },
    async () => {
      await simulateLatency();
      /* Mock worm: interpolate grid → finish, then rank per lap so every
         lap is a valid permutation. */
      const maxLap = SESSION.totalLaps;
      const rows = [];
      for (let n = 1; n <= maxLap; n++) {
        const f = n / maxLap;
        const ranked = DRIVERS.map((d) => ({
          code: d.code,
          v: d.grid + (d.finish - d.grid) * Math.min(1, f * 1.6) + Math.sin(n / 9 + d.id) * 0.4,
        })).sort((a, b) => a.v - b.v);
        const row = { lap: n };
        ranked.forEach((r, i) => (row[r.code] = i + 1));
        rows.push(row);
      }
      const legend = [...DRIVERS]
        .sort((a, b) => a.finish - b.finish)
        .map((d) => ({ code: d.code, name: d.name, teamColor: TEAMS[d.team].color }));
      return { rows, legend, maxLap };
    }
  );
}

/* ================================================================
 * RACE REPLAY (broadcast mode)
 * ----------------------------------------------------------------
 * Replays a completed race from historical OpenF1 data (free tier).
 * Location + interval data stream in time-window chunks so we never
 * fetch the full ~2M-point race in one request. True-live later =
 * same component, authenticated WebSocket source instead.
 * ================================================================ */

/**
 * Build a projection transform from world-coordinate bounds.
 * Used for BOTH the traced outline and the live car dots so the two can
 * never end up in different coordinate spaces (the cause of dots
 * appearing beside the circuit instead of on it).
 */
export function buildTransform(minX, maxX, minY, maxY, view = { W: 660, H: 360, PAD: 30 }) {
  const { W, H, PAD } = view;
  const scale = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxY - minY || 1));
  return {
    minX, minY, scale, H,
    ox: (W - (maxX - minX) * scale) / 2,
    oy: (H - (maxY - minY) * scale) / 2,
  };
}

/** Map OpenF1 world coordinates into the traced outline's SVG space. */
export function projectToTrack(tf, x, y) {
  return [
    tf.ox + (x - tf.minX) * tf.scale,
    tf.H - (tf.oy + (y - tf.minY) * tf.scale),
  ];
}

/**
 * One-time replay context: session window, driver identities, and the
 * full position-change stream (small — rows only when order changes).
 */
export async function getReplayContext() {
  return withFallback(
    "replay",
    async () => {
      const race = await jolpicaLatestRaceResults();
      const { sessionKey } = await resolveOpenF1Session(race);
      const sessions = await fetchJson(`${OPENF1_BASE}/sessions?session_key=${sessionKey}`, { ttl: TTL.sessions });
      const s = Array.isArray(sessions) ? sessions[0] : null;
      if (!s?.date_start || !s?.date_end) throw new Error("no session time window");
      const [drivers, positions, lap1] = await Promise.all([
        openF1Drivers(sessionKey),
        fetchJson(`${OPENF1_BASE}/position?session_key=${sessionKey}`, { ttl: TTL.results, timeout: 30_000 }),
        fetchJson(`${OPENF1_BASE}/laps?session_key=${sessionKey}&lap_number=1`, { ttl: TTL.results }).catch(() => []),
      ]);
      if (!Array.isArray(positions) || !positions.length) throw new Error("no position stream");
      const sorted = positions
        .map((p) => ({ t: new Date(p.date).getTime(), n: p.driver_number, pos: p.position }))
        .sort((a, b) => a.t - b.t);
      /* Lights out ≈ earliest lap-1 start; skips formation dead time. */
      const lapStarts = (Array.isArray(lap1) ? lap1 : [])
        .map((l) => (l.date_start ? new Date(l.date_start).getTime() : null))
        .filter(Boolean);
      const sessionStart = new Date(s.date_start).getTime();
      const raceStart = lapStarts.length ? Math.min(...lapStarts) : sessionStart;
      /* Trim the tail: session date_end includes podium etc. */
      const raceEnd = Math.min(
        new Date(s.date_end).getTime(),
        sorted[sorted.length - 1].t + 120_000
      );
      return {
        sessionKey,
        raceName: race.raceName,
        dateStart: s.date_start,
        dateEnd: s.date_end,
        raceStart,
        raceEnd,
        drivers,
        positions: sorted,
      };
    },
    async () => null // replay is live-data only; component shows unavailable state
  );
}

/**
 * One playback chunk: all drivers' locations + gap intervals inside
 * [fromMs, toMs). Cached per window, so scrubbing back is free.
 */
export async function getReplayWindow(sessionKey, fromMs, toMs) {
  const iso = (ms) => encodeURIComponent(new Date(ms).toISOString());
  const [loc, intervals] = await Promise.all([
    fetchJson(
      `${OPENF1_BASE}/location?session_key=${sessionKey}&date>${iso(fromMs)}&date<${iso(toMs)}`,
      { ttl: TTL.results, timeout: 30_000 }
    ),
    fetchJson(
      `${OPENF1_BASE}/intervals?session_key=${sessionKey}&date>${iso(fromMs)}&date<${iso(toMs)}`,
      { ttl: TTL.results, timeout: 30_000 }
    ).catch(() => []), // gaps are decoration; a miss shouldn't kill the chunk
  ]);
  const locations = {};
  (Array.isArray(loc) ? loc : []).forEach((p) => {
    if (p.x == null || p.y == null) return;
    (locations[p.driver_number] ??= []).push({ t: new Date(p.date).getTime(), x: p.x, y: p.y });
  });
  Object.values(locations).forEach((arr) => arr.sort((a, b) => a.t - b.t));
  const gaps = (Array.isArray(intervals) ? intervals : [])
    .map((i) => ({ t: new Date(i.date).getTime(), n: i.driver_number, gap: i.gap_to_leader }))
    .sort((a, b) => a.t - b.t);
  return { locations, gaps };
}

/* ================================================================
 * REPLAY EVENTS + TEAM RADIO (broadcast enrichment)
 * ================================================================ */

/** lap-number lookup: leader's lap start boundaries → lap at time t. */
async function lapAtBuilder(sessionKey) {
  const laps = await openF1AllLaps(sessionKey);
  const starts = {};
  let maxLap = 0;
  laps.forEach((l) => {
    if (!l.date_start) return;
    const t = new Date(l.date_start).getTime();
    if (starts[l.lap_number] == null || t < starts[l.lap_number]) starts[l.lap_number] = t;
    maxLap = Math.max(maxLap, l.lap_number);
  });
  const arr = [];
  for (let n = 1; n <= maxLap; n++) if (starts[n] != null) arr.push([n, starts[n]]);
  return (t) => {
    let lap = 1;
    for (const [n, ts] of arr) {
      if (ts <= t) lap = n;
      else break;
    }
    return lap;
  };
}

/**
 * Race events for the replay timeline:
 *  - OVERTAKES computed from the position stream. Honest heuristics:
 *    only ±1 swaps count (multi-place jumps = pit cycles), lap-1 chaos
 *    is collapsed into a single "Lights out" event, swaps within 35s
 *    of either car's pit stop are excluded, and repeat swaps of the
 *    same pair within 45s (DRS ping-pong) are merged.
 *  - INCIDENTS from race control: SC / VSC / red flag / penalties.
 */
export async function getReplayEvents() {
  return withFallback(
    "events",
    async () => {
      const race = await jolpicaLatestRaceResults();
      const { sessionKey } = await resolveOpenF1Session(race);
      const [positions, pits, raceControl, lap1, drivers, lapAt] = await Promise.all([
        fetchJson(`${OPENF1_BASE}/position?session_key=${sessionKey}`, { ttl: TTL.results, timeout: 30_000 }),
        fetchJson(`${OPENF1_BASE}/pit?session_key=${sessionKey}`, { ttl: TTL.results }).catch(() => []),
        fetchJson(`${OPENF1_BASE}/race_control?session_key=${sessionKey}`, { ttl: TTL.results }).catch(() => []),
        fetchJson(`${OPENF1_BASE}/laps?session_key=${sessionKey}&lap_number=1`, { ttl: TTL.results }).catch(() => []),
        openF1Drivers(sessionKey),
        lapAtBuilder(sessionKey),
      ]);
      if (!Array.isArray(positions) || !positions.length) throw new Error("no position stream");

      const code = (n) => drivers[n]?.code ?? String(n);
      const stream = positions
        .map((p) => ({ t: new Date(p.date).getTime(), n: p.driver_number, pos: p.position }))
        .sort((a, b) => a.t - b.t);

      const lapStarts = (Array.isArray(lap1) ? lap1 : [])
        .map((l) => (l.date_start ? new Date(l.date_start).getTime() : null))
        .filter(Boolean);
      const raceStart = lapStarts.length ? Math.min(...lapStarts) : stream[0].t;

      const pitTimes = {};
      (Array.isArray(pits) ? pits : []).forEach((p) => {
        if (p.date) (pitTimes[p.driver_number] ??= []).push(new Date(p.date).getTime());
      });
      const nearPit = (num, t) => (pitTimes[num] ?? []).some((pt) => Math.abs(pt - t) < 35_000);

      const events = [{ t: raceStart, lap: 1, type: "start", label: "Lights out", drivers: [] }];

      /* ---- Overtake detection ---- */
      const latest = {};
      const posHolder = {};
      const lastPair = {};
      for (const p of stream) {
        const prev = latest[p.n];
        if (
          prev != null &&
          p.pos === prev - 1 &&               // exactly one place gained = on-track pass
          p.t > raceStart + 90_000            // skip lap-1 shuffle
        ) {
          const displaced = posHolder[p.pos];
          if (displaced != null && displaced !== p.n && !nearPit(p.n, p.t) && !nearPit(displaced, p.t)) {
            const key = [p.n, displaced].sort().join("-");
            if (!lastPair[key] || p.t - lastPair[key] > 45_000) {
              lastPair[key] = p.t;
              events.push({
                t: p.t,
                lap: lapAt(p.t),
                type: "overtake",
                label: `${code(p.n)} passes ${code(displaced)} for P${p.pos}`,
                drivers: [code(p.n), code(displaced)],
              });
            }
          }
        }
        if (prev != null && posHolder[prev] === p.n) delete posHolder[prev];
        posHolder[p.pos] = p.n;
        latest[p.n] = p.pos;
      }

      /* ---- Race control incidents ---- */
      (Array.isArray(raceControl) ? raceControl : []).forEach((r) => {
        if (!r.date) return;
        const t = new Date(r.date).getTime();
        const msg = (r.message ?? "").toUpperCase();
        let type = null, label = null;
        if (r.flag === "RED") { type = "red"; label = "Red flag"; }
        else if (msg.includes("VIRTUAL SAFETY CAR DEPLOYED")) { type = "vsc"; label = "Virtual Safety Car"; }
        else if (msg.includes("SAFETY CAR DEPLOYED")) { type = "sc"; label = "Safety Car deployed"; }
        else if (msg.includes("SAFETY CAR IN THIS LAP") || msg.includes("VIRTUAL SAFETY CAR ENDING")) { type = "sc-end"; label = "Safety Car ending"; }
        else if (msg.includes("PENALTY")) {
          type = "penalty";
          const who = r.driver_number ? code(r.driver_number) : null;
          label = who ? `Penalty · ${who}` : "Penalty";
        }
        if (type) events.push({ t, lap: r.lap_number ?? lapAt(t), type, label, drivers: [] });
      });

      return events.sort((a, b) => a.t - b.t);
    },
    async () => []
  );
}

/** Team radio clips: real pit-wall audio (MP3 URLs) with timestamps. */
export async function getTeamRadio() {
  return withFallback(
    "radio",
    async () => {
      const race = await jolpicaLatestRaceResults();
      const { sessionKey } = await resolveOpenF1Session(race);
      const [rows, drivers, lapAt] = await Promise.all([
        fetchJson(`${OPENF1_BASE}/team_radio?session_key=${sessionKey}`, { ttl: TTL.results, timeout: 30_000 }),
        openF1Drivers(sessionKey),
        lapAtBuilder(sessionKey),
      ]);
      if (!Array.isArray(rows) || !rows.length) throw new Error("no team radio");
      return rows
        .filter((r) => r.date && r.recording_url)
        .map((r) => {
          const t = new Date(r.date).getTime();
          const id = drivers[r.driver_number] ?? {};
          return {
            t,
            lap: lapAt(t),
            code: id.code ?? String(r.driver_number),
            color: id.teamColor ?? "#8B93A7",
            url: r.recording_url,
          };
        })
        .sort((a, b) => a.t - b.t);
    },
    async () => []
  );
}

/* ================================================================
 * HEAD-TO-HEAD COMPARISON
 * Per-driver race metrics for the whole classified field, plus each
 * driver's lap array so the client can compute pair duels and the
 * cumulative gap trace. Reuses cached fetches — no new endpoints.
 * ================================================================ */

export async function getDriverComparison() {
  return withFallback(
    "compare",
    async () => {
      const { race, sessionKey, finishOrder } = await openF1Context();
      const [laps, drivers, stintRows, pitRows] = await Promise.all([
        openF1AllLaps(sessionKey),
        openF1Drivers(sessionKey),
        fetchJson(`${OPENF1_BASE}/stints?session_key=${sessionKey}`, { ttl: TTL.results }).catch(() => []),
        fetchJson(`${OPENF1_BASE}/pit?session_key=${sessionKey}`, { ttl: TTL.results }).catch(() => []),
      ]);

      const byDriver = {};
      laps.forEach((l) => (byDriver[l.driver_number] ??= []).push(l));
      const resultByNum = {};
      race.Results.forEach((r) => (resultByNum[+r.number] = r));

      const totalLaps = Math.max(...laps.map((l) => l.lap_number ?? 0));

      const rows = finishOrder
        .map((num) => {
          const own = (byDriver[num] ?? []).filter((l) => l.lap_duration > 0);
          if (own.length < 5) return null;
          const durations = own.map((l) => l.lap_duration);
          const med = median(durations);
          const clean = own.filter(
            (l) => !l.is_pit_out_lap && l.lap_number > 1 && l.lap_duration <= med * 1.07
          );
          const bestOf = (key) => {
            const vals = own.map((l) => l[key]).filter((v) => v > 0);
            return vals.length ? +Math.min(...vals).toFixed(3) : null;
          };
          const speeds = own
            .map((l) => Math.max(l.st_speed ?? 0, l.i1_speed ?? 0, l.i2_speed ?? 0))
            .filter((v) => v > 0)
            .sort((a, b) => b - a);
          const id = drivers[num] ?? {};
          const res = resultByNum[num];
          return {
            code: id.code ?? String(num),
            name: id.name ?? `#${num}`,
            teamName: id.teamName ?? "—",
            teamColor: id.teamColor ?? "#8B95A7",
            grid: res ? (+res.grid === 0 ? finishOrder.length : +res.grid) : null,
            finish: res ? +res.position : null,
            status: res?.status ?? "—",
            bestLap: +Math.min(...durations).toFixed(3),
            avgPace: clean.length
              ? +(clean.reduce((a, l) => a + l.lap_duration, 0) / clean.length).toFixed(3)
              : null,
            s1: bestOf("duration_sector_1"),
            s2: bestOf("duration_sector_2"),
            s3: bestOf("duration_sector_3"),
            vmax: speeds.length ? +(speeds[1] ?? speeds[0]).toFixed(1) : null,
            laps: own
              .filter((l) => l.lap_number != null)
              .sort((a, b) => a.lap_number - b.lap_number)
              .map((l) => ({ n: l.lap_number, d: +l.lap_duration.toFixed(3) })),
            stints: (Array.isArray(stintRows) ? stintRows : [])
              .filter((s) => s.driver_number === num)
              .sort((a, b) => a.stint_number - b.stint_number)
              .map((s) => ({
                compound: COMPOUND_ALIASES[s.compound] ?? s.compound ?? "UNKNOWN",
                from: s.lap_start,
                to: s.lap_end,
              })),
            pits: (Array.isArray(pitRows) ? pitRows : [])
              .filter((p) => p.driver_number === num && p.pit_duration > 0)
              .sort((a, b) => a.lap_number - b.lap_number)
              .map((p) => ({ lap: p.lap_number, laneTime: +(+p.pit_duration).toFixed(1) })),
          };
        })
        .filter(Boolean);
      if (rows.length < 2) throw new Error("too few drivers for comparison");
      return { totalLaps, drivers: rows };
    },
    async () => {
      await simulateLatency();
      /* Mock: synthesize consistent per-driver metrics from mock tables. */
      const total = SESSION.totalLaps;
      const rows = [...DRIVERS]
        .sort((a, b) => a.finish - b.finish)
        .map((d) => {
          const perf = PERFORMANCE.find((p) => p.code === d.code);
          /* SECTOR_TIMES only covers the top 8; synthesize a plausible
             split from race pace for the rest so the comparison panel
             never renders empty for midfield drivers. */
          const sec =
            SECTOR_TIMES.find((s) => s.code === d.code) ??
            (() => {
              const base = perf.avgPace - 1.1;
              return {
                s1: +(base * 0.246).toFixed(3),
                s2: +(base * 0.492).toFixed(3),
                s3: +(base * 0.262).toFixed(3),
              };
            })();
          const rand = seeded(d.id * 7 + 3);
          const laps = Array.from({ length: total }, (_, i) => ({
            n: i + 1,
            d: +(perf.avgPace + (rand() - 0.5) * 0.8 + (i < 2 ? 3 : 0)).toFixed(3),
          }));
          return {
            code: d.code,
            name: d.name,
            teamName: TEAMS[d.team].name,
            teamColor: TEAMS[d.team].color,
            grid: d.grid,
            finish: d.finish,
            status: "Finished",
            bestLap: +(perf.avgPace - 1.1).toFixed(3),
            avgPace: perf.avgPace,
            s1: sec?.s1 ?? null,
            s2: sec?.s2 ?? null,
            s3: sec?.s3 ?? null,
            vmax: perf.vmax,
            laps,
            stints: STINTS.find((s) => s.code === d.code)?.stints ?? [],
            pits: PIT_STOPS.filter((p) => p.code === d.code).map((p) => ({ lap: p.lap, laneTime: p.laneTime })),
          };
        });
      return { totalLaps: total, drivers: rows };
    }
  );
}

/**
 * Trace the circuit from a session's OWN location stream.
 * ------------------------------------------------------------------
 * The replay previously drew the track from getTrackOutline(), which
 * independently re-resolves the race/session. Any drift between the two
 * (stale cache, different session match, a bad reference lap) put the
 * car dots and the circuit in different coordinate frames — cars beside
 * the track instead of on it. Taking the trace from the SAME sessionKey
 * the dots use makes that impossible by construction.
 * Returns raw world coords: [[x, y], ...] for one clean lap.
 */
export async function getSessionTrackTrace(sessionKey) {
  const laps = await fetchJson(
    `${OPENF1_BASE}/laps?session_key=${sessionKey}&lap_number>=6&lap_number<=16`,
    { ttl: TTL.results, timeout: 20_000 }
  );
  const candidates = (Array.isArray(laps) ? laps : []).filter(
    (l) =>
      l.date_start &&
      l.lap_duration > 0 &&
      !l.is_pit_out_lap &&
      l.duration_sector_1 && l.duration_sector_2 && l.duration_sector_3
  );
  if (!candidates.length) throw new Error("no clean lap for track trace");

  /* Fastest clean lap = tightest racing line, least chance of an
     off-track excursion or a slow lap wandering onto the pit entry. */
  candidates.sort((a, b) => a.lap_duration - b.lap_duration);
  const lap = candidates[0];
  const t0 = new Date(lap.date_start).getTime();
  const t1 = t0 + lap.lap_duration * 1000;
  const iso = (ms) => encodeURIComponent(new Date(ms).toISOString());

  const raw = await fetchJson(
    `${OPENF1_BASE}/location?session_key=${sessionKey}` +
      `&driver_number=${lap.driver_number}&date>${iso(t0)}&date<${iso(t1)}`,
    { ttl: TTL.results, timeout: 30_000 }
  );
  if (!Array.isArray(raw)) throw new Error("no location data for track trace");

  /* Re-filter by time in JS: if the API ever ignores the date bounds we
     would otherwise draw the whole session (pit lane included), which is
     exactly what produces a distorted outline with chords across it. */
  const points = cleanTracePoints(
    raw
      .filter((p) => p.x != null && p.y != null && !(p.x === 0 && p.y === 0))
      .filter((p) => p.driver_number == null || p.driver_number === lap.driver_number)
      .map((p) => ({ t: new Date(p.date).getTime(), x: p.x, y: p.y }))
      .filter((p) => p.t >= t0 && p.t <= t1)
      .sort((a, b) => a.t - b.t)
      .map((p) => [p.x, p.y])
  );

  if (points.length < 50) throw new Error(`track trace too sparse (${points.length})`);
  if (!traceClosesLoop(points)) throw new Error("track trace does not close a lap");
  return { points, driver: lap.driver_number, lap: lap.lap_number };
}
