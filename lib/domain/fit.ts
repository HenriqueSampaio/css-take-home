/**
 * "Does the vessel fit the berth?" Deliberately one-dimensional: length overall
 * (LOA) against berth length, in whole feet. Beam, draft, and rafting alongside
 * are out of scope and called out on the About page.
 */
export type LengthStatus = "verified" | "probable" | "conflict" | "unknown";

export type FitVerdict =
  | { kind: "fits"; marginFt: number }
  | { kind: "too_long"; vesselFt: number; berthFt: number; overByFt: number }
  /** No trustworthy length on file: the check cannot be made, which is not the same as passing it. */
  | { kind: "unknown" };

export function fitVerdict(vesselLengthFt: number | null | undefined, berthLengthFt: number): FitVerdict {
  if (vesselLengthFt === null || vesselLengthFt === undefined) return { kind: "unknown" };
  return vesselLengthFt > berthLengthFt
    ? { kind: "too_long", vesselFt: vesselLengthFt, berthFt: berthLengthFt, overByFt: vesselLengthFt - berthLengthFt }
    : { kind: "fits", marginFt: berthLengthFt - vesselLengthFt };
}

/** A length is usable for the fit check only when we actually have a single number for it. */
export const hasUsableLength = (status: LengthStatus): boolean => status === "verified" || status === "probable";

export function describeFit(verdict: FitVerdict): string {
  switch (verdict.kind) {
    case "fits":
      return verdict.marginFt === 0 ? "Fits exactly" : `Fits with ${verdict.marginFt} ft to spare`;
    case "too_long":
      return `${verdict.vesselFt} ft vessel on a ${verdict.berthFt} ft berth: ${verdict.overByFt} ft too long`;
    case "unknown":
      return "Vessel length unknown: fit cannot be verified";
  }
}
