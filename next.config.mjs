import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const isDev = process.env.NODE_ENV !== "production";

/* Optional hosted hero clip (see CarHero) — allow its origin if set. */
let videoOrigin = "";
try {
  if (process.env.NEXT_PUBLIC_CAR_VIDEO_URL) videoOrigin = new URL(process.env.NEXT_PUBLIC_CAR_VIDEO_URL).origin;
} catch {
  /* not a URL — CarHero falls back to the local file */
}

/**
 * Content-Security-Policy: only what the site actually loads.
 *  - connect: the two data APIs (browser-side fetches) + our own /api
 *  - media:   the hero clip, and team radio audio (livetiming.formula1.com
 *             is the only host OpenF1 serves clips from — checked)
 *  - scripts/styles: 'unsafe-inline' because Next's bootstrap and
 *    framer-motion/Recharts inline styles need it without a nonce setup;
 *    dev adds 'unsafe-eval' and websockets for hot reload only.
 *  - frame-ancestors 'none': the site can't be framed (clickjacking).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://media.formula1.com https://www.formula1.com",
  "font-src 'self' data:",
  `media-src 'self' https://livetiming.formula1.com${videoOrigin ? ` ${videoOrigin}` : ""}`,
  `connect-src 'self' https://api.openf1.org https://api.jolpi.ca${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /* Don't advertise the framework version in every response. */
  poweredByHeader: false,
  /* Pin the workspace root. A stray package-lock.json + node_modules sit in
     the PARENT folder ("coding and shi"), so Turbopack was inferring that as
     the root — which produced the multiple-lockfiles warning on every build
     and made dev-mode resolution of newly added files unreliable. */
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
