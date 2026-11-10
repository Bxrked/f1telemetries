/**
 * fiaTranscript.js — parse an FIA post-race press conference transcript.
 * ------------------------------------------------------------------
 * Pure (html string in, plain object out) so `node diag-interviews.mjs`
 * runs the exact code the API route runs.
 *
 * The page body is a run of lines — some pages give each its own <p>
 * (Baku 2026), others put the whole transcript in ONE <p> split by <br>
 * (Monaco 2026) — so it's parsed line by line either way:
 *   <strong>DRIVERS</strong>
 *   <strong>1 – George RUSSELL (Mercedes)</strong><br>…        podium
 *   <strong>TRACK INTERVIEWS</strong>                          section
 *   <strong>(Conducted by Timo Glock)</strong>                 section note
 *   <strong>Q: George, we see …</strong>                       question
 *   <strong>George RUSSELL: </strong>Yeah, I mean …            answer (full name)
 *   <strong>GR: </strong>I think it's just …                   answer (initials)
 *   …plain <p> after an answer continues that answer
 *
 * If the FIA reworks the page this returns null rather than guessing —
 * the UI then links to fia.com instead of showing a broken transcript.
 * ------------------------------------------------------------------
 */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };

const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

const text = (html) =>
  decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

/** "George RUSSELL" → "GR"; "Andrea Kimi ANTONELLI" → "KA" and "AKA". */
function initialsFor(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  const first = parts[0];
  return new Set([`${first[0]}${last[0]}`, parts.map((p) => p[0]).join(""), `${parts[parts.length - 2]?.[0] ?? ""}${last[0]}`].map((s) => s.toUpperCase()));
}

/**
 * @returns null when the page isn't a transcript (the FIA answers unknown
 *   URLs with its news index, status 200 — a soft 404), else
 *   { title, date, drivers: [{pos, name, team, lastName}], sections: [{title, note, exchanges: [{q, asker, answers: [{speaker, text}]}]}] }
 *   `speaker` is an index into `drivers`, or the raw label for anyone else.
 */
export function parseFiaTranscript(html) {
  const title = text(html.match(/<div class="article-header">\s*<h2>([\s\S]*?)<\/h2>/)?.[1] ?? "");
  if (!/post-race press conference transcript/i.test(title)) return null;
  /* The article's own date sits after its header; sidebars carry others. */
  const headerAt = html.indexOf('<div class="article-header2">');
  const date = headerAt < 0 ? null : text(html.slice(headerAt).match(/<span[^>]*class="date-display-single"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "") || null;

  const bodyStart = html.indexOf('<div class="content-body">');
  if (bodyStart < 0) return null;
  const bodyEnd = html.indexOf("</div>", bodyStart);
  const body = html.slice(bodyStart, bodyEnd < 0 ? undefined : bodyEnd);

  /* Lines: split on paragraph ends AND line breaks. */
  const pieces = body
    .replace(/<\/p>/gi, "<br>")
    .replace(/<p[^>]*>/gi, "")
    .replace(/^[\s\S]*?<div class="content-body">/, "")
    /* The header image shares the first line with the DRIVERS heading;
       left in, the heading no longer starts its line. */
    .replace(/<img[^>]*>/gi, "")
    .split(/<br\s*\/?>/i);
  const paras = pieces.map((raw) => {
    /* A bold run at the very start is the paragraph's label (heading,
       question, or speaker); anything after it is the body. */
    const lead = raw.match(/^\s*<strong>([\s\S]*?)<\/strong>([\s\S]*)$/i);
    return {
      bold: lead ? text(lead[1]) : "",
      rest: lead ? text(lead[2]) : text(raw),
      whollyBold: !!lead && !text(lead[2]),
    };
  });

  const drivers = [];
  const sections = [];
  let section = null;
  let exchange = null;
  let answer = null;
  let inDrivers = false;
  const speakerIndex = new Map(); // label (full name or initials) → driver index

  const ensureSection = () => {
    if (!section) {
      section = { title: "Interviews", note: null, exchanges: [] };
      sections.push(section);
    }
    return section;
  };

  for (const p of paras) {
    const bold = p.bold;
    if (!bold && !p.rest) continue;

    if (/^DRIVERS$/i.test(bold) && p.whollyBold) {
      inDrivers = true;
      continue;
    }
    if (inDrivers) {
      const m = `${bold} ${p.rest}`.trim().match(/^(\d+)\s*[–—-]\s*(.+?)\s*\((.+)\)$/);
      if (m) {
        {
          const name = m[2].trim();
          const i = drivers.length;
          drivers.push({ pos: +m[1], name, team: m[3].trim(), lastName: name.split(/\s+/).pop() });
          speakerIndex.set(name.toUpperCase(), i);
          initialsFor(name).forEach((ini) => speakerIndex.set(ini, i));
        }
        continue;
      }
      inDrivers = false;
    }

    /* Section heading: a short, all-caps, wholly-bold line. */
    if (p.whollyBold && bold.length < 40 && bold === bold.toUpperCase() && /[A-Z]{3}/.test(bold) && !bold.startsWith("Q:")) {
      section = { title: bold.replace(/\s+/g, " ").trim(), note: null, exchanges: [] };
      sections.push(section);
      exchange = answer = null;
      continue;
    }
    /* "(Conducted by …)" under a heading. */
    if (p.whollyBold && /^\(.*\)$/.test(bold) && section && !section.exchanges.length) {
      section.note = bold.slice(1, -1);
      continue;
    }

    /* Question: "Q: …", media questions carry "(Name – Outlet)" first. */
    const qText = bold.startsWith("Q:") ? `${bold.slice(2)} ${p.rest}`.trim() : null;
    if (qText != null) {
      const m = qText.match(/^\(([^)]+)\)\s*([\s\S]*)$/);
      exchange = { q: m ? m[2] : qText, asker: m ? m[1] : null, answers: [] };
      ensureSection().exchanges.push(exchange);
      answer = null;
      continue;
    }

    /* Answer: "SPEAKER: body" — the colon sometimes falls just outside
       the bold ("<strong>Lewis HAMILTON</strong>: …"). */
    const sm = bold.match(/^(.{1,40}?):\s*$/) ?? (bold && /^:/.test(p.rest) && bold.length <= 40 ? [null, bold] : null);
    if (sm && p.rest.replace(/^:\s*/, "")) {
      const label = sm[1].trim();
      p.rest = p.rest.replace(/^:\s*/, "");
      const idx = speakerIndex.get(label.toUpperCase());
      answer = { speaker: idx ?? label, text: p.rest };
      if (!exchange) {
        exchange = { q: null, asker: null, answers: [] };
        ensureSection().exchanges.push(exchange);
      }
      exchange.answers.push(answer);
      continue;
    }

    /* Unlabelled paragraph straight after an answer: its continuation. */
    if (answer && !bold) {
      answer.text += `\n\n${p.rest}`;
    }
  }

  /* Drop headings with nothing under them (the closing "ENDS"). */
  for (let i = sections.length - 1; i >= 0; i--) if (!sections[i].exchanges.length) sections.splice(i, 1);

  const answered = sections.reduce((n, s) => n + s.exchanges.reduce((k, e) => k + e.answers.length, 0), 0);
  /* A transcript with a podium but no answers means the layout moved. */
  if (!drivers.length || !answered) return null;
  return { title, date, drivers, sections };
}

/**
 * The race's id in /api/interviews: "São Paulo Grand Prix" → "sao-paulo".
 * A name that doesn't END in "Grand Prix" keeps the words ("Bahrain Grand
 * Prix in Malaysia" → "bahrain-grand-prix-in-malaysia"); fiaTranscriptUrls
 * turns either kind into the FIA's address.
 */
export function fiaRaceSlug(raceName) {
  return raceName
    .replace(/\s*Grand Prix\s*$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const FIA_NEWS = "https://www.fia.com/news";
const TRANSCRIPT_TAIL = "post-race-press-conference-transcript";
/* fia.com is Drupal, and its addresses are made from the page title with
   Drupal's standard list of small words left out — "…Grand Prix in
   Malaysia…" is published at "…-grand-prix-malaysia-…". */
const DROPPED_WORDS = new Set(
  "a an as at before but by for from is in into like of off on onto per since than the this that to up via with".split(" ")
);

/* Races the FIA titles differently from Jolpica. Our slug → the FIA's
   name for it (its title minus "Grand Prix"). `node diag-interviews.mjs`
   lists the transcripts the FIA's index holds, which is how these were
   found; a new one is also picked up from that index on the day (see
   fiaIndexTranscriptUrl). */
const FIA_NAMES = {
  brazilian: "sao-paulo", // 2026: Jolpica "Brazilian Grand Prix", FIA "São Paulo Grand Prix"
  barcelona: "barcelona-catalunya", // 2026: Jolpica "Barcelona Grand Prix", FIA "Barcelona-Catalunya Grand Prix"
};

/**
 * The addresses a race's transcript can be at, most likely first.
 *   "azerbaijan"                     → f1-2026-azerbaijan-grand-prix-post-race-…
 *   "bahrain-grand-prix-in-malaysia" → f1-2026-bahrain-grand-prix-malaysia-post-race-…     (where the FIA put it)
 *                                      f1-2026-bahrain-grand-prix-in-malaysia-post-race-…  (in case it keeps the word next time)
 * A name with "Grand Prix" in the middle is already the whole title, so
 * nothing is appended to it — appending is what sent that race to an
 * address that doesn't exist. Ordinary names give one address, as before.
 */
export function fiaTranscriptUrls(year, slug) {
  const name = Object.hasOwn(FIA_NAMES, slug) ? FIA_NAMES[slug] : slug;
  const stem = /(^|-)grand-prix(-|$)/.test(name) ? name : `${name}-grand-prix`;
  const short = stem.split("-").filter((w) => !DROPPED_WORDS.has(w)).join("-");
  return [...new Set([short, stem])].map((s) => `${FIA_NEWS}/f1-${year}-${s}-${TRANSCRIPT_TAIL}`);
}

/** The address to link to when there is no transcript to show. */
export const fiaTranscriptUrl = (year, slug) => fiaTranscriptUrls(year, slug)[0];

const INDEX_LINK = /href="(\/news\/f1-(\d{4})-[a-z0-9-]{1,120}-post-race-press-conference-transcript)"/;
const INDEX_DATE = /class="date-display-single">\s*(\d{2})\.(\d{2})\.(\d{2})\s*</;

/**
 * fia.com answers an address it doesn't have with its news index: newest
 * first, ten items a page (about a day and a half of news), each with a
 * dd.mm.yy date. When the guessed address misses, the race's transcript
 * may still be on it under a name we didn't expect. Returns the address
 * of a post-race transcript of `year` posted on the race day or the two
 * days after (`raceDate` = Jolpica's yyyy-mm-dd) — races are a week or
 * more apart, so that can only be this race's — else null. Only ever an
 * fia.com/news/f1-…-post-race-press-conference-transcript address.
 */
export function fiaIndexTranscriptUrl(html, year, raceDate) {
  const day = Date.parse(`${raceDate}T00:00:00Z`);
  if (!html || !Number.isFinite(day)) return null;
  for (const item of html.split('class="list-item"').slice(1)) {
    const link = item.match(INDEX_LINK);
    const posted = item.match(INDEX_DATE);
    if (!link || !posted || link[2] !== String(year)) continue;
    const after = (Date.UTC(2000 + +posted[3], +posted[2] - 1, +posted[1]) - day) / 86_400_000;
    if (after >= 0 && after <= 2) return `https://www.fia.com${link[1]}`;
  }
  return null;
}
