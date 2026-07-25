"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart3, Radio, Swords, Activity } from "lucide-react";

const LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/telemetry", label: "Post-Race Telemetry", icon: BarChart3 },
  { href: "/live", label: "Live Race", icon: Radio, pulse: true },
  { href: "/compare", label: "Head-to-Head", icon: Swords },
];

/** Global navigation — sticky, carbon glass, pit-board red for the active tab. */
export default function SiteNav() {
  const pathname = usePathname();
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
        {LINKS.map(({ href, label, icon: Icon, pulse }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`timing relative flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors
                ${active ? "bg-f1red text-white" : "text-carbon-300 hover:bg-carbon-800 hover:text-carbon-100"}`}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
              {pulse && !active && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
              )}
            </Link>
          );
        })}
        <span className="ml-auto hidden items-center gap-1.5 text-[11px] uppercase tracking-wider text-carbon-400 md:flex">
          <Activity size={14} className="text-sector-green" /> Season data · auto-updating
        </span>
      </div>
    </nav>
  );
}
