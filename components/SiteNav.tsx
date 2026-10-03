"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useScroll, useSpring } from "framer-motion";
import { Home, BarChart3, Radio, Swords, Users, Activity } from "lucide-react";
import { FEATURES } from "@/services/features";
import { SPRING, PRESS } from "@/lib/motion";
import { useCinematic } from "./RouteCinematic";
import F1Mark from "./F1Mark";

const LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/telemetry", label: "Post-Race Telemetry", icon: BarChart3 },
  { href: "/live", label: "Race Replay", icon: Radio },
  { href: "/compare", label: "Head-to-Head", icon: Swords },
  { href: "/teammates", label: "Teammates", icon: Users },
];

/* The replay tab is gated by FEATURES.raceReplay (services/features.js). */
const VISIBLE_LINKS = LINKS.filter((l) => FEATURES.raceReplay || l.href !== "/live");

/** Global navigation — sticky, carbon glass, pit-board red for the active tab. */
export default function SiteNav() {
  const pathname = usePathname();
  const { play } = useCinematic();
  /* Reading position on long boards, drawn into the nav's own bottom
     border. Sprung so it glides with the scroll instead of stepping. */
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 32, mass: 0.4 });
  return (
    <nav className="sticky top-0 z-50 border-b border-carbon-700 bg-carbon-950/85 backdrop-blur">
      {/* The landing page never scrolls, so a stuck-at-zero bar would just
          be a stray line there. */}
      {pathname !== "/" && (
        <motion.span
          aria-hidden
          style={{ scaleX: progress }}
          className="absolute inset-x-0 -bottom-px h-px origin-left bg-f1red"
        />
      )}
      <div className="mx-auto flex max-w-7xl items-center gap-1.5 px-4 py-3.5 sm:px-6 2xl:max-w-[1440px]">
        <Link
          href="/"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            play("/", "Home");
          }}
          className="group mr-4 flex shrink-0 items-center gap-2.5"
          aria-label="F1 Telemetries — home"
        >
          {/* The mark carries "F1"; the wordmark beside it completes the name.
              Vector, and the same shape the homepage intro flies through. */}
          <F1Mark className="h-5 w-auto text-[#E80000] transition-transform duration-micro ease-out-expo group-hover:-translate-y-px sm:h-6" />
          <span className="hidden font-display text-base font-bold uppercase tracking-wider text-carbon-100 xl:block">
            Telemetries
          </span>
        </Link>
        {VISIBLE_LINKS.map(({ href, label, icon: Icon }) => {
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
                className={`timing relative flex items-center gap-2 whitespace-nowrap rounded-panel px-3 py-2 text-label font-bold uppercase tracking-wider xl:px-4
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
                {/* Five tabs: names from lg up, icons below — they wrapped at 1280. */}
                <span className="relative z-10 hidden lg:inline">{label}</span>
              </Link>
            </motion.div>
          );
        })}
        <span className="ml-auto hidden items-center gap-1.5 whitespace-nowrap text-[11px] uppercase tracking-wider text-carbon-400 min-[1400px]:flex">
          <Activity size={14} className="text-sector-green" /> Season data · auto-updating
        </span>
      </div>
    </nav>
  );
}
