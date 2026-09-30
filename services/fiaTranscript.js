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

/** "São Paulo Grand Prix" → "sao-paulo" (the FIA's URL slug for the race). */
export function fiaRaceSlug(raceName) {
  return raceName
    .replace(/\s*Grand Prix\s*$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const fiaTranscriptUrl = (year, slug) =>
  `https://www.fia.com/news/f1-${year}-${slug}-grand-prix-post-race-press-conference-transcript`;
