"use client";

import { useEffect, useState } from "react";

export type Countdown = { d: number; h: number; m: number; s: number; done: boolean };

const pad = (n: number) => String(n).padStart(2, "0");

/** "3d 20:09:48" — the compact form used inline. */
export const formatCountdown = (c: Countdown) =>
  c.done ? "LIGHTS OUT" : `${c.d}d ${pad(c.h)}:${pad(c.m)}:${pad(c.s)}`;

/**
 * Ticking countdown to an ISO timestamp. Returns null until mounted, so
 * server and client render the same thing (no hydration mismatch from a
 * clock that moved between the two).
 */
export function useCountdown(targetIso?: string): Countdown | null {
  const [left, setLeft] = useState<Countdown | null>(null);

  useEffect(() => {
    if (!targetIso) return;
    const target = new Date(targetIso).getTime();
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) return setLeft({ d: 0, h: 0, m: 0, s: 0, done: true });
      setLeft({
        d: Math.floor(ms / 86_400_000),
        h: Math.floor((ms % 86_400_000) / 3_600_000),
        m: Math.floor((ms % 3_600_000) / 60_000),
        s: Math.floor((ms % 60_000) / 1_000),
        done: false,
      });
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [targetIso]);

  return left;
}

export { pad };
