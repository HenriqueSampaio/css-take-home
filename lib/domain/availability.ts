import { fitVerdict, type FitVerdict } from "./fit";
import { overlaps, type DateRange } from "./ranges";

/**
 * "Which berth can take this stay?" The one function that replaces both manual checks
 * from the brief: scanning a grid for a free slot, and checking the vessel against the
 * berth's length.
 */
export type BerthInfo = { id: string; name: string; lengthFt: number };

/** A confirmed reservation that occupies a berth. */
export type Occupancy = DateRange & { id: string; berthId: string; label: string };

export type BerthRequest = {
  range: DateRange;
  /** null for events and closures, which occupy a berth but have no length to check. */
  vesselLengthFt: number | null;
  /** When editing, the reservation being moved must not collide with itself. */
  excludeReservationId?: string;
};

export type BerthVerdict = "available" | "occupied" | "too_short";

export type BerthOption = {
  berth: BerthInfo;
  verdict: BerthVerdict;
  fit: FitVerdict | null;
  /** Reservations in the way (the database would reject the booking). */
  conflicts: Occupancy[];
};

const RANK: Record<BerthVerdict, number> = { available: 0, occupied: 1, too_short: 2 };

export function classifyBerths(berths: readonly BerthInfo[], occupancy: readonly Occupancy[], request: BerthRequest): BerthOption[] {
  const options = berths.map((berth): BerthOption => {
    const conflicts = occupancy.filter((o) => o.berthId === berth.id && o.id !== request.excludeReservationId && overlaps(o, request.range));
    const fit = request.vesselLengthFt === null ? null : fitVerdict(request.vesselLengthFt, berth.lengthFt);
    // A berth that is physically too short can never work, so that outranks "occupied".
    const verdict: BerthVerdict = fit?.kind === "too_long" ? "too_short" : conflicts.length > 0 ? "occupied" : "available";
    return { berth, verdict, fit, conflicts };
  });
  // Best option first: usable berths by tightest fit, so a 40 ft boat isn't sent to the 410 ft pier.
  return options.sort((a, b) => RANK[a.verdict] - RANK[b.verdict] || a.berth.lengthFt - b.berth.lengthFt || a.berth.name.localeCompare(b.berth.name));
}
