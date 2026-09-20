import type { FitVerdict } from "@/lib/domain/fit";

/**
 * Vessel against berth, one scale, one origin. The berth is a dimension line with end ticks;
 * the vessel is a solid bar laid under it. A vessel that fits ends inside the line; one that
 * does not overruns it, and the overrun is hatched in revision red. The sentence beside it
 * says the same thing in feet, so the drawing is never the only carrier.
 */
export function FitGauge({ fit, scaleFt }: { fit: FitVerdict; scaleFt: number }) {
  const scale = Math.max(scaleFt, fit.berthFt, fit.vesselFt);
  const pct = (ft: number) => `${(ft / scale) * 100}%`;
  return (
    <div className="relative h-7" aria-hidden>
      <div className="dim absolute inset-x-0 top-0"><div className="dim-line" style={{ width: pct(fit.berthFt) }} /></div>
      <div className="gauge-bar top-3 bg-prussian" style={{ width: pct(Math.min(fit.vesselFt, fit.berthFt)) }} />
      {fit.kind === "too_long" && (
        <div
          className="gauge-bar top-3 border border-revision"
          style={{ left: pct(fit.berthFt), width: pct(fit.overByFt), animationDelay: "380ms", background: "repeating-linear-gradient(135deg, var(--color-revision) 0 1.5px, var(--color-revision-tone) 1.5px 5px)" }}
        />
      )}
    </div>
  );
}

export function FitSentence({ fit }: { fit: FitVerdict }) {
  return fit.kind === "fits" ? (
    <p className="t-data text-ink-2">
      <strong className="t-num">{fit.vesselFt} ft</strong> vessel, <strong className="t-num">{fit.berthFt} ft</strong> berth: <span className="font-bold text-clear">{fit.marginFt === 0 ? "an exact fit" : `${fit.marginFt} ft to spare`}</span>
    </p>
  ) : (
    <p className="t-data text-ink-2">
      <strong className="t-num">{fit.vesselFt} ft</strong> vessel, <strong className="t-num">{fit.berthFt} ft</strong> berth: <span className="font-bold text-revision">{fit.overByFt} ft too long</span>
    </p>
  );
}
