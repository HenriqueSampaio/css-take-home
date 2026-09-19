import type { FitVerdict } from "@/lib/domain/fit";

/**
 * Vessel against berth, one scale, one origin. A vessel that fits ends inside the berth's
 * dimension line; one that does not overruns it, and the overrun is dimensioned in revision
 * red. The words underneath say the same thing, so the drawing is never the only carrier.
 */
export function FitGauge({ fit, berthFt, scaleFt, vesselLabel = "Vessel" }: { fit: FitVerdict; berthFt: number; scaleFt: number; vesselLabel?: string }) {
  const vesselFt = fit.kind === "too_long" ? fit.vesselFt : fit.kind === "fits" ? berthFt - fit.marginFt : null;
  const scale = Math.max(scaleFt, berthFt, vesselFt ?? 0);
  const pct = (ft: number) => `${(ft / scale) * 100}%`;

  return (
    <div className="min-w-0">
      <div className="relative h-7" aria-hidden>
        {/* the berth: a dimension line with end ticks */}
        <div className="dim absolute inset-x-0 top-0">
          <div className="dim-line" style={{ left: 0, width: pct(berthFt) }} />
        </div>
        {/* the vessel: a solid bar from the same origin */}
        {vesselFt !== null ? (
          <>
            <div className="absolute left-0 top-3 h-2.5 bg-prussian" style={{ width: pct(Math.min(vesselFt, berthFt)) }} />
            {fit.kind === "too_long" && (
              <div
                className="absolute top-3 h-2.5 border border-revision"
                style={{ left: pct(berthFt), width: pct(fit.overByFt), background: "repeating-linear-gradient(135deg, var(--color-revision) 0 1.5px, var(--color-revision-tone) 1.5px 5px)" }}
              />
            )}
          </>
        ) : (
          <div className="absolute left-0 top-3 h-2.5 border border-dashed border-line-strong" style={{ width: pct(berthFt) }} />
        )}
      </div>
      <p className="t-data mt-0.5">
        <span className="text-ink-2">Berth {berthFt} ft</span>
        <span className="text-ink-3"> / </span>
        {fit.kind === "fits" && (
          <>
            <span className="text-ink-2">{vesselLabel} {vesselFt} ft</span>
            <span className="font-semibold text-clear"> · {fit.marginFt === 0 ? "exact fit" : `${fit.marginFt} ft spare`}</span>
          </>
        )}
        {fit.kind === "too_long" && (
          <>
            <span className="text-ink-2">{vesselLabel} {fit.vesselFt} ft</span>
            <span className="font-semibold text-revision"> · {fit.overByFt} ft too long</span>
          </>
        )}
        {fit.kind === "unknown" && <span className="font-semibold text-caution">{vesselLabel} length unknown, fit not verified</span>}
      </p>
    </div>
  );
}
