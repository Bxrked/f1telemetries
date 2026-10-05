/**
 * diag-interviews.mjs — checks the FIA transcript parser against fia.com.
 *
 *   node diag-interviews.mjs                    # latest race (via Jolpica)
 *   node diag-interviews.mjs 2026 monaco        # a specific race slug
 *
 * Prints what the parser extracted: podium, sections, exchange counts,
 * and each driver's first answer. If it prints "PARSE FAILED" the FIA has
 * changed its page layout — fix services/fiaTranscript.js against the raw
 * HTML this saves to /tmp/fia-transcript.html.
 *
 * Read-only, no install, no dev server.
 */

import { writeFileSync } from "node:fs";
import { parseFiaTranscript, fiaRaceSlug, fiaTranscriptUrls } from "./services/fiaTranscript.js";

let [year, slug] = process.argv.slice(2);
if (!year) {
  const j = await (await fetch("https://api.jolpi.ca/ergast/f1/current/last/results.json?limit=1")).json();
  const race = j.MRData.RaceTable.Races[0];
  year = race.season;
  slug = fiaRaceSlug(race.raceName);
  console.log(`latest race: ${race.raceName} (${year}) → slug "${slug}"`);
}

/* The same addresses, in the same order, as the API route tries. */
let t = null;
let html = "";
for (const url of fiaTranscriptUrls(year, slug)) {
  const res = await fetch(url, { headers: { "User-Agent": "F1Telemetries diagnostics" } });
  html = await res.text();
  writeFileSync("/tmp/fia-transcript.html", html);
  console.log(`${url}\n→ HTTP ${res.status}, ${(html.length / 1024).toFixed(0)} KB (saved to /tmp/fia-transcript.html)`);
  t = parseFiaTranscript(html);
  if (t) break;
  console.log("  no transcript at this address");
}
if (!t) {
  /* The news index the FIA served instead lists what it HAS published —
     if this race is in it, the address rule is what's wrong. */
  const listed = [...new Set(html.match(/\/news\/f1-\d{4}-[a-z0-9-]*post-race-press-conference-transcript/g) ?? [])];
  console.log("\nPARSE FAILED — either not published yet (the FIA serves its news index for unknown URLs) or the layout changed.");
  if (listed.length) console.log(`Post-race transcripts on the FIA's news index right now:\n  ${listed.join("\n  ")}`);
  process.exit(1);
}

console.log(`\n${t.title} · ${t.date}`);
console.log("podium:", t.drivers.map((d) => `P${d.pos} ${d.name} (${d.team})`).join(" · "));
for (const s of t.sections) {
  const answers = s.exchanges.reduce((n, e) => n + e.answers.length, 0);
  const unknown = new Set(s.exchanges.flatMap((e) => e.answers.filter((a) => typeof a.speaker === "string").map((a) => a.speaker)));
  console.log(`\n[${s.title}]${s.note ? ` (${s.note})` : ""}: ${s.exchanges.length} questions, ${answers} answers${unknown.size ? ` · unmatched speakers: ${[...unknown].join(", ")}` : ""}`);
}
t.drivers.forEach((d, i) => {
  const first = t.sections.flatMap((s) => s.exchanges.flatMap((e) => e.answers)).find((a) => a.speaker === i);
  const n = t.sections.flatMap((s) => s.exchanges.flatMap((e) => e.answers)).filter((a) => a.speaker === i).length;
  console.log(`\n${d.name} — ${n} answers. First: "${first?.text.slice(0, 140)}${first?.text.length > 140 ? "…" : ""}"`);
});
