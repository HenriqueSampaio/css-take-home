import { a1, colLetter, type SheetMatrix } from "./types";
import { cellAt, indexRows, isInt, lastUsedRow, valueAt } from "./grid";
import { monthKey, type Block, type BlockDefect, type DisplacedCells } from "./model";

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const TITLE_RE = new RegExp(`^(${MONTHS.join("|")})(?:\\s+(\\d{4}))?$`, "i");

/** The day-number row may start anywhere from B to L (the first day column drifts per block in 2010-2019). */
const ANCHOR_FIRST_COL = 2;
const ANCHOR_LAST_COL = 12;
/** One anchor cell plus 19 followers: long enough that no berth row of stray numbers can pass for a header. */
const MIN_DAY_RUN = 20;

export const WEEKDAY_TOKENS: readonly string[] = ["M", "T", "W", "TR", "F", "S", "S"];
const WEEKDAY_SET = new Set(WEEKDAY_TOKENS);

export const isYearSheet = (name: string): boolean => /^\d{4}$/.test(name);

/** `SUM(B3+1)`: the 1997-2001 sheets number their days with uncached formulas. */
const isPlusOneFormula = (formula: string | undefined): boolean => formula !== undefined && /\+\s*1\s*\)?\s*$/.test(formula);

type Anchor = { row: number; col: number; day: number };

/**
 * A row is a day header when some cell in B..L starts a run of at least 20
 * consecutive day numbers (each the previous + 1, literal or formula). Pitch,
 * banner rows and first-day column all vary, so nothing else is assumed.
 * The run normally starts at 1; the two corrupted 2010 blocks only print 7..N.
 */
function findAnchor(sheet: SheetMatrix, row: number): Anchor | null {
  for (let col = ANCHOR_FIRST_COL; col <= ANCHOR_LAST_COL; col++) {
    const start = cellAt(sheet, row, col);
    if (!start || start.formula !== undefined || !isInt(start.v)) continue;
    let last = start.v;
    let length = 1;
    for (let c = col + 1; ; c++) {
      const next = cellAt(sheet, row, c);
      if (next && next.formula === undefined && next.v === last + 1) last += 1;
      else if (next && isPlusOneFormula(next.formula)) last += 1;
      else break;
      length++;
    }
    if (length < MIN_DAY_RUN) continue;
    // A displaced header still has to leave room for days 1..k-1 to the right of column A.
    if (start.v === 1 || (start.v > 1 && col - (start.v - 1) >= 2)) return { row, col, day: start.v };
  }
  return null;
}

/** True when `row` holds the literal run 1, 2, ..., k-1 somewhere near the anchor. */
function hasDisplacedDays(sheet: SheetMatrix, row: number, anchor: Anchor): boolean {
  if (row < 1) return false;
  for (let col = ANCHOR_FIRST_COL; col <= anchor.col; col++) {
    let day = 1;
    while (day < anchor.day && valueAt(sheet, row, col + day - 1) === day) day++;
    if (day === anchor.day) return true;
  }
  return false;
}

function weekdayTokenCount(sheet: SheetMatrix, row: number): number {
  if (row < 1) return 0;
  let n = 0;
  for (let col = ANCHOR_FIRST_COL; col <= ANCHOR_LAST_COL + 31; col++) {
    const v = valueAt(sheet, row, col);
    if (typeof v === "string" && WEEKDAY_SET.has(v.trim().toUpperCase())) n++;
  }
  return n;
}

function parseTitle(sheet: SheetMatrix, row: number): { month: number; year: number | null; text: string } | null {
  if (row < 1) return null;
  const v = valueAt(sheet, row, 1);
  if (typeof v !== "string") return null;
  const m = TITLE_RE.exec(v.trim().replace(/\s+/g, " "));
  if (!m) return null;
  return { month: MONTHS.indexOf(m[1].toUpperCase()) + 1, year: m[2] ? Number(m[2]) : null, text: v.trim() };
}

/**
 * Finds every month block in a year sheet and decides what month it IS.
 * The year always comes from the sheet name: a title that disagrees is a defect
 * to report, never a reason to move data (the 2010 sheet titles two blocks "2018").
 * A leading December followed by January is a carry-over copy of the previous year.
 */
export function detectBlocks(sheet: SheetMatrix): Block[] {
  if (!isYearSheet(sheet.name)) throw new Error(`detectBlocks: "${sheet.name}" is not a year sheet`);
  const sheetYear = Number(sheet.name);
  const lastRow = lastUsedRow(indexRows(sheet));

  const blocks: Block[] = [];
  for (let row = 1; row <= sheet.maxRow; row++) {
    const anchor = findAnchor(sheet, row);
    if (!anchor) continue;

    const title = parseTitle(sheet, row) ?? parseTitle(sheet, row - 1) ?? parseTitle(sheet, row - 2);
    if (!title) throw new Error(`${sheet.name}!${a1(row, anchor.col)}: day-number row without a month title in column A of this or the two rows above`);
    const titleRow = parseTitle(sheet, row) ? row : parseTitle(sheet, row - 1) ? row - 1 : row - 2;

    const defects: BlockDefect[] = [];
    const month = monthKey(sheetYear, title.month);

    // 1997-2004 print weekdays ABOVE the day numbers, 2005-2019 BELOW. When neither row
    // holds weekday tokens the header is corrupted; its weekday row is where the layout says it should be.
    let weekdayRow: number;
    if (weekdayTokenCount(sheet, row - 1) >= MIN_DAY_RUN) weekdayRow = row - 1;
    else if (weekdayTokenCount(sheet, row + 1) >= MIN_DAY_RUN) weekdayRow = row + 1;
    else {
      weekdayRow = titleRow === row ? row + 1 : row - 1;
      defects.push({ sheet: sheet.name, month, kind: "weekday_row_missing", detail: `Row ${weekdayRow} should hold the weekday letters but does not; its contents are quarantined, not imported.` });
    }

    const headerRows = new Set([titleRow, weekdayRow, row]);
    const firstDayCol = anchor.col - (anchor.day - 1);
    let displacedCells: DisplacedCells | null = null;
    if (anchor.day > 1) {
      // In the real workbook the missing 1..k-1 sit one row up (and a column off); claim that row for the header too.
      if (hasDisplacedDays(sheet, row - 1, anchor)) {
        headerRows.add(row - 1);
        // The numbers prove the day 1..k-1 columns slid up one row. In this layout the weekday row is the last header
        // row, so what now sits in it under those columns came from the row below: the first berth row.
        if (weekdayRow === row + 1) displacedCells = { fromRow: weekdayRow, c1: firstDayCol, c2: anchor.col - 1 };
      }
      defects.push({
        sheet: sheet.name,
        month,
        kind: "displaced_header",
        detail: `Day numbers start at ${anchor.day} in ${colLetter(anchor.col)}${row}; days 1-${anchor.day - 1} are implied, so day 1 is column ${colLetter(firstDayCol)}.`,
      });
    }

    const rows = [...headerRows].sort((a, b) => a - b);
    blocks.push({
      sheet: sheet.name,
      index: blocks.length,
      role: "primary",
      year: sheetYear,
      month: title.month,
      title: title.text,
      titleRow,
      weekdayRow,
      dayRow: row,
      headerRows: rows,
      firstRow: rows[0],
      lastRow,
      anchorCol: anchor.col,
      anchorDay: anchor.day,
      firstDayCol,
      displacedCells,
      defects,
    });
  }

  for (let i = 0; i + 1 < blocks.length; i++) blocks[i].lastRow = blocks[i + 1].firstRow - 1;

  if (blocks.length > 1 && blocks[0].month === 12 && blocks[1].month === 1) {
    blocks[0].role = "carry_over";
    blocks[0].year = sheetYear - 1;
  }

  for (const block of blocks) {
    const titleYear = parseTitle(sheet, block.titleRow)?.year ?? null;
    for (const d of block.defects) d.month = monthKey(block.year, block.month);
    if (titleYear !== null && titleYear !== block.year) {
      block.defects.push({
        sheet: sheet.name,
        month: monthKey(block.year, block.month),
        kind: "title_year_mismatch",
        detail: `Title ${sheet.name}!A${block.titleRow} reads "${block.title}" but the block sits in sheet ${sheet.name}; the sheet name wins.`,
      });
    }
  }

  const primary = blocks.filter((b) => b.role === "primary");
  for (let i = 1; i < primary.length; i++) {
    if (primary[i].month !== primary[i - 1].month + 1) {
      throw new Error(`Sheet ${sheet.name}: months are not contiguous (${primary[i - 1].title} is followed by ${primary[i].title})`);
    }
  }
  return blocks;
}
