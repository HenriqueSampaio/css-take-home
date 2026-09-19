import { a1, cellKey, type CellRec, type SheetMatrix } from "./types";
import type { CellLabel, DisplacedCells } from "./model";

/** Cell lookups shared by every stage. `SheetMatrix.cells` is sparse, so a miss is simply an empty cell. */
export const cellAt = (sheet: SheetMatrix, row: number, col: number): CellRec | undefined => sheet.cells[cellKey(row, col)];

export const valueAt = (sheet: SheetMatrix, row: number, col: number): string | number | null => cellAt(sheet, row, col)?.v ?? null;

/** A day-number cell is either a literal integer or a `prev + 1` formula with no cached value. */
export const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export const hasValue = (cell: CellRec | undefined): boolean => cell !== undefined && (cell.v !== null || cell.formula !== undefined);

export type RowIndex = Map<number, number[]>;

/** Columns that hold any cell, per row, ascending. Built once per sheet because the matrix is keyed by string. */
export function indexRows(sheet: SheetMatrix): RowIndex {
  const index: RowIndex = new Map();
  for (const key of Object.keys(sheet.cells)) {
    const comma = key.indexOf(",");
    const row = Number(key.slice(0, comma));
    const col = Number(key.slice(comma + 1));
    const cols = index.get(row);
    if (cols) cols.push(col);
    else index.set(row, [col]);
  }
  for (const cols of index.values()) cols.sort((a, b) => a - b);
  return index;
}

export const lastUsedRow = (index: RowIndex): number => Math.max(0, ...index.keys());

export function labelAt(sheet: SheetMatrix, row: number, col: number): CellLabel | null {
  const v = valueAt(sheet, row, col);
  return v === null ? null : { sheet: sheet.name, row, col, ref: `${sheet.name}!${a1(row, col)}`, value: v };
}

export const rangeRef = (sheet: string, row: number, c1: number, c2: number): string =>
  c1 === c2 ? `${sheet}!${a1(row, c1)}` : `${sheet}!${a1(row, c1)}:${a1(row, c2)}`;

/** The sheet row that really holds column `col` of berth row `row` (see `DisplacedCells`). */
export const physicalRow = (row: number, col: number, displaced: DisplacedCells | null): number =>
  displaced && col >= displaced.c1 && col <= displaced.c2 ? displaced.fromRow : row;

/**
 * `rangeRef` for a berth row that is partly displaced: the ref cites each cell
 * where it physically sits, so a span across the seam names both rows
 * (`2010!B129:G129;2010!H130:R130`) and provenance stays checkable by eye.
 */
export function spanRef(sheet: string, row: number, c1: number, c2: number, displaced: DisplacedCells | null): string {
  if (!displaced || c2 < displaced.c1 || c1 > displaced.c2) return rangeRef(sheet, row, c1, c2);
  const parts: string[] = [];
  if (c1 < displaced.c1) parts.push(rangeRef(sheet, row, c1, displaced.c1 - 1));
  parts.push(rangeRef(sheet, displaced.fromRow, Math.max(c1, displaced.c1), Math.min(c2, displaced.c2)));
  if (c2 > displaced.c2) parts.push(rangeRef(sheet, row, displaced.c2 + 1, c2));
  return parts.join(";");
}
