"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { wordRise, ruleWipe, metaFade } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";

/**
 * Page headline shared by every data page.
 *
 * The words rise out of masks one after another, then the red rule wipes
 * in underneath, then the meta line settles — three beats, in reading
 * order, all done inside ~0.9s so the page is usable immediately.
 *
 * `tone(word, i)` lets a page set hierarchy inside the headline (e.g. the
 * country bright, "Grand Prix" recessive) without hand-rolling spans.
 */
export default function PageTitle({
  eyebrow,
  title,
  tone,
  meta,
  aside,
}: {
  eyebrow: ReactNode;
  title: string;
  tone?: (word: string, i: number) => string;
  meta?: ReactNode;
  aside?: ReactNode;
}) {
  const forceVisible = useForceVisible();
  const play = forceVisible ? { initial: false as const, animate: "show" } : { initial: "hidden", animate: "show" };
  const words = title.split(" ");

  return (
    <motion.header {...play} className="mb-6 border-b border-carbon-700 pb-5">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <motion.p variants={metaFade} className="eyebrow mb-2 flex items-center gap-2">
            {eyebrow}
          </motion.p>
          <h1
            className="font-display text-4xl font-black uppercase italic leading-[0.92] tracking-tight sm:text-6xl"
            aria-label={title}
          >
            {words.map((w, i) => (
              /* The slot clips the rising word. Right padding keeps the italic
                 overhang from being shaved off by the mask. */
              <span key={i} aria-hidden className="inline-block overflow-hidden pr-[0.12em] align-bottom">
                <motion.span custom={i} variants={wordRise} className={`inline-block ${tone?.(w, i) ?? ""}`}>
                  {w}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.span
            variants={ruleWipe}
            aria-hidden
            className="mt-3 block h-[3px] w-20 origin-left -skew-x-[20deg] bg-f1red"
          />
          {meta && (
            <motion.div variants={metaFade} className="mt-3">
              {meta}
            </motion.div>
          )}
        </div>
        {aside && (
          <motion.div variants={metaFade} className="shrink-0">
            {aside}
          </motion.div>
        )}
      </div>
    </motion.header>
  );
}
