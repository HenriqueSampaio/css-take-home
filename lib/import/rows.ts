import { BERTH_IDS } from "../seed/contract";
import { collapseWhitespace } from "../domain/names";
import { isBookingFill } from "./fills";
import type { SheetMatrix } from "./types";
import { cellAt, hasValue, indexRows, valueAt, type RowIndex } from "./grid";
import type { BerthInfo, Block, BlockRow } from "./model";

/** `North Pier West - 410'`: a berth row is the only kind of row that names a length. */
export const BERTH_ROW_RE = /^(.*\S)\s*-\s*(\d+)'$/;

/**
 * The six berths, byte-identical in all 23 year sheets. Hard-coded on purpose:
 * a seventh name means the workbook changed and a person should look, so
 * `classifyRows` throws rather than inventing a berth.
 */
export const BERTHS: readonly BerthInfo[] = [
  { id: BERTH_IDS[0], name: "North Pier West", lengthFt: 410, sortOrder: 1 },
  { id: BERTH_IDS[1], name: "North Pier Face", lengthFt: 75, sortOrder: 2 },
  { id: BERTH_IDS[2], name: "North Pier East", lengthFt: 240, sortOrder: 3 },
  { id: BERTH_IDS[3], name: "Inner Channel", lengthFt: 55, sortOrder: 4 },
  { id: BERTH_IDS[4], name: "South Float West", lengthFt: 90, sortOrder: 5 },
  { id: BERTH_IDS[5], name: "South Float East", lengthFt: 90, sortOrder: 6 },
];

export function parseBerthRow(text: string): BerthInfo | null {
  const m = BERTH_ROW_RE.exec(collapseWhitespace(text));
  if (!m) return null;
  const berth = BERTHS.find((b) => b.name === m[1] && b.lengthFt === Number(m[2]));
  if (!berth) throw new Error(`Unknown berth "${text}": the importer only knows ${BERTHS.map((b) => `${b.name} - ${b.lengthFt}'`).join(", ")}`);
  return berth;
}

/**
 * Sorts the rows under a block header into berth rows (imported), area rows
 * (other text in column A: small-craft slips, finger piers) and orphan rows
 * (no column A at all, but something written or booked on them). A berth that
 * appears twice in one block keeps both rows: that is the only way the grid can
 * record a genuine double-booking, so they must land on the same berth.
 */
export function classifyRows(sheet: SheetMatrix, block: Block, index: RowIndex = indexRows(sheet)): BlockRow[] {
  const rows: BlockRow[] = [];
  const seen = new Map<string, number>();
  for (let row = block.firstRow; row <= block.lastRow; row++) {
    if (block.headerRows.includes(row)) continue;
    const a = valueAt(sheet, row, 1);
    if (a !== null && String(a).trim() !== "") {
      const berth = parseBerthRow(String(a));
      if (berth) {
        const ordinal = seen.get(berth.id) ?? 0;
        seen.set(berth.id, ordinal + 1);
        rows.push({ row, kind: "berth", berth, ordinal });
      } else {
        rows.push({ row, kind: "area", name: collapseWhitespace(String(a)) });
      }
      continue;
    }
    // Background-only rows are blank paper; an orphan has a value or a booking colour on it.
    const cols = index.get(row) ?? [];
    const occupied = cols.some((col) => {
      const cell = cellAt(sheet, row, col);
      return hasValue(cell) || isBookingFill(cell?.fill ?? null);
    });
    if (occupied) rows.push({ row, kind: "orphan" });
  }
  return rows;
}
