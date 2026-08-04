"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { MotionConfig } from "framer-motion";

/**
 * true → skip scroll reveals and paint content immediately.
 *
 * Scroll-reveal animations gate visibility on IntersectionObserver. If IO
 * never reports, every gated element stays at opacity 0 — i.e. a blank
 * dashboard. That happens in real situations: a prerendered/background
 * tab, a document that never composites, print/PDF rendering, or an
 * embedded webview. Content must never be hostage to an animation, so a
 * one-off probe decides whether reveals can be trusted at all.
 */
const ForceVisibleCtx = createContext(false);

export const useForceVisible = () => useContext(ForceVisibleCtx);

export default function MotionProvider({ children }: { children: ReactNode }) {
  const [force, setForce] = useState(false);

  useEffect(() => {
    /* A document that isn't visible never composites: rAF stops ticking
       and IO stops reporting, so any reveal would strand content at
       opacity 0. Decide synchronously — no probe needed. */
    if (
      typeof IntersectionObserver === "undefined" ||
      (typeof document !== "undefined" && document.visibilityState !== "visible")
    ) {
      setForce(true);
      return;
    }
    /* Probe with a real 1px node. If no callback lands within a second,
       IO isn't reporting in this context — reveal everything. */
    let fired = false;
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;pointer-events:none;opacity:0";
    document.body.appendChild(probe);

    const io = new IntersectionObserver(() => {
      fired = true;
    });
    io.observe(probe);

    const cleanup = () => {
      io.disconnect();
      probe.remove();
    };
    const timer = setTimeout(() => {
      if (!fired) setForce(true);
      cleanup();
    }, 1000);

    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, []);

  return (
    <ForceVisibleCtx.Provider value={force}>
      {/* reducedMotion="user" drops transform/layout animation when the OS
          asks for it; opacity still crossfades so changes stay legible. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ForceVisibleCtx.Provider>
  );
}
