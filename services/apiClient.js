/**
 * Fetch client hardened for public F1 APIs:
 *  1. Rate limiter    — OpenF1's free tier is 3 req/s. A per-host token
 *     scheduler paces requests so we stop triggering HTTP 429s (the root
 *     cause of the slow/mock-fallback behaviour).
 *  2. In-flight dedupe — identical concurrent requests share ONE network
 *     call (also neutralises React StrictMode's double-mounted effects).
 *  3. Retry w/ backoff — 429 and 5xx get retries with escalating waits.
 *  4. Two-tier cache   — in-memory + localStorage, so reloads don't
 *     re-hammer the APIs for data that cannot change.
 */

const memory = new Map();   // url → { expires, data }
const inflight = new Map(); // url → Promise

const LS_PREFIX = "f1cache:";

/* ---- Per-host rate limiter ----
   OpenF1 free tier: 3 req/s. We allow up to 3 in flight and space
   request *starts* by MIN_GAP so bursts don't exceed the window.
   Jolpica is generous, so it gets a looser bucket. */
const HOST_LIMITS = {
  // windowMs / maxInWindow = strict sliding-rate cap; maxConcurrent = parallel ceiling.
  // OpenF1 free tier is 3 req/s, so we cap at 3 per rolling 1000ms.
  "api.openf1.org": { maxConcurrent: 3, maxInWindow: 3, windowMs: 1000 },
  "api.jolpi.ca": { maxConcurrent: 4, maxInWindow: 8, windowMs: 1000 },
  default: { maxConcurrent: 4, maxInWindow: 6, windowMs: 1000 },
};

const buckets = new Map(); // host → { active, recent: number[], queue, gating }

function hostOf(url) {
  try { return new URL(url).host; } catch { return "default"; }
}
function limitFor(host) {
  return HOST_LIMITS[host] ?? HOST_LIMITS.default;
}
function bucketFor(host) {
  let b = buckets.get(host);
  if (!b) { b = { active: 0, recent: [], queue: [], gating: false }; buckets.set(host, b); }
  return b;
}

/** Acquire a slot: FIFO, granted by the per-host scheduler. */
function acquire(host) {
  const b = bucketFor(host);
  return new Promise((resolve) => {
    b.queue.push(resolve);
    runGate(host);
  });
}

/* Strict sliding-window scheduler. A request may start only if:
     (a) fewer than maxConcurrent are in flight, AND
     (b) fewer than maxInWindow have STARTED in the last windowMs.
   This guarantees we never exceed OpenF1's 3-req/second cap while still
   allowing up to maxConcurrent requests to run in parallel. */
function runGate(host) {
  const b = bucketFor(host);
  if (b.gating) return;
  b.gating = true;
  const lim = limitFor(host);
  const loop = () => {
    if (!b.queue.length) { b.gating = false; return; }
    const now = Date.now();
    // Drop timestamps outside the window.
    b.recent = b.recent.filter((t) => now - t < lim.windowMs);
    if (b.active < lim.maxConcurrent && b.recent.length < lim.maxInWindow) {
      b.recent.push(now);
      b.active += 1;
      b.queue.shift()();
      setTimeout(loop, 0);
    } else {
      // Wait until either the oldest timestamp ages out or a slot frees.
      const oldest = b.recent[0] ?? now;
      const untilWindow = lim.windowMs - (now - oldest) + 5;
      const wait = b.active >= lim.maxConcurrent ? 20 : Math.max(untilWindow, 15);
      setTimeout(loop, wait);
    }
  };
  loop();
}

function release(host) {
  const b = bucketFor(host);
  b.active = Math.max(0, b.active - 1);
  runGate(host);
}

function lsGet(url) {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(LS_PREFIX + url);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.expires < Date.now()) {
      window.localStorage.removeItem(LS_PREFIX + url);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function lsSet(url, expires, data) {
  try {
    if (typeof window === "undefined") return;
    const raw = JSON.stringify({ expires, data });
    if (raw.length > 300_000) return; // skip huge replay chunks
    window.localStorage.setItem(LS_PREFIX + url, raw);
  } catch {
    /* quota — memory cache still applies */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function doFetch(url, ttl, timeout) {
  const host = hostOf(url);
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await acquire(host); // wait for a rate-limit slot
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    /* Exactly ONE release per acquire (the finally), and any backoff
       sleep happens AFTER release so a waiting retry never holds a
       concurrency slot. `backoffMs` carries the retry decision out. */
    let backoffMs = 0;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < MAX_ATTEMPTS) {
          // 429 backoff is longer — give the rate window time to reset.
          backoffMs = (res.status === 429 ? 1500 : 900) * attempt;
        } else {
          throw new Error(`HTTP ${res.status} — ${url}`);
        }
      } else {
        const data = await res.json();
        const expires = Date.now() + ttl;
        memory.set(url, { expires, data });
        lsSet(url, expires, data);
        return data;
      }
    } catch (err) {
      const transient = err?.name === "AbortError" || /network|fetch failed/i.test(err?.message ?? "");
      if (transient && attempt < MAX_ATTEMPTS) {
        backoffMs = 900 * attempt;
      } else {
        throw err;
      }
    } finally {
      clearTimeout(timer);
      release(host);
    }
    await sleep(backoffMs); // slot already released; safe to wait
  }
  throw new Error(`retries exhausted — ${url}`);
}

export async function fetchJson(url, { ttl = 60_000, timeout = 10_000 } = {}) {
  const hit = memory.get(url);
  if (hit && hit.expires > Date.now()) return hit.data;

  const persisted = lsGet(url);
  if (persisted) {
    memory.set(url, persisted);
    return persisted.data;
  }

  if (inflight.has(url)) return inflight.get(url);
  const p = doFetch(url, ttl, timeout).finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

export function clearApiCache() {
  memory.clear();
  inflight.clear();
  try {
    if (typeof window !== "undefined") {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith(LS_PREFIX))
        .forEach((k) => window.localStorage.removeItem(k));
    }
  } catch {
    /* ignore */
  }
}
