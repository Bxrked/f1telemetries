/**
 * Feature flags — user-facing surface switches.
 *
 * Separate from config.js on purpose: that file configures the DATA layer
 * (API bases, TTLs, live/mock switch), this one gates what ships to users.
 */

export const FEATURES = {
  /**
   * Race replay ("/live", broadcast mode) — INTENTIONALLY OFF.
   *
   * Temporarily shelved, not removed. Every replay component, service
   * getter and type is still in the repo and still compiles; only the
   * entry points are gated (nav tab, home card, route, sitemap).
   *
   * TO RE-ENABLE: change this to `true`. That is the only edit needed —
   * /live starts rendering again and its links reappear everywhere.
   */
  raceReplay: false,
};
