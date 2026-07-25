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
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 12px 32px -16px rgba(0,0,0,0.8)",
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
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
