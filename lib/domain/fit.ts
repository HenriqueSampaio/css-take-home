/**
 * "Does the vessel fit the berth?" Deliberately one-dimensional: length overall (LOA)
 * against berth length, in whole feet. Beam, draft and rafting alongside are out of scope.
 * Every vessel in this system has a length (it is required to register one), so the check
 * can always be made.
 */
export type FitVerdict =
  | { kind: "fits"; vesselFt: number; berthFt: number; marginFt: number }
  | { kind: "too_long"; vesselFt: number; berthFt: number; overByFt: number };

export function fitVerdict(vesselLengthFt: number, berthLengthFt: number): FitVerdict {
  return vesselLengthFt > berthLengthFt
    ? { kind: "too_long", vesselFt: vesselLengthFt, berthFt: berthLengthFt, overByFt: vesselLengthFt - berthLengthFt }
    : { kind: "fits", vesselFt: vesselLengthFt, berthFt: berthLengthFt, marginFt: berthLengthFt - vesselLengthFt };
}

export function describeFit(verdict: FitVerdict): string {
  return verdict.kind === "fits"
    ? verdict.marginFt === 0 ? "Fits exactly" : `Fits with ${verdict.marginFt} ft to spare`
    : `${verdict.vesselFt} ft vessel on a ${verdict.berthFt} ft berth: ${verdict.overByFt} ft too long`;
}
