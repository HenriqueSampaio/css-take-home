/**
 * Builds tiny `SheetMatrix` fixtures from A1-style descriptions, so each import
 * rule is tested on a handful of cells instead of the 400 KB workbook.
 */
import { makeISODate, weekdayIndex } from "../../domain/dates";
import { WEEKDAY_TOKENS } from "../blocks";
import { a1, cellKey, type FillKey, type SheetMatrix } from "../types";

export const BERTH_LABELS = [
  "North Pier West - 410'",
  "North Pier Face - 75'",
  "North Pier East - 240'",
  "Inner Channel - 55'",
  "South Float West - 90'",
  "South Float East - 90'",
];

export const GREEN: FillKey = "rgb:00B050";
export const RED: FillKey = "rgb:FF0000";
export const WHITE: FillKey = "theme:0:0.00";
export const GREY_BAND: FillKey = "theme:0:-0.15";
export const BANNER: FillKey = "theme:3:-0.25";

export function decode(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`bad ref ${ref}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]), col };
}

export const col = (letters: string): number => decode(`${letters}1`).col;

function decodeRange(range: string): { r1: number; c1: number; r2: number; c2: number } {
  const [tl, br = tl] = range.split(":");
  const a = decode(tl);
  const b = decode(br);
  return { r1: a.row, c1: a.col, r2: b.row, c2: b.col };
}

export class SheetBuilder {
  private readonly matrix: SheetMatrix;

  constructor(name: string) {
    this.matrix = { name, maxRow: 0, maxCol: 0, cells: {}, merges: [] };
  }

  set(ref: string, v: string | number | null, fill: FillKey | null = null): this {
    const { row, col: c } = decode(ref);
    this.matrix.cells[cellKey(row, c)] = { v, fill };
    if (v !== null) this.touch(row, c);
    return this;
  }

  formula(ref: string, formula: string): this {
    const { row, col: c } = decode(ref);
    this.matrix.cells[cellKey(row, c)] = { v: null, formula, fill: null };
    this.touch(row, c);
    return this;
  }

  /** Paints a range, keeping any values already there. */
  fill(range: string, key: FillKey): this {
    const { r1, c1, r2, c2 } = decodeRange(range);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const existing = this.matrix.cells[cellKey(r, c)];
        this.matrix.cells[cellKey(r, c)] = { ...(existing ?? { v: null }), fill: key };
      }
    }
    return this;
  }

  /** A merged range the way `readWorkbook` reports it: value and fill on the master only. */
  merge(range: string, label: string | null = null, fill: FillKey | null = null): this {
    const { r1, c1, r2, c2 } = decodeRange(range);
    const master = a1(r1, c1);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        this.matrix.cells[cellKey(r, c)] = r === r1 && c === c1 ? { v: label, fill } : { v: null, fill: null, slaveOf: master };
      }
    }
    if (label !== null) this.touch(r1, c1);
    this.matrix.merges.push({ r1, c1, r2, c2, ref: range });
    return this;
  }

  /** Day numbers starting at `firstRef`. `formulas` writes 1 then `SUM(prev+1)` like the 1997-2001 sheets. */
  days(firstRef: string, numbers: number[], formulas = false): this {
    const { row, col: c0 } = decode(firstRef);
    numbers.forEach((n, i) => {
      if (formulas && i > 0) this.formula(a1(row, c0 + i), `SUM(${a1(row, c0 + i - 1)}+1)`);
      else this.set(a1(row, c0 + i), n);
    });
    return this;
  }

  /** The real weekday letters for year-month, one per printed day. */
  weekdays(firstRef: string, year: number, month: number, numbers: number[]): this {
    const { row, col: c0 } = decode(firstRef);
    numbers.forEach((n, i) => this.set(a1(row, c0 + i), WEEKDAY_TOKENS[weekdayIndex(makeISODate(year, month, n))]));
    return this;
  }

  berths(firstRow: number, labels: string[] = BERTH_LABELS): this {
    labels.forEach((label, i) => this.set(a1(firstRow + i, 1), label));
    return this;
  }

  build(): SheetMatrix {
    return this.matrix;
  }

  private touch(row: number, c: number): void {
    this.matrix.maxRow = Math.max(this.matrix.maxRow, row);
    this.matrix.maxCol = Math.max(this.matrix.maxCol, c);
  }
}

export const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * One 2005-style month block (title + day numbers on `top`, weekdays below, six berth rows).
 * Returns the row of the first berth so tests can paint bookings.
 */
export function modernBlock(b: SheetBuilder, top: number, year: number, month: number, opts: { firstCol?: string; title?: string; days?: number[]; weekdayYear?: number } = {}): number {
  const first = opts.firstCol ?? "B";
  const numbers = opts.days ?? range(1, daysIn(year, month));
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, 1))).toUpperCase();
  b.set(`A${top}`, opts.title ?? `${monthName} ${year}`);
  b.days(`${first}${top}`, numbers);
  b.weekdays(`${first}${top + 1}`, opts.weekdayYear ?? year, month, numbers.filter((n) => n <= daysIn(opts.weekdayYear ?? year, month)));
  b.berths(top + 2);
  return top + 2;
}
