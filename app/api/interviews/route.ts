import { NextResponse } from "next/server";
import { parseFiaTranscript, fiaTranscriptUrl } from "@/services/fiaTranscript";

/**
 * GET /api/interviews?year=2026&race=azerbaijan
 *
 * Post-race press conference transcript from fia.com, parsed. Server-side
 * because fia.com sends no CORS headers — browsers can't read it directly.
 *
 * Only ever fetches the FIA's transcript URL pattern: `year` and `race` are
 * validated to digits / slug characters, so this can't be pointed at any
 * other host or path.
 *
 * Cached 30 min. The transcript appears a few hours after the flag; a
 * shorter cache means it shows up soon after, a longer one hits fia.com
 * less. At 30 min that's ≤ 48 requests per race per day, whatever the
 * site's traffic.
 */
const REVALIDATE_S = 1800;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year") ?? "";
  const race = searchParams.get("race") ?? "";
  if (!/^\d{4}$/.test(year) || !/^[a-z0-9-]{2,40}$/.test(race)) {
    return NextResponse.json({ status: "bad-request" }, { status: 400 });
  }

  const source = fiaTranscriptUrl(year, race);
  let html: string;
  try {
    const res = await fetch(source, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; F1Telemetries/1.0; +https://f1telemetries.com)" },
      next: { revalidate: REVALIDATE_S },
    });
    if (!res.ok) throw new Error(`fia.com ${res.status}`);
    html = await res.text();
  } catch {
    return NextResponse.json({ status: "unreachable", source }, { status: 502 });
  }

  /* fia.com answers unknown URLs with its news index (200), so "not
     published yet" is a parse that finds no transcript, not a 404. */
  const transcript = parseFiaTranscript(html);
  const cache = { "Cache-Control": `public, s-maxage=${REVALIDATE_S}, stale-while-revalidate=86400` };
  if (!transcript) {
    return NextResponse.json({ status: "not-published", source }, { status: 404, headers: cache });
  }
  return NextResponse.json({ status: "ok", source, ...transcript }, { headers: cache });
}
