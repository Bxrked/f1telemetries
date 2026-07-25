"use client";

/**
 * Shared dark tooltip for all Recharts modules.
 * `formatter(entry)` may return a custom { label, value, color } row.
 */
export default function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-carbon-600 bg-carbon-900/95 px-3 py-2 shadow-panel backdrop-blur">
      {label !== undefined && (
        <p className="eyebrow mb-1.5">{label}</p>
      )}
      <ul className="space-y-1">
        {payload.map((entry: any, i: number) => {
          const row = formatter ? formatter(entry) : null;
          return (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ background: row?.color ?? entry.color ?? entry.fill }}
              />
              <span className="text-carbon-300">{row?.label ?? entry.name}</span>
              <span className="timing ml-auto pl-4 font-medium text-carbon-100">
                {row?.value ?? entry.value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
