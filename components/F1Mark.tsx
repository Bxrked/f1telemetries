import { F1_MARK } from "@/lib/f1Mark";

/** The F1 mark, as crisp vector at any size. Width follows the height. */
export default function F1Mark({ className = "", title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox={`0 0 ${F1_MARK.w} ${F1_MARK.h}`}
      className={className}
      style={{ aspectRatio: `${F1_MARK.w} / ${F1_MARK.h}` }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={F1_MARK.d} fill="currentColor" />
    </svg>
  );
}
