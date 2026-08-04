import type { Config } from "tailwindcss";

/**
 * Design tokens — "Parc Fermé Dark"
 * carbon    : deep carbon-fibre background scale
 * f1red     : official F1 neon red accent
 * sector    : FIA timing-screen conventions (purple / green / yellow)
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        carbon: {
          950: "#08090C", // page background
          900: "#0C0E12", // deep panels
          850: "#11141A", // panel surface
          800: "#161A22", // raised surface
          700: "#1E2430", // borders / grid lines
          600: "#2A3242", // strong borders
          400: "#5B6678", // muted labels
          300: "#8B95A7", // secondary text
          100: "#E7EAF0", // primary text
        },
        f1red: {
          DEFAULT: "#E10600",
          bright: "#FF1E00",
          glow: "rgba(225, 6, 0, 0.35)",
        },
        sector: {
          purple: "#B44CFF", // overall fastest
          green: "#2EE07C",  // personal best
          yellow: "#FFD644", // slower than personal best
        },
        tyre: {
          soft: "#FF3B30",
          medium: "#FFD644",
          hard: "#E7EAF0",
          inter: "#43D675",
          wet: "#3B9BFF",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-timing)", "monospace"],
      },
      /* Type scale — rem-based so it participates in the desktop step-up
         in globals.css. Replaces scattered text-[10px]/[11px] literals,
         which were px and therefore did NOT scale with the rest. */
      fontSize: {
        micro: ["0.625rem", { lineHeight: "1.4", letterSpacing: "0.02em" }],
        data: ["0.6875rem", { lineHeight: "1.45" }],
        label: ["0.75rem", { lineHeight: "1.4" }],
      },
      /* Tight radii: this is a timing screen, not a marketing page. */
      borderRadius: {
        panel: "6px",
        row: "4px",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-expo": "cubic-bezier(0.7, 0, 0.84, 0)",
      },
      transitionDuration: {
        micro: "180ms",
        layout: "350ms",
        exit: "120ms",
      },
      boxShadow: {
        /* Hairline top highlight only. The heavy drop shadow made panels
           float like generic SaaS cards; density reads better flat. */
        panel: "0 1px 0 0 rgba(255,255,255,0.04) inset",
        "red-glow": "0 0 24px rgba(225, 6, 0, 0.25)",
      },
      backgroundImage: {
        "carbon-weave":
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 4px)",
        "grid-fade":
          "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
      },
      animation: {
        "pulse-dot": "pulseDot 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        /* Loading sweep — the most-watched animation on the site, since
           every panel shows it on every load. A flat opacity pulse reads
           as "broken"; a directional sweep reads as "working". */
        shimmer: "shimmer 1.4s ease-in-out infinite",
        "scan-line": "scanLine 2.6s linear infinite",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(200%)" },
        },
        scanLine: {
          "0%": { transform: "translateY(0)", opacity: "0" },
          "10%, 90%": { opacity: "0.5" },
          "100%": { transform: "translateY(100%)", opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
