import type { FitVerdict } from "@/lib/domain/fit";

/**
 * Vessel against berth on one scale. The grey track is the scale, the pale bar is the berth,
 * the solid bar is the vessel: inside the berth in green when it fits, running past it in red
 * when it does not. The sentence beside it says the same thing in feet.
 */
export function FitBar({ fit, scaleFt }: { fit: FitVerdict; scaleFt: number }) {
  const scale = Math.max(scaleFt, fit.berthFt, fit.vesselFt);
  const pct = (ft: number) => `${Math.max(2, (ft / scale) * 100)}%`;
  const fits = fit.kind === "fits";
  return (
    <div className="fitbar" aria-hidden>
      <span style={{ width: pct(fit.berthFt), background: fits ? "color-mix(in srgb, var(--color-ok) 22%, white)" : "color-mix(in srgb, var(--color-danger) 18%, white)" }} />
      <span style={{ width: pct(fit.vesselFt), background: fits ? "var(--color-ok)" : "var(--color-danger)", animationDelay: "120ms" }} />
    </div>
  );
}

export function FitSentence({ fit }: { fit: FitVerdict }) {
  return fit.kind === "fits" ? (
    <p className="t-small text-ink-2">
      <strong className="t-num">{fit.vesselFt} ft</strong> vessel, <strong className="t-num">{fit.berthFt} ft</strong> berth: <span className="font-bold text-ok">{fit.marginFt === 0 ? "an exact fit" : `${fit.marginFt} ft to spare`}</span>
    </p>
  ) : (
    <p className="t-small text-ink-2">
      <strong className="t-num">{fit.vesselFt} ft</strong> vessel, <strong className="t-num">{fit.berthFt} ft</strong> berth: <span className="font-bold text-danger-ink">{fit.overByFt} ft too long</span>
    </p>
  );
}
