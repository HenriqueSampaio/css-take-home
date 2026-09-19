/**
 * Shapes passed between the import stages. Each stage takes plain data and
 * returns plain data (no ExcelJS, no filesystem), so every rule can be tested
 * on a ten-cell fixture and explained in one sentence on the About page.
 */
import type { ISODate } from "../domain/dates";
import type { BerthId } from "../seed/contract";
import type { FillKey } from "./types";

export type BlockRole = "primary" | "carry_over";

/** Something wrong with a month block itself (not with one booking). Report-only. */
export type BlockDefect = {
  sheet: string;
  /** `YYYY-MM` the block was imported as. */
  month: string;
  kind: "title_year_mismatch" | "displaced_header" | "displaced_berth_cells" | "weekday_row_missing" | "impossible_date" | "skipped_day" | "missing_days" | "weekday_mismatch";
  detail: string;
};

export type Block = {
  sheet: string;
  /** Position among the sheet's blocks, top to bottom. */
  index: number;
  role: BlockRole;
  year: number;
  month: number;
  title: string;
  titleRow: number;
  weekdayRow: number;
  dayRow: number;
  /** Every row that belongs to the header (title, weekdays, day numbers, displaced day numbers). */
  headerRows: number[];
  firstRow: number;
  lastRow: number;
  /** Column of the first printed day number, and the day printed there (1, or 7 in the two corrupted blocks). */
  anchorCol: number;
  anchorDay: number;
  /** Column that stands for day 1 (= anchorCol - (anchorDay - 1)). */
  firstDayCol: number;
  /** Set for the two corrupted 2010 blocks: where the first berth row's cells for the implied days really sit. */
  displacedCells: DisplacedCells | null;
  defects: BlockDefect[];
};

/**
 * The 2010 header corruption moved the columns of days 1..k-1 up ONE row as a
 * unit: the day numbers left the day row, the weekday stand-ins landed in the
 * day row, and the first berth row's cells landed in the weekday row (`fromRow`).
 * For columns `c1..c2` that berth row is therefore read from `fromRow`.
 */
export type DisplacedCells = { fromRow: number; c1: number; c2: number };

export type DayColumn = {
  col: number;
  /** The number printed above the column (a formula cell means previous + 1). */
  printed: number;
  /** Null when the printed number is not a real day of the block's month (June 31, Feb 29 2009). */
  date: ISODate | null;
  /** True for days 1..6 of the two corrupted blocks, which are implied by the printed 7..N. */
  inferred: boolean;
};

export type BerthInfo = { id: BerthId; name: string; lengthFt: number; sortOrder: number };

export type BlockRow =
  | { row: number; kind: "berth"; berth: BerthInfo; /** 0 for the first row of this berth in the block, 1 for a duplicate row... */ ordinal: number }
  | { row: number; kind: "area"; name: string }
  | { row: number; kind: "orphan" };

/** A valued cell, kept with its address so nothing loses its provenance. */
export type CellLabel = { sheet: string; row: number; col: number; ref: string; value: string | number };

export type RunSource = "merge" | "fill" | "label_only";

/**
 * Banner-colour cells at a month edge that cannot be told from decoration.
 * `inside: false`: a bare blob that butts against the run; it was left out of
 * the run, but may be painted over the stay's first or last days.
 * `inside: true`: the run itself is a named bar in the banner colour, and these
 * are its cells between the name and the month edge; they were kept.
 */
export type EdgeBlob = { side: "start" | "end"; c1: number; c2: number; sourceRef: string; inside: boolean };

export type RawRun = {
  sheet: string;
  /** The berth row. Cells of a displaced stretch physically sit one row up; `sourceRef` says where. */
  row: number;
  /** Extent inside the day columns (merges are clipped to them). */
  c1: number;
  c2: number;
  source: RunSource;
  /** The bar's colour, or null for a labelled run without one. */
  fill: FillKey | null;
  /** True when `fill` is a decorative colour (banner blue, grey) that counts as a booking here only because a name is written on it. */
  decorativeFill: boolean;
  /** Every non-null value in the run, left to right. For a merge this is the master cell, even when it sits left of day 1. */
  labels: CellLabel[];
  /** The source cells exactly as they sit in the workbook (a merge keeps its own ref; a run over displaced cells cites both rows, `;`-separated). */
  sourceRef: string;
  /** The displaced cells this run was (partly) read from, or null. */
  displacedRef: string | null;
  mergePastEnd: boolean;
  mergeBeforeStart: boolean;
  labelUnfilled: boolean;
  edgeBlobs: EdgeBlob[];
};

export type Occupant =
  | { kind: "vessel"; key: string; nameKey: string; prefix: string; name: string }
  | { kind: "event" | "closure"; key: string; title: string; unknown: boolean };

/** One booking-shaped piece inside one month block, before cross-month stitching. */
export type Segment = {
  sheet: string;
  blockIndex: number;
  year: number;
  month: number;
  row: number;
  berthId: BerthId;
  /** Which physical row of the berth this came from (duplicate berth rows). */
  rowOrdinal: number;
  c1: number;
  c2: number;
  sourceRef: string;
  /** The whole bar this piece was cut from (differs from `sourceRef` only for a split shared bar). */
  runRef: string;
  source: RunSource;
  fill: FillKey | null;
  occupant: Occupant | null;
  rawLabel: string | null;
  notes: string[];
  startDate: ISODate;
  endDate: ISODate;
  touchesStart: boolean;
  touchesEnd: boolean;
  flags: SegmentFlags;
  /** Cells consumed by this segment, for the reconciliation ledger. */
  labelCells: CellLabel[];
  noteCells: CellLabel[];
};

export type SegmentFlags = {
  sharedBar: boolean;
  labelUnfilled: boolean;
  unknownLabel: boolean;
  mergePastEnd: boolean;
  mergeBeforeStart: boolean;
  /** The run covers a column with no real date (`impossible_date`), or sits in a block whose header is corrupted (`corrupt_header`). */
  calendarDefect: { reason: "impossible_date" | "corrupt_header"; detail: string } | null;
  labelOffFirstCell: boolean;
  repeatedLabel: boolean;
  /** Edge blobs on this piece's own month edge, with the real dates they cover. */
  edgeBlobs: DatedEdgeBlob[];
};

export type DatedEdgeBlob = EdgeBlob & { startDate: ISODate; endDate: ISODate };

/** Segments that stitching decided are one stay, in chronological order. */
export type Stay = { segments: Segment[] };

export const monthKey = (year: number, month: number): string => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
