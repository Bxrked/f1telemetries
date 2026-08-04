"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, BarChart3, Radio, Swords, Activity } from "lucide-react";
import { FEATURES } from "@/services/features";
import { SPRING, PRESS } from "@/lib/motion";
import { useCinematic } from "./RouteCinematic";

const LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/telemetry", label: "Post-Race Telemetry", icon: BarChart3 },
  { href: "/live", label: "Live Race", icon: Radio, pulse: true },
  { href: "/compare", label: "Head-to-Head", icon: Swords },
];

/* Replay is shelved — the Live Race tab stays out of the nav until
   FEATURES.raceReplay is flipped back on. */
const VISIBLE_LINKS = LINKS.filter((l) => FEATURES.raceReplay || l.href !== "/live");

/** Global navigation — sticky, carbon glass, pit-board red for the active tab. */
export default function SiteNav() {
  const pathname = usePathname();
  const { play } = useCinematic();
  return (
    <nav className="sticky top-0 z-50 border-b border-carbon-700 bg-carbon-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-1.5 px-4 py-3.5 sm:px-6 2xl:max-w-[1440px]">
        <Link href="/" className="mr-4 flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-f1red font-display text-base font-black italic text-white">
            F1
          </span>
          <span className="hidden font-display text-base font-bold uppercase tracking-wider md:block">
            F1 <span className="text-f1red-bright">Telemetries</span>
          </span>
        </Link>
        {VISIBLE_LINKS.map(({ href, label, icon: Icon, pulse }) => {
          const active = pathname === href;
          return (
            <motion.div key={href} whileTap={PRESS} transition={SPRING.press}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                /* Route through the camera so nav and the landing page
                   share one spatial model. Modifier-clicks stay native. */
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  play(href, label);
                }}
                className={`timing relative flex items-center gap-2 rounded-panel px-4 py-2 text-label font-bold uppercase tracking-wider
                  transition-colors duration-micro ease-out-expo
                  ${active ? "text-white" : "text-carbon-300 hover:bg-carbon-800 hover:text-carbon-100"}`}
              >
                {/* Shared element: the red pill slides between tabs rather
                    than blinking out of one and into the next. */}
                {active && (
                  <motion.span
                    layoutId="nav-active-pill"
                    transition={SPRING.panel}
                    className="absolute inset-0 rounded-panel bg-f1red"
                  />
                )}
                <Icon size={15} className="relative z-10" />
                <span className="relative z-10 hidden sm:inline">{label}</span>
                {pulse && !active && (
                  <span className="absolute -right-0.5 -top-0.5 z-10 h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
                )}
              </Link>
            </motion.div>
          );
        })}
        <span className="ml-auto hidden items-center gap-1.5 text-[11px] uppercase tracking-wider text-carbon-400 md:flex">
          <Activity size={14} className="text-sector-green" /> Season data · auto-updating
        </span>
      </div>
    </nav>
  );
}
