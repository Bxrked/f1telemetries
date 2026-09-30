/**
 * Feature flags — user-facing surface switches.
 *
 * Separate from config.js on purpose: that file configures the DATA layer
 * (API bases, TTLs, live/mock switch), this one gates what ships to users.
 */

export const FEATURES = {
  /**
   * Race replay ("/live") — the latest race, every lap.
   * Gates every entry point: nav tab, home card, route and sitemap.
   * Set to `false` to hide it; /live then redirects to /telemetry.
   */
  raceReplay: true,
};
