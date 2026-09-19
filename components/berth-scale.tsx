/**
 * A berth's length as a dimension line, drawn to a common scale against the longest berth.
 * Inner Channel (55 ft) reads as a sliver beside North Pier West (410 ft) before a single
 * number is read, which is the intuition the fit check is about.
 */
export function BerthScale({ name, lengthFt, maxFt }: { name: string; lengthFt: number; maxFt: number }) {
  const pct = Math.max(4, Math.round((lengthFt / maxFt) * 100));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[0.875rem] font-semibold leading-tight">{name}</span>
        <span className="t-data shrink-0 text-ink-2">{lengthFt} ft</span>
      </div>
      <div className="dim mt-1" aria-hidden>
        <div className="dim-line" style={{ left: 0, width: `${pct}%` }} />
      </div>
    </div>
  );
}
