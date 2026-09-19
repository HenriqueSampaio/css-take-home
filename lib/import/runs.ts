import { fillClass, isBandGrey, isBannerFill, isBookingFill } from "./fills";
import type { FillKey, MergeRange, SheetMatrix } from "./types";
import { cellAt, labelAt, physicalRow, rangeRef, spanRef } from "./grid";
import { classifyLabel, isOccupantLabel } from "./labels";
import type { CellLabel, DayColumn, DisplacedCells, EdgeBlob, RawRun } from "./model";

export type RowRuns = {
  runs: RawRun[];
  /** Merges with neither a booking fill nor a label: layout accidents, dropped and counted. */
  emptyMerges: MergeRange[];
  /** Merges that lie wholly left or right of the day columns (their label, if any, is in `outsideDayColumns`). */
  mergesOutside: MergeRange[];
  /** Values written left of day 1 or right of the last day, on a berth row. */
  outsideDayColumns: CellLabel[];
  /** Notes on a cell with no booking fill: an annotation with nothing to annotate. */
  standaloneNotes: CellLabel[];
  /** Bare numbers on a cell with no booking fill. */
  junkNumerics: CellLabel[];
  /** Booking-coloured cells outside the day columns (no date to give them). */
  bookingFillCellsOutside: number;
  /** Decorative fills inside the day columns that stayed decoration (no bar was read from them), per key. */
  structuralCells: Record<FillKey, number>;
  /** Every bare banner-colour blob at a month edge of this row, whether or not a run touches it. */
  edgeBlobs: EdgeBlob[];
};

export type RowContext = {
  /** True on a row that carries the full-month grey band (North Pier Face, 2009-2019): a name on that grey is a one-day entry, never a bar. */
  greyIsBand?: boolean;
  /** Set on the first berth row of a corrupted 2010 block: these columns are read one row up. */
  displaced?: DisplacedCells | null;
};

/**
 * Every bare banner blob in the workbook is 1-4 cells wide. A named bar in the
 * banner colour whose name sits within that distance of a month edge may
 * therefore be ending in one, and nothing on the sheet can tell.
 */
export const MAX_BLOB_CELLS = 4;

type Stretch = { c1: number; c2: number; fill: FillKey; labels: CellLabel[] };

const isNamed = (label: CellLabel): boolean => isOccupantLabel(classifyLabel(label.value));

/**
 * Turns one berth row into runs, over the block's day columns only, in a fixed order:
 *  1. MERGE-FIRST: a merged range whose master cell has a booking fill or a label is one run (clipped to the day columns).
 *  2. FILL-SECOND: maximal stretches of cells with the same booking fill that belong to no merge; a merge always ends a stretch.
 *  3. NAMED DECORATION: a stretch of one decorative colour with a vessel, event or closure written on it is a bar as well,
 *     because 2001-2008 paint real bars in the banner blue and the grey. The one exception is the grey Face band.
 *  4. LABEL-ONLY: a vessel, event or closure written on a cell with no colour of its own (blank paper, or the Face band) is a one-day run, flagged.
 * Bare decoration never forms a run. A bare banner blob at a month edge is remembered on the bar it touches,
 * because it may be painted over that bar's first or last days.
 */
export function extractRuns(sheet: SheetMatrix, row: number, columns: DayColumn[], ctx: RowContext = {}): RowRuns {
  const out: RowRuns = { runs: [], emptyMerges: [], mergesOutside: [], outsideDayColumns: [], standaloneNotes: [], junkNumerics: [], bookingFillCellsOutside: 0, structuralCells: {}, edgeBlobs: [] };
  if (columns.length === 0) return out;
  const first = columns[0].col;
  const last = columns[columns.length - 1].col;
  const displaced = ctx.displaced ?? null;

  const inMerge = new Set<number>();
  const keptMasters = new Set<number>();

  // 1. merges. Only the master row is considered: the workbook's single multi-row merge sits in area rows.
  for (const m of sheet.merges) {
    const overDisplaced = displaced !== null && m.c1 <= displaced.c2 && m.c2 >= displaced.c1 && ((m.r1 <= row && m.r2 >= row) || (m.r1 <= displaced.fromRow && m.r2 >= displaced.fromRow));
    // Neither corrupted block has one; a merge here would straddle two rows' worth of meaning, and a person should look.
    if (overDisplaced) throw new Error(`${sheet.name}!${m.ref}: a merged range touches the displaced day cells of a corrupted header; no import rule covers that`);
    if (m.r1 > row || m.r2 < row) continue;
    for (let c = m.c1; c <= m.c2; c++) inMerge.add(c);
    if (m.r1 !== row) continue;
    const master = cellAt(sheet, row, m.c1);
    const fill = isBookingFill(master?.fill ?? null) ? (master?.fill as FillKey) : null;
    const label = labelAt(sheet, row, m.c1);
    if (fill === null && label === null) {
      out.emptyMerges.push(m);
      continue;
    }
    const c1 = Math.max(m.c1, first);
    const c2 = Math.min(m.c2, last);
    if (c1 > c2) {
      out.mergesOutside.push(m);
      continue;
    }
    keptMasters.add(m.c1);
    out.runs.push({
      sheet: sheet.name, row, c1, c2, source: "merge", fill, decorativeFill: false,
      labels: label ? [label] : [],
      sourceRef: `${sheet.name}!${m.ref}`,
      displacedRef: null,
      mergePastEnd: m.c2 > last,
      mergeBeforeStart: m.c1 < first,
      labelUnfilled: false,
      edgeBlobs: [],
    });
  }

  /** A run over plain cells: its ref is derived from its extent, citing displaced cells where they physically sit. */
  const pushCells = (c1: number, c2: number, source: "fill" | "label_only", fill: FillKey | null, labels: CellLabel[], extra: Partial<RawRun> = {}) => {
    const overlap = displaced !== null && c1 <= displaced.c2 && c2 >= displaced.c1;
    out.runs.push({
      sheet: sheet.name, row, c1, c2, source, fill, decorativeFill: false, labels,
      sourceRef: spanRef(sheet.name, row, c1, c2, displaced),
      displacedRef: overlap ? rangeRef(sheet.name, displaced.fromRow, Math.max(c1, displaced.c1), Math.min(c2, displaced.c2)) : null,
      mergePastEnd: false, mergeBeforeStart: false, labelUnfilled: false, edgeBlobs: [],
      ...extra,
    });
  };

  /** A value on a cell that belongs to no bar: a name is a one-day stay, anything else is only reported. */
  const looseLabel = (label: CellLabel) => {
    const kind = classifyLabel(label.value);
    if (isOccupantLabel(kind)) pushCells(label.col, label.col, "label_only", null, [label], { labelUnfilled: true });
    else if (kind.kind === "note") out.standaloneNotes.push(label);
    else out.junkNumerics.push(label);
  };

  /** Cells between a banner-colour bar's name and the month edge, when they are few enough to be an edge blob. */
  const blobsInside = (s: Stretch): EdgeBlob[] => {
    if (!isBannerFill(s.fill)) return [];
    const named = s.labels.filter(isNamed).map((l) => l.col);
    const lead = Math.min(...named) - s.c1;
    const tail = s.c2 - Math.max(...named);
    const blobs: EdgeBlob[] = [];
    if (s.c1 === first && lead >= 1 && lead <= MAX_BLOB_CELLS) blobs.push({ side: "start", c1: s.c1, c2: s.c1 + lead - 1, sourceRef: spanRef(sheet.name, row, s.c1, s.c1 + lead - 1, displaced), inside: true });
    if (s.c2 === last && tail >= 1 && tail <= MAX_BLOB_CELLS) blobs.push({ side: "end", c1: s.c2 - tail + 1, c2: s.c2, sourceRef: spanRef(sheet.name, row, s.c2 - tail + 1, s.c2, displaced), inside: true });
    return blobs;
  };

  // 2. fill runs, 3. named decoration and 4. label-only cells, in one left-to-right pass
  let current: Stretch | null = null;
  const bareBlobs: Stretch[] = [];
  const close = () => {
    const s = current;
    current = null;
    if (!s) return;
    if (isBookingFill(s.fill)) {
      pushCells(s.c1, s.c2, "fill", s.fill, s.labels);
      return;
    }
    const named = s.labels.some(isNamed);
    // On the band row the grey is there all month whether or not anybody docked, so it says nothing about how long a named visitor stayed.
    if (named && !(ctx.greyIsBand === true && isBandGrey(s.fill))) {
      pushCells(s.c1, s.c2, "fill", s.fill, s.labels, { decorativeFill: true, edgeBlobs: blobsInside(s) });
      return;
    }
    out.structuralCells[s.fill] = (out.structuralCells[s.fill] ?? 0) + (s.c2 - s.c1 + 1);
    for (const label of s.labels) looseLabel(label);
    if (!named && isBannerFill(s.fill) && (s.c1 === first || s.c2 === last)) bareBlobs.push(s);
  };
  for (let col = first; col <= last; col++) {
    if (inMerge.has(col)) {
      close();
      continue;
    }
    const at = physicalRow(row, col, displaced);
    const fill = cellAt(sheet, at, col)?.fill ?? null;
    const label = labelAt(sheet, at, col);
    if (fill === null || fillClass(fill) === "background") {
      close();
      if (label) looseLabel(label);
      continue;
    }
    // A stretch is one colour: booking or decorative, a change of colour ends it.
    if (current && current.fill !== fill) close();
    if (!current) current = { c1: col, c2: col, fill, labels: [] };
    current.c2 = col;
    if (label) current.labels.push(label);
  }
  close();

  // A bare blob between a bar and the month edge may hide that bar's first or last days. A one-day label has no extent to hide.
  for (const b of bareBlobs) {
    const side = b.c1 === first ? "start" : "end";
    const blob: EdgeBlob = { side, c1: b.c1, c2: b.c2, sourceRef: spanRef(sheet.name, row, b.c1, b.c2, displaced), inside: false };
    out.edgeBlobs.push(blob);
    const touching = out.runs.find((r) => r.source !== "label_only" && (side === "start" ? r.c1 === b.c2 + 1 : r.c2 + 1 === b.c1));
    if (touching) touching.edgeBlobs.push(blob);
  }

  // Everything written outside the day columns (column A is the berth name and is not ours to report).
  const maxCol = Math.max(sheet.maxCol, last);
  for (let col = 2; col <= maxCol; col++) {
    if (col >= first && col <= last) continue;
    const cell = cellAt(sheet, row, col);
    if (!cell) continue;
    if (isBookingFill(cell.fill) && !keptMasters.has(col)) out.bookingFillCellsOutside++;
    const label = labelAt(sheet, row, col);
    if (label && !keptMasters.has(col)) out.outsideDayColumns.push(label);
  }

  out.runs.sort((a, b) => a.c1 - b.c1);
  return out;
}
