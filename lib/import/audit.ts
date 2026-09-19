import { findOverlappingPairs } from "../domain/ranges";
import type { ISODate } from "../domain/dates";

export type AuditItem = {
  id: string;
  berthId: string;
  startDate: ISODate;
  endDate: ISODate;
  /** How the row should be named in a sentence, e.g. `OSV Wild Star`. */
  label: string;
  sourceRef: string;
};

export type OverlapFinding = {
  reservationId: string;
  otherId: string;
  detail: string;
  /** `duplicate_berth_row` when both stays were read from the same month block of one sheet. */
  reason: string | null;
};

const sheetRows = (sourceRef: string): Set<string> => new Set(sourceRef.split(";").map((run) => run.split("!")[0]));

/**
 * Finds every pair of imported rows that claim the same berth on the same day
 * (touching dates count: a berth-day has one occupant) and reports BOTH sides.
 * The importer never picks a winner; a person does, in the review queue.
 */
export function auditOverlaps(items: readonly AuditItem[]): { pairs: number; findings: OverlapFinding[] } {
  const ranged = items.map((item) => ({ item, start: item.startDate, end: item.endDate }));
  const pairs = findOverlappingPairs(ranged, (r) => r.item.berthId);
  const findings: OverlapFinding[] = [];
  for (const [a, b] of pairs) {
    const sameSheet = [...sheetRows(a.item.sourceRef)].some((s) => sheetRows(b.item.sourceRef).has(s));
    const reason = sameSheet ? "duplicate_berth_row" : null;
    for (const [self, other] of [[a.item, b.item], [b.item, a.item]]) {
      findings.push({
        reservationId: self.id,
        otherId: other.id,
        reason,
        detail: `Overlaps ${other.label} (${other.startDate} to ${other.endDate}, ${other.sourceRef}) on the same berth; both were in the legacy grid, so neither was dropped. Decide which stay is real.`,
      });
    }
  }
  return { pairs: pairs.length, findings };
}
