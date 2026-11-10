import { NextResponse } from "next/server";
import { parseFiaTranscript, fiaTranscriptUrls, fiaRaceSlug, fiaIndexTranscriptUrl } from "@/services/fiaTranscript";

/**
 * GET /api/interviews?year=2026&race=azerbaijan
 *
 * Post-race press conference transcript from fia.com, parsed. Server-side
 * because fia.com sends no CORS headers — browsers can't read it directly.
 *
 * Only ever fetches the FIA's transcript URL pattern: `year` and `race` are
 * validated to digits / slug characters, so this can't be pointed at any
 * other host or path. The race must also be on that season's calendar —
 * otherwise anyone could loop made-up slugs and use this route to hammer
 * fia.com (each unknown slug is a fresh upstream request).
 *
 * `race` is fiaRaceSlug(raceName). Most names give one FIA address; a name
 * that isn't "<Place> Grand Prix" ("Bahrain Grand Prix in Malaysia") gives
 * two candidates, tried in order — see fiaTranscriptUrls. If those miss,
 * the news index fia.com serves in their place may list the transcript
 * under the FIA's own name for the race ("São Paulo" for Jolpica's
 * "Brazilian"): a post-race transcript posted on the race weekend is
 * fetched as a third and last try (fiaIndexTranscriptUrl).
 *
 * Cached 30 min. The transcript appears a few hours after the flag; a
 * shorter cache means it shows up soon after, a longer one hits fia.com
 * less. At 30 min that's ≤ 48 requests per address per day, whatever the
 * site's traffic.
 */
const REVALIDATE_S = 1800;
const SCHEDULE_REVALIDATE_S = 6 * 3600;
/* OpenF1 (and so the replay) starts in 2023. */
const FIRST_YEAR = 2023;

/** The season's races, slug → race date, from Jolpica (cached); null if unreachable. */
async function seasonRaces(year: string): Promise<Map<string, string> | null> {
  try {
    const res = await fetch(`https://api.jolpi.ca/ergast/f1/${year}.json?limit=100`, {
      next: { revalidate: SCHEDULE_REVALIDATE_S },
    });
    if (!res.ok) return null;
    const races = (await res.json())?.MRData?.RaceTable?.Races ?? [];
    return new Map(races.map((r: any) => [fiaRaceSlug(r.raceName), String(r.date ?? "")]));
  } catch {
    return null;
  }
}

/** A page from fia.com, or null if it couldn't be fetched. */
async function fiaPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; F1Telemetries/1.0; +https://f1telemetries.com)" },
      next: { revalidate: REVALIDATE_S },
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year") ?? "";
  const race = searchParams.get("race") ?? "";
  if (!/^\d{4}$/.test(year) || !/^[a-z0-9-]{2,40}$/.test(race)) {
    return NextResponse.json({ status: "bad-request" }, { status: 400 });
  }
  if (+year < FIRST_YEAR || +year > new Date().getUTCFullYear()) {
    return NextResponse.json({ status: "bad-request" }, { status: 400 });
  }
  /* Calendar check before touching fia.com. If the calendar itself can't
     be reached, refuse rather than fall open. */
  const races = await seasonRaces(year);
  if (!races) return NextResponse.json({ status: "unreachable" }, { status: 502 });
  if (!races.has(race)) return NextResponse.json({ status: "unknown-race" }, { status: 404 });

  /* One address for an ordinary race name, two for an unusual one. */
  const sources = fiaTranscriptUrls(year, race);
  const cache = { "Cache-Control": `public, s-maxage=${REVALIDATE_S}, stale-while-revalidate=86400` };
  /* "Not published" must not outlive the wait. With stale-while-revalidate
     a browser replayed its stored 404 on the first visit AFTER the FIA had
     published (and only fetched the transcript behind it), so the tab still
     said "not published yet". A CDN may hold it for the 30 min; a browser
     asks every time. */
  const waiting = { "Cache-Control": `public, max-age=0, s-maxage=${REVALIDATE_S}, must-revalidate` };
  let reached = false;
  let index = ""; // the news index fia.com served for an address it doesn't have
  for (const source of sources) {
    const html = await fiaPage(source);
    if (html == null) continue;
    reached = true;
    /* fia.com answers unknown URLs with its news index (200), so "not
       published yet" is a parse that finds no transcript, not a 404. */
    const transcript = parseFiaTranscript(html);
    if (transcript) return NextResponse.json({ status: "ok", source, ...transcript }, { headers: cache });
    index = html;
  }
  /* The FIA may have its own name for this race. Its index lists what it
     has posted; one dated on the race weekend is this race's. */
  const listed = fiaIndexTranscriptUrl(index, year, races.get(race));
  if (listed && !sources.includes(listed)) {
    const html = await fiaPage(listed);
    const transcript = html == null ? null : parseFiaTranscript(html);
    if (transcript) return NextResponse.json({ status: "ok", source: listed, ...transcript }, { headers: cache });
  }
  if (!reached) return NextResponse.json({ status: "unreachable", source: sources[0] }, { status: 502 });
  return NextResponse.json({ status: "not-published", source: sources[0] }, { status: 404, headers: waiting });
}
