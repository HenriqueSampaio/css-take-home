import type { Block, Segment } from "./model";
import { monthKey } from "./model";
import type { CarryOverReport } from "./report";

/** A segment reduced to what a person would compare by eye: berth, day span, name. */
const signature = (s: Segment): string =>
  `${s.berthId} ${s.startDate.slice(8)}-${s.endDate.slice(8)} ${s.occupant ? (s.occupant.kind === "vessel" ? s.occupant.nameKey : s.occupant.title) : "(unlabelled)"}`;

/**
 * Sheets 2002-2004 open with a copy of the previous December. The copy is never
 * imported (the previous year's sheet is the authority), but it is read the same
 * way so the report can say exactly how the two differ.
 */
export function compareCarryOver(
  block: Block,
  copy: readonly Segment[],
  authoritative: readonly Segment[],
  evidence: { weekdayMatchesClaimedMonth: boolean; weekdayMatchesSheetYearDecember: boolean; labelCells: number },
): CarryOverReport {
  const mine = copy.map(signature).sort();
  const theirs = authoritative.map(signature).sort();
  const remaining = [...theirs];
  const onlyInCarryOver: string[] = [];
  let identical = 0;
  for (const sig of mine) {
    const at = remaining.indexOf(sig);
    if (at === -1) onlyInCarryOver.push(sig);
    else {
      remaining.splice(at, 1);
      identical++;
    }
  }
  return {
    sheet: block.sheet,
    claims: monthKey(block.year, block.month),
    titleCell: `${block.sheet}!A${block.titleRow}`,
    weekdayMatchesClaimedMonth: evidence.weekdayMatchesClaimedMonth,
    weekdayMatchesSheetYearDecember: evidence.weekdayMatchesSheetYearDecember,
    segmentsFound: copy.length,
    labelCells: evidence.labelCells,
    comparedWith: `${block.year} sheet, ${monthKey(block.year, block.month)}`,
    identicalSegments: identical,
    onlyInCarryOver,
    onlyInAuthoritative: remaining,
  };
}
