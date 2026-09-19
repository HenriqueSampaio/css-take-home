/**
 * The shape of `data/seed/import-report.json`. TYPES ONLY, with no imports
 * that reach ExcelJS or node built-ins: the Next.js About page imports this
 * file to render the numbers, and must not drag the importer into the bundle.
 */

/** A cell that was read but deliberately not imported, with where it sits and what it says. */
export type ReportCell = { ref: string; value: string };

export type ReportBlockDefect = { sheet: string; month: string; kind: string; detail: string };

export type CarryOverReport = {
  sheet: string;
  /** The month the block claims to be, e.g. `2001-12`. */
  claims: string;
  titleCell: string;
  /** Why we believe it is a copy: its weekday letters do not fit the month it claims. */
  weekdayMatchesClaimedMonth: boolean;
  weekdayMatchesSheetYearDecember: boolean;
  segmentsFound: number;
  labelCells: number;
  /** The real December it was checked against, e.g. `2001 sheet, DECEMBER 2001`. */
  comparedWith: string;
  identicalSegments: number;
  onlyInCarryOver: string[];
  onlyInAuthoritative: string[];
};

export type ImportReport = {
  schemaVersion: 1;
  source: { file: string; sha256: string };
  sheets: {
    yearSheets: string[];
    registrySheets: string[];
    ignored: { name: string; reason: string }[];
  };
  blocks: {
    total: number;
    primary: number;
    carryOver: number;
    /** Primary blocks whose weekday letters all agree with the real calendar. */
    weekdayValidated: number;
    /** Blocks with no weekday letters to check (the two corrupted 2010 headers). */
    weekdayUnverifiable: string[];
    defects: ReportBlockDefect[];
  };
  runs: {
    total: number;
    /** Every merged range in the year sheets = merges + emptyMergesDropped + mergesOutsideDayColumns + mergesOffBerthRows. */
    mergesInYearSheets: number;
    /** Merges on area rows, orphan rows, header rows and carry-over blocks: never imported. */
    mergesOffBerthRows: number;
    merges: number;
    emptyMergesDropped: number;
    mergesOutsideDayColumns: number;
    mergesPastMonthEnd: number;
    mergesBeforeMonthStart: number;
    fillRuns: number;
    /** Of `fillRuns`: named stretches of a decorative colour (banner blue, or grey off the Face band), read as bars because 2001-2008 paint real bars that way. */
    decorativeColourBars: number;
    labelOnly: number;
    labelOffFirstCell: number;
    repeatedLabelRuns: number;
    sharedBarRuns: number;
    /** Runs that sit wholly under an impossible date and so have no day to live on. */
    undatedRunsDropped: number;
    bookingFillCellsOutsideDayColumns: number;
    /**
     * Bare banner-colour blobs at a month edge of a berth row: decoration, never occupancy. The ones `touchingBar` sit
     * between a bar and the month edge and may be painted over its first or last days; each raises a `decorative_overpaint` warning.
     */
    edgeBlobs: { count: number; cells: number; touchingBar: number; cellsTouchingBar: number };
  };
  stitching: {
    segments: number;
    stays: number;
    joins: number;
    crossSheet: number;
    sameRowJoins: number;
    notJoinedDifferentLabels: number;
    notJoinedBothUnlabelled: number;
    notJoinedDifferentFill: number;
    /** Pairs of stays that would have joined across a month boundary but for a bare edge blob between them. Still two stays; the blob's warning names the other one. */
    apartByEdgeBlob: number;
    longestChain: { segments: number; sourceRef: string } | null;
  };
  imported: {
    berths: number;
    vessels: { fromGrid: number; registryOnly: number };
    reservations: {
      total: number;
      confirmed: number;
      needsReview: number;
      byKind: Record<string, number>;
      byBerth: Record<string, number>;
      byYear: Record<string, number>;
    };
    dateRange: { first: string; last: string };
    /** `YYYY-MM` with the most reservation-days (a stay that spans months counts in each). */
    busiestMonth: string;
    busiestMonthReservationDays: number;
  };
  issues: {
    total: number;
    byType: Record<string, number>;
    /** Keyed `type/reason`. */
    byReason: Record<string, number>;
    overlapPairs: number;
  };
  vesselLinking: {
    registryEntries: number;
    registryColumnAIgnored: number;
    verified: number;
    probable: number;
    conflict: number;
    unknown: number;
    /** Share of vessel reservations whose vessel has a usable (verified or probable) length. */
    bookingCoveragePct: number;
    registryConflicts: { vessel: string; origin: string; candidates: number[]; evidence: string }[];
    topUnlinked: { name: string; bookings: number }[];
  };
  /** Computed at import time for the About page; the app recomputes fit live and stores none of this. */
  fit: {
    resolvableReservations: number;
    unknownLengthReservations: number;
    violations: number;
    top: { vessel: string; vesselFt: number; berth: string; berthFt: number; count: number }[];
  };
  notImported: {
    /** Rows whose column A names an area, not a berth with a length. `bookingFillCells` are the coloured cells left behind with them. */
    areas: { rows: number; names: Record<string, number>; bookingFillCells: number; entries: ReportCell[] };
    /** Rows inside a block with nothing in column A but something written or coloured on them. */
    orphanRows: { rows: number; bookingFillCells: number; entries: ReportCell[] };
    corruptHeaderLabels: { count: number; entries: ReportCell[] };
    outsideDayColumns: { count: number; entries: ReportCell[] };
    standaloneNotes: { count: number; entries: ReportCell[] };
    junkNumerics: { count: number; entries: ReportCell[] };
    undatedColumnLabels: { count: number; entries: ReportCell[] };
    carryOver: CarryOverReport[];
  };
  /**
   * Decorative fills inside the day columns of berth rows that stayed decoration (bare, or the grey Face band), per
   * fill key. Never bookings, never closures. Named stretches that were read as bars (`runs.decorativeColourBars`) are not in here.
   */
  structuralFills: Record<string, number>;
  /**
   * "Never drop data without counting it", made executable: every cell with a
   * value in the year sheets lands in exactly one bucket. The CLI exits non-zero
   * when `balanced` is false.
   */
  reconciliation: {
    labelCells: number;
    imported: number;
    asNotes: number;
    notImported: number;
    notImportedByReason: Record<string, number>;
    unaccounted: string[];
    doubleCounted: string[];
    balanced: boolean;
  };
  /** How often each vocabulary entry and vessel prefix occurs among the non-header cells of the year sheets. */
  vocab: {
    closures: Record<string, number>;
    events: Record<string, number>;
    notes: Record<string, number>;
    vesselPrefixes: Record<string, number>;
    unknownLabels: Record<string, number>;
  };
};
