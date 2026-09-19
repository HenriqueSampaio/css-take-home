/**
 * Reader-agnostic shapes for the legacy import pipeline.
 *
 * Every stage after `read-workbook.ts` works on these plain objects, never on
 * ExcelJS types, so stages are unit-testable with tiny in-code fixtures and a
 * different reader (e.g. an openpyxl cell dump) can be swapped in.
 */

/** Normalised fill identity: `rgb:60497A` | `theme:0:-0.15` | `indexed:44`. */
export type FillKey = string;

export type CellRec = {
  /** Literal value. Formula cells carry their cached result here (null when uncached). */
  v: string | number | null;
  formula?: string;
  /** Solid pattern fills only; null for no fill. Merge slaves are always null. */
  fill: FillKey | null;
  /** Set on every non-master cell of a merged range: the master's A1 ref. */
  slaveOf?: string;
};

export type MergeRange = { r1: number; c1: number; r2: number; c2: number; ref: string };

export type SheetMatrix = {
  name: string;
  maxRow: number;
  maxCol: number;
  /** Sparse, keyed `"row,col"` (1-based). Only cells with a value, formula, fill, or merge membership. */
  cells: Record<string, CellRec>;
  merges: MergeRange[];
};

export const cellKey = (row: number, col: number): string => `${row},${col}`;

export function colLetter(col: number): string {
  let s = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

export const a1 = (row: number, col: number): string => `${colLetter(col)}${row}`;
