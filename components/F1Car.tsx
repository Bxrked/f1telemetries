"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";

/**
 * Side-profile F1 car — hand-authored SVG, nose pointing right.
 *
 * Proportions follow a current-generation ground-effect car: long
 * wheelbase, high slender nose, deep sidepod undercut, halo, swan-neck
 * rear wing. Livery is a red/white scheme; deliberately no sponsor marks
 * or team badges, which are trademarks and not ours to reproduce.
 *
 * IMPORTANT: the camera dive in RouteCinematic anchors to points inside
 * this viewBox (see CAR_FOCUS). If the geometry moves, those percentages
 * must move with it — HELMET_CENTRE and AIRBOX_CENTRE below are the
 * reference values.
 *
 *   viewBox 1000 × 300
 *   helmet / cockpit  ≈ (612, 132)  →  61.2%  44%
 *   airbox / power unit ≈ (492, 116) →  49.2%  38.7%
 *   sidepod           ≈ (430, 205)  →  43%    68.3%
 */

const RED = "#E10600";
const RED_DARK = "#A80400";
const WHITE = "#EEF1F6";
const CARBON = "#14171D";
const CARBON_LIT = "#1E232C";
const TYRE = "#121316";
const RIM = "#39414F";

function Wheel({ cx, cy, r, spin, reduced }: { cx: number; cy: number; r: number; spin: number; reduced: boolean }) {
  const rim = r * 0.5;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={TYRE} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#000" strokeWidth="2" opacity="0.6" />
      {/* Sidewall band — the compound stripe, no lettering */}
      <circle cx={cx} cy={cy} r={r * 0.82} fill="none" stroke={WHITE} strokeWidth="3" opacity="0.5" />
      <motion.g
        style={{ originX: `${cx}px`, originY: `${cy}px` }}
        animate={reduced ? undefined : { rotate: 360 }}
        transition={reduced ? undefined : { duration: spin, ease: "linear", repeat: Infinity }}
      >
        <circle cx={cx} cy={cy} r={rim} fill={CARBON_LIT} />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <rect
            key={a}
            x={cx - 2.5}
            y={cy - rim}
            width="5"
            height={rim}
            fill={CARBON}
            transform={`rotate(${a} ${cx} ${cy})`}
          />
        ))}
        <circle cx={cx} cy={cy} r={rim * 0.3} fill={RED} />
      </motion.g>
    </g>
  );
}

export default function F1Car({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();

  return (
    <svg viewBox="0 0 1000 300" className={className} role="img" aria-label="Formula 1 car, side profile" fill="none">
      {/* Speed lines — the world moving past a stationary car */}
      {!reduced &&
        [
          { y: 90, w: 200, d: 0.85, delay: 0 },
          { y: 140, w: 300, d: 0.7, delay: 0.3 },
          { y: 215, w: 170, d: 1.0, delay: 0.15 },
          { y: 265, w: 240, d: 0.8, delay: 0.5 },
        ].map((l, i) => (
          <motion.rect
            key={i}
            y={l.y}
            height="2.5"
            rx="1.25"
            fill={RED}
            initial={{ x: -l.w - 40, width: l.w, opacity: 0 }}
            animate={{ x: 1040, opacity: [0, 0.35, 0.35, 0] }}
            transition={{ duration: l.d, ease: "linear", repeat: Infinity, delay: l.delay }}
          />
        ))}

      <motion.g
        animate={reduced ? undefined : { y: [0, -2.5, 0, 1.6, 0] }}
        transition={reduced ? undefined : { duration: 2.6, ease: "easeInOut", repeat: Infinity }}
      >
        {/* ── Floor plank + diffuser ─────────────────────────────── */}
        <path d="M212 250 L880 252 L892 270 L236 274 L206 266 Z" fill={CARBON} />
        <path d="M206 246 L268 240 L272 272 L212 274 Z" fill={CARBON_LIT} />

        {/* ── Rear wing (left) ───────────────────────────────────── */}
        <path d="M18 48 L54 48 L58 166 L22 166 Z" fill={CARBON_LIT} stroke="#000" strokeWidth="1.5" />
        <path d="M28 60 L200 54 L200 86 L28 90 Z" fill={RED} />
        <path d="M28 60 L200 54 L200 66 L28 71 Z" fill={WHITE} opacity="0.85" />
        <path d="M26 98 L198 94 L198 120 L26 124 Z" fill={CARBON} />
        {/* Swan-neck support down to the engine cover */}
        <path d="M150 120 Q168 165 210 192" stroke={CARBON_LIT} strokeWidth="9" fill="none" strokeLinecap="round" />

        {/* ── Engine cover: red body, white spine ────────────────── */}
        <path d="M212 196 L300 152 L400 124 L470 110 L508 120 L524 178 L432 196 L300 206 Z" fill={RED} />
        <path d="M300 152 L400 124 L470 110 L500 118 L470 128 L400 140 L305 166 Z" fill={WHITE} />
        <path d="M212 196 L300 206 L300 196 Z" fill={RED_DARK} />

        {/* ── Sidepod with undercut + inlet ──────────────────────── */}
        <path d="M322 176 L470 166 L546 182 L560 238 L456 252 L322 248 Z" fill={RED} />
        <path d="M330 186 L462 178 L470 196 L336 204 Z" fill={WHITE} opacity="0.9" />
        <path d="M546 186 L560 236 L520 244 L512 190 Z" fill={CARBON} />
        <path d="M330 208 L500 200 L508 244 L340 246 Z" fill={RED_DARK} opacity="0.35" />

        {/* ── Airbox / roll hoop ─────────────────────────────────── */}
        <path d="M462 116 L478 78 L512 76 L524 112 L516 142 L470 140 Z" fill={RED} />
        <path d="M478 82 L512 80 L516 100 L480 102 Z" fill={CARBON} />
        <ellipse cx="496" cy="88" rx="15" ry="9" fill="#05070A" />

        {/* ── Survival cell / chassis ────────────────────────────── */}
        <path d="M508 130 L560 132 L580 138 L664 152 L672 186 L560 190 L516 182 Z" fill={RED} />
        <path d="M560 132 L664 152 L668 164 L562 146 Z" fill={WHITE} opacity="0.55" />

        {/* Cockpit opening */}
        <path d="M556 140 L648 152 L650 168 L558 162 Z" fill="#04060A" />

        {/* ── Driver helmet, seated in the cockpit ───────────────── */}
        <g>
          {/* Dome */}
          <path d="M582 150 Q580 108 614 104 Q650 102 654 140 L654 152 Z" fill={WHITE} />
          {/* Upper accent band */}
          <path d="M584 128 Q596 110 626 107 Q646 106 652 122 L650 130 Q630 116 590 134 Z" fill={RED} />
          {/* Visor — dark, wrapping the forward face */}
          <path d="M616 118 Q652 116 655 138 L654 148 L620 145 Q612 132 616 118 Z" fill="#0A0C10" />
          <path d="M622 122 Q648 121 650 136" stroke="#3B4757" strokeWidth="2.5" fill="none" opacity="0.8" />
          {/* Chin bar */}
          <path d="M612 146 L654 150 L654 158 L610 155 Z" fill={RED} />
          {/* Halo centre pillar passes in front of the helmet */}
        </g>

        {/* ── Halo ───────────────────────────────────────────────── */}
        <path
          d="M548 148 Q548 104 604 98 Q664 93 678 140"
          stroke="#0A0C10"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M676 142 L688 168" stroke="#0A0C10" strokeWidth="10" strokeLinecap="round" />

        {/* ── Nose cone: high, slender, dropping to the wing ─────── */}
        <path d="M664 156 L760 172 L858 198 L898 220 L900 244 L836 226 L742 200 L666 186 Z" fill={RED} />
        <path d="M664 156 L760 172 L858 198 L862 210 L762 184 L666 168 Z" fill={WHITE} opacity="0.9" />

        {/* ── Front wing: multi-element + endplate ───────────────── */}
        <path d="M862 250 L980 236 L982 252 L864 266 Z" fill={CARBON} />
        <path d="M872 234 L976 222 L978 234 L874 246 Z" fill={RED} />
        <path d="M880 220 L972 210 L974 220 L882 230 Z" fill={WHITE} opacity="0.8" />
        <path d="M968 206 L996 204 L998 272 L970 272 Z" fill={CARBON_LIT} stroke="#000" strokeWidth="1.5" />

        {/* ── Suspension ─────────────────────────────────────────── */}
        <path d="M700 196 L742 178 M700 214 L744 208" stroke={CARBON_LIT} strokeWidth="7" strokeLinecap="round" />
        <path d="M318 196 L286 182 M318 216 L288 212" stroke={CARBON_LIT} strokeWidth="7" strokeLinecap="round" />

        {/* Wheels over the bodywork */}
        <Wheel cx={250} cy={204} r={76} spin={0.62} reduced={!!reduced} />
        <Wheel cx={770} cy={204} r={76} spin={0.62} reduced={!!reduced} />
      </motion.g>

      {/* Ground contact */}
      <ellipse cx="510" cy="288" rx="400" ry="8" fill={RED} opacity="0.09" />
      <motion.rect
        x="150"
        y="286"
        height="1.5"
        rx="0.75"
        fill={CARBON_LIT}
        initial={{ width: 0 }}
        animate={{ width: 720 }}
        transition={{ duration: 0.9, ease: EASE.out, delay: 0.4 }}
      />
    </svg>
  );
}
