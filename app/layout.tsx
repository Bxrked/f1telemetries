import type { Metadata, Viewport } from "next";
import { Titillium_Web, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SiteNav from "@/components/SiteNav";
import MotionProvider from "@/components/MotionProvider";
import RouteCinematic from "@/components/RouteCinematic";

/* Display face: Titillium Web — the family F1's own branding is built on. */
const display = Titillium_Web({
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  variable: "--font-display",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

/* All timing data renders in a tabular mono — FIA timing-screen convention. */
const timing = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-timing",
});

const SITE_URL = "https://f1telemetries.com";
const SITE_NAME = "F1 Telemetries";
const DESCRIPTION =
  "Live Formula 1 race analytics: sector timing, tyre strategy, pit stops, degradation models, " +
  "speed traps, championship standings and broadcast-style race replays — updated automatically after every Grand Prix.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "F1 Telemetries — Live Formula 1 Race Analytics",
    /* Per-page titles render as e.g. "Head-to-Head — F1 Telemetries" */
    template: "%s — F1 Telemetries",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "F1 telemetry", "Formula 1 analytics", "race data", "sector times",
    "tyre strategy", "pit stops", "F1 standings", "race replay", "OpenF1",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "F1 Telemetries — Live Formula 1 Race Analytics",
    description: DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "F1 Telemetries — Live Formula 1 Race Analytics",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "sports",
};

/* themeColor lives in the viewport export (Next 14+). Sets the browser
   chrome colour on mobile to the dashboard's carbon background. */
export const viewport: Viewport = {
  themeColor: "#08090C",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      {/* Flex column so a full-height page can claim exactly the space the
          nav leaves, without hardcoding the nav's height (it varies by
          breakpoint). Pages that don't opt into flex-1 size naturally. */}
      <body
        className={`${display.variable} ${body.variable} ${timing.variable} flex min-h-svh flex-col font-sans`}
      >
        {/* Global reduced-motion honouring for all Framer Motion animation,
            layered on top of the CSS block in globals.css. */}
        <MotionProvider>
          <RouteCinematic>
            <SiteNav />
            {children}
          </RouteCinematic>
        </MotionProvider>
      </body>
    </html>
  );
}
