"use client";

/**
 * Shared dark tooltip for all Recharts modules.
 * `formatter(entry)` may return a custom { label, value, color } row.
 */
export default function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    /* Tight, square, mono — reads like a timing readout rather than a
       floating card. Values are tabular so they don't shift as you move
       along a series. */
    <div className="rounded-row border border-carbon-600 bg-carbon-950/95 px-2.5 py-1.5 shadow-panel backdrop-blur-sm">
      {label !== undefined && <p className="eyebrow mb-1">{label}</p>}
      <ul className="space-y-0.5">
        {payload.map((entry: any, i: number) => {
          const row = formatter ? formatter(entry) : null;
          return (
            <li key={i} className="flex items-center gap-2 text-data">
              <span
                className="h-2 w-[3px] rounded-full"
                style={{ background: row?.color ?? entry.color ?? entry.fill }}
              />
              <span className="text-carbon-300">{row?.label ?? entry.name}</span>
              <span className="timing ml-auto pl-4 font-bold tabular-nums text-carbon-100">
                {row?.value ?? entry.value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
