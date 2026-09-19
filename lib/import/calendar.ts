import { daysInMonth, isRealDate, makeISODate, weekdayIndex } from "../domain/dates";
import { a1, colLetter, type SheetMatrix } from "./types";
import { cellAt, isInt, valueAt } from "./grid";
import { WEEKDAY_TOKENS } from "./blocks";
import { monthKey, type Block, type BlockDefect, type DayColumn } from "./model";

/**
 * THE date rule: a column's date is the day number printed above it, checked
 * against the real calendar of the block's month. Position is never used, so
 * a header that skips a day (March 2011 prints 29 then 31) or stops early
 * (January 2012 ends at 30) still dates every column correctly, and a printed
 * number that is not a real day (June 31, Feb 29 2009) yields a column with no date.
 */
export function mapDayColumns(sheet: SheetMatrix, block: Block): DayColumn[] {
  const columns: DayColumn[] = [];
  const push = (col: number, printed: number, inferred: boolean) =>
    columns.push({ col, printed, inferred, date: isRealDate(block.year, block.month, printed) ? makeISODate(block.year, block.month, printed) : null });

  // Corrupted headers print 7..N only: days 1..6 are the six columns to the left of the 7.
  for (let day = 1; day < block.anchorDay; day++) push(block.firstDayCol + day - 1, day, true);

  let previous: number | null = null;
  for (let col = block.anchorCol; ; col++) {
    const cell = cellAt(sheet, block.dayRow, col);
    let printed: number;
    if (cell && cell.formula === undefined && isInt(cell.v)) printed = cell.v;
    else if (cell && cell.formula !== undefined && previous !== null) printed = previous + 1;
    else break;
    if (previous !== null && printed <= previous) {
      throw new Error(`${sheet.name}!${a1(block.dayRow, col)}: day numbers must increase (${printed} after ${previous})`);
    }
    push(col, printed, false);
    previous = printed;
  }
  return columns;
}

/** Header problems worth a line in the report: impossible dates, skipped days, months that stop short. */
export function calendarDefects(block: Block, columns: DayColumn[]): BlockDefect[] {
  const defects: BlockDefect[] = [];
  const base = { sheet: block.sheet, month: monthKey(block.year, block.month) };
  for (const c of columns) {
    if (c.date === null) {
      defects.push({ ...base, kind: "impossible_date", detail: `${colLetter(c.col)}${block.dayRow} prints day ${c.printed}, which does not exist in ${base.month}; the column carries no date.` });
    }
  }
  for (let i = 1; i < columns.length; i++) {
    if (columns[i].printed !== columns[i - 1].printed + 1) {
      defects.push({ ...base, kind: "skipped_day", detail: `Day numbers jump from ${columns[i - 1].printed} to ${columns[i].printed} at ${colLetter(columns[i].col)}${block.dayRow}; the printed numbers are trusted.` });
    }
  }
  const lastPrinted = columns.length ? columns[columns.length - 1].printed : 0;
  const expected = daysInMonth(block.year, block.month);
  if (lastPrinted < expected) {
    defects.push({ ...base, kind: "missing_days", detail: `The header stops at day ${lastPrinted} of ${expected}; later days have no column.` });
  }
  return defects;
}

export type WeekdayCheck = { checked: number; mismatches: number; ok: boolean };

/**
 * The weekday letters are a free checksum on the month we think a block is.
 * Empty cells are skipped (several rows have gaps) and an `S` matches both
 * Saturday and Sunday. `asYear` lets the caller ask "which December is this
 * really?", which is how the carry-over copies are proven to be copies.
 */
export function validateWeekdays(sheet: SheetMatrix, block: Block, columns: DayColumn[], asYear: number = block.year): WeekdayCheck {
  let checked = 0;
  let mismatches = 0;
  for (const c of columns) {
    if (!isRealDate(asYear, block.month, c.printed)) continue;
    const v = valueAt(sheet, block.weekdayRow, c.col);
    if (typeof v !== "string") continue;
    const token = v.trim().toUpperCase();
    if (!WEEKDAY_TOKENS.includes(token)) continue;
    checked++;
    if (WEEKDAY_TOKENS[weekdayIndex(makeISODate(asYear, block.month, c.printed))] !== token) mismatches++;
  }
  return { checked, mismatches, ok: checked > 0 && mismatches === 0 };
}
