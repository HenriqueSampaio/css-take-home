import { fitVerdict, type FitVerdict } from "./fit";
import { overlaps, type DateRange } from "./ranges";

/**
 * "Which berth can take this stay?" The one function that replaces both manual
 * checks from the brief: scanning the grid for a free slot, and checking the
 * vessel against the berth's length.
 */
export type BerthInfo = { id: string; name: string; lengthFt: number };

export type Occupancy = DateRange & {
  id: string;
  berthId: string;
  status: "confirmed" | "needs_review";
  label: string;
};

export type BerthRequest = {
  range: DateRange;
  /** null = a vessel whose length we don't know. Ignored when `requiresFit` is false. */
  vesselLengthFt: number | null;
  /** Events and closures occupy a berth but have no length to check. */
  requiresFit: boolean;
  /** When editing, the reservation being moved must not collide with itself. */
  excludeReservationId?: string;
};

export type BerthVerdict = "available" | "length_needed" | "occupied" | "too_short";

export type BerthOption = {
  berth: BerthInfo;
  verdict: BerthVerdict;
  fit: FitVerdict | null;
  /** Confirmed stays in the way: a hard block (the database would reject the insert). */
  conflicts: Occupancy[];
  /** Unresolved legacy stays in the way: shown as a caution, never a block. */
  cautions: Occupancy[];
};

const RANK: Record<BerthVerdict, number> = { available: 0, length_needed: 1, occupied: 2, too_short: 3 };

export function classifyBerths(berths: readonly BerthInfo[], occupancy: readonly Occupancy[], request: BerthRequest): BerthOption[] {
  const options = berths.map((berth): BerthOption => {
    const inTheWay = occupancy.filter(
      (o) => o.berthId === berth.id && o.id !== request.excludeReservationId && overlaps(o, request.range),
    );
    const conflicts = inTheWay.filter((o) => o.status === "confirmed");
    const cautions = inTheWay.filter((o) => o.status === "needs_review");
    const fit = request.requiresFit ? fitVerdict(request.vesselLengthFt, berth.lengthFt) : null;

    // A berth that is physically too short can never work, so that outranks "occupied".
    const verdict: BerthVerdict =
      fit?.kind === "too_long" ? "too_short"
      : conflicts.length > 0 ? "occupied"
      : fit?.kind === "unknown" ? "length_needed"
      : "available";

    return { berth, verdict, fit, conflicts, cautions };
  });

  // Best option first: usable berths by tightest fit, so a 40 ft boat isn't sent to the 410 ft pier.
  return options.sort(
    (a, b) => RANK[a.verdict] - RANK[b.verdict] || a.berth.lengthFt - b.berth.lengthFt || a.berth.name.localeCompare(b.berth.name),
  );
}
