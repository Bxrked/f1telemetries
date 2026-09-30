/**
 * Where each team publishes its post-race driver quotes.
 * ------------------------------------------------------------------
 * The FIA transcript covers only the podium; every team issues its own
 * race-day release with both drivers' quotes. We LINK to it rather than
 * copy it: nothing to parse, nothing to break when a team redesigns.
 *
 * Every URL below was checked to load a real news page (HTTP 200, title
 * checked) on 30 Sep 2026. Two teams have no working news index, so we
 * point at the next best:
 *   McLaren, Red Bull — team homepage (it carries their news feed)
 *   Alpine            — its news page refuses non-browser requests and
 *                       the other candidate was a car-sales page, so
 *                       Formula1.com's Alpine team page instead
 * If a team's link starts failing, re-check with curl and update here.
 * ------------------------------------------------------------------
 */

import { teamKey } from "./teamColors";

export const TEAM_NEWS = {
  mercedes: "https://www.mercedesamgf1.com/news",
  ferrari: "https://www.ferrari.com/en-EN/formula1/news",
  mclaren: "https://www.mclaren.com/racing/",
  red_bull: "https://www.redbullracing.com/int-en",
  aston_martin: "https://www.astonmartinf1.com/en-GB/news",
  williams: "https://www.williamsf1.com/news",
  alpine: "https://www.formula1.com/en/teams/alpine",
  haas: "https://www.haasf1team.com/news",
  rb: "https://www.visacashapprb.com/int-en/news",
  audi: "https://www.audif1.com/en/news",
  cadillac: "https://www.cadillacf1team.com/news",
};

/** News page for a team (OpenF1 team_name or Jolpica id), or null. */
export const teamNewsFor = (nameOrId) => TEAM_NEWS[teamKey(nameOrId)] ?? null;
