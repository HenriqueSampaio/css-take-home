/**
 * A berth's length as a dimension line, drawn to a common scale against the longest berth.
 * Inner Channel (55 ft) reads as a sliver beside North Pier West (410 ft) before a single
 * number is read, which is the intuition the fit check is about.
 */
export function BerthScale({ lengthFt, maxFt, className = "" }: { lengthFt: number; maxFt: number; className?: string }) {
  const pct = Math.max(4, Math.round((lengthFt / maxFt) * 100));
  return (
    <div className={`dim ${className}`} aria-hidden>
      <div className="dim-line" style={{ width: `${pct}%` }} />
    </div>
  );
}
