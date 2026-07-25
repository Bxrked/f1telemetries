/**
 * Data-layer configuration.
 * USE_LIVE_DATA: master switch. false → everything runs on mock.
 * SEASON: "current" is understood by Jolpica; or pin e.g. "2026".
 */
export const USE_LIVE_DATA = true;
export const SEASON = "current";

export const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";
export const OPENF1_BASE = "https://api.openf1.org/v1";

/** Cache TTLs (ms). Completed-race data never changes → cache long. */
export const TTL = {
  schedule: 6 * 60 * 60 * 1000,   // 6h
  standings: 60 * 60 * 1000,      // 1h
  results: 6 * 60 * 60 * 1000,    // 6h
  weather: 10 * 60 * 1000,        // 10m
  sessions: 60 * 60 * 1000,       // 1h
};
