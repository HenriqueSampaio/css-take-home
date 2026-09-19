import type { Seed } from "../seed/contract";
import { a1, type SheetMatrix } from "./types";
import { cellAt, hasValue, indexRows, isInt, rangeRef, type RowIndex } from "./grid";
import { detectBlocks, isYearSheet, WEEKDAY_TOKENS } from "./blocks";
import { calendarDefects, mapDayColumns, validateWeekdays } from "./calendar";
import { isBandGrey, isBookingFill } from "./fills";
import { classifyRows } from "./rows";
import { extractRuns, type RowContext } from "./runs";
import { classifyLabel } from "./labels";
import { resolveRun } from "./segments";
import { stitchSegments } from "./stitch";
import { compareCarryOver } from "./carryover";
import { linkVessels, parseRegistry, REGISTRY_SHEETS, type GridVessel } from "./registry";
import { buildReport, bump, sortedCounts, toSeed } from "./emit";
import { monthKey, type Block, type BlockDefect, type BlockRow, type CellLabel, type DayColumn, type DisplacedCells, type Segment } from "./model";
import type { CarryOverReport, ImportReport, ReportCell } from "./report";

export type ImportSource = { file: string; sha256: string };
export type ImportResult = { seed: Seed; report: ImportReport };

const IGNORED_SHEET_REASONS: Record<string, string> = {
  Tours: "A list of dock tours (visitors, not vessels at a berth); nothing in it is a reservation.",
  "8YR Dock Summary": "Hand-made yearly totals derived from the grids; importing it would double count.",
};

/** Where every valued cell of the year sheets ended up. One cell, one bucket. */
type Bucket =
  | "imported" | "asNote"
  | "gridFurniture" | "areaRow" | "orphanRow" | "outsideDayColumns" | "carryOverBlock"
  | "corruptHeaderRow" | "standaloneNote" | "junkNumeric" | "undatedColumn";

class Ledger {
  private readonly seen = new Map<string, Bucket>();
  readonly doubleCounted: string[] = [];
  readonly counts: Record<string, number> = {};

  put(ref: string, bucket: Bucket): void {
    if (this.seen.has(ref)) {
      this.doubleCounted.push(ref);
      return;
    }
    this.seen.set(ref, bucket);
    bump(this.counts, bucket);
  }
  has = (ref: string): boolean => this.seen.has(ref);
}

const toReportCell = (c: CellLabel): ReportCell => ({ ref: c.ref, value: String(c.value) });

function valuedCells(sheet: SheetMatrix, index: RowIndex, row: number, fromCol = 1): CellLabel[] {
  const out: CellLabel[] = [];
  for (const col of index.get(row) ?? []) {
    if (col < fromCol) continue;
    const cell = cellAt(sheet, row, col);
    if (!hasValue(cell)) continue;
    out.push({ sheet: sheet.name, row, col, ref: `${sheet.name}!${a1(row, col)}`, value: cell?.v ?? `=${cell?.formula}` });
  }
  return out;
}

/**
 * The whole import as one pure function: sheets in, seed + report out.
 * Order of work: find blocks -> date their columns -> classify rows -> runs ->
 * segments -> stitch touching bars -> link vessels -> audit overlaps -> emit.
 * Along the way every valued cell of the year sheets is entered in a ledger,
 * so the report can prove nothing was dropped without being counted.
 */
export function runImport(sheets: readonly SheetMatrix[], source: ImportSource = { file: "", sha256: "" }): ImportResult {
  const yearSheets = sheets.filter((s) => isYearSheet(s.name)).sort((a, b) => Number(a.name) - Number(b.name));
  if (yearSheets.length === 0) throw new Error("No year sheets (named like 1997) found in the workbook");

  const ledger = new Ledger();
  const defects: BlockDefect[] = [];
  const segments: Segment[] = [];
  const carryOverWork: { block: Block; segments: Segment[]; evidence: Parameters<typeof compareCarryOver>[3] }[] = [];
  const gridForms = new Map<string, Map<string, number>>();
  const structuralFills: Record<string, number> = {};
  const vocab = { closures: {} as Record<string, number>, events: {} as Record<string, number>, notes: {} as Record<string, number>, vesselPrefixes: {} as Record<string, number>, unknownLabels: {} as Record<string, number> };

  const blocksSeen = { total: 0, primary: 0, carryOver: 0, weekdayValidated: 0, weekdayUnverifiable: [] as string[] };
  const runs = { total: 0, mergesInYearSheets: 0, mergesOffBerthRows: 0, merges: 0, emptyMergesDropped: 0, mergesOutsideDayColumns: 0, mergesPastMonthEnd: 0, mergesBeforeMonthStart: 0, fillRuns: 0, decorativeColourBars: 0, labelOnly: 0, labelOffFirstCell: 0, repeatedLabelRuns: 0, sharedBarRuns: 0, undatedRunsDropped: 0, bookingFillCellsOutsideDayColumns: 0, edgeBlobs: { count: 0, cells: 0, touchingBar: 0, cellsTouchingBar: 0 } };
  const areas = { rows: 0, names: {} as Record<string, number>, bookingFillCells: 0, entries: [] as ReportCell[] };
  const orphanRows = { rows: 0, bookingFillCells: 0, entries: [] as ReportCell[] };
  const corruptHeader: ReportCell[] = [];
  const outside: ReportCell[] = [];
  const standaloneNotes: ReportCell[] = [];
  const junkNumerics: ReportCell[] = [];
  const undatedLabels: ReportCell[] = [];

  for (const [i, sheet] of yearSheets.entries()) {
    const index = indexRows(sheet);
    const blocks = detectBlocks(sheet);
    const primary = blocks.filter((b) => b.role === "primary");
    if (primary.length === 0) throw new Error(`Sheet ${sheet.name}: no month blocks found`);
    // Years must chain: only the first sheet may start mid-year (1997 begins in August) and only the last may stop early.
    if (i > 0 && primary[0].month !== 1) throw new Error(`Sheet ${sheet.name}: first month is ${primary[0].title}, expected January`);
    if (i + 1 < yearSheets.length && primary[primary.length - 1].month !== 12) throw new Error(`Sheet ${sheet.name}: last month is ${primary[primary.length - 1].title}, expected December`);

    const berthRowsSeen = new Set<number>();
    const layout = blocks.map((block) => ({ block, columns: mapDayColumns(sheet, block), rows: classifyRows(sheet, block, index) }));
    const faceBand = paintsFaceBand(sheet, layout);

    // Banner rows above the first block: institution name, sheet title, contact line.
    for (let row = 1; row < blocks[0].firstRow; row++) for (const c of valuedCells(sheet, index, row)) ledger.put(c.ref, "gridFurniture");

    for (const { block, columns, rows } of layout) {
      const isCarryOver = block.role === "carry_over";
      blocksSeen.total++;
      if (isCarryOver) blocksSeen.carryOver++;
      else blocksSeen.primary++;

      const weekdays = validateWeekdays(sheet, block, columns);
      const blockDefects = [...block.defects, ...calendarDefects(block, columns)];
      if (!isCarryOver) {
        if (weekdays.ok) blocksSeen.weekdayValidated++;
        else if (weekdays.checked === 0) blocksSeen.weekdayUnverifiable.push(`${sheet.name} ${monthKey(block.year, block.month)}`);
        else blockDefects.push({ sheet: sheet.name, month: monthKey(block.year, block.month), kind: "weekday_mismatch", detail: `${weekdays.mismatches} of ${weekdays.checked} weekday letters disagree with the real calendar.` });
      }

      // The corrupted 2010 headers: the first berth row's cells for the implied days sit in the weekday row above it.
      const displaced = block.displacedCells;
      const displacedRow = displaced ? rows.find((r) => r.kind === "berth" && r.row === displaced.fromRow + 1) : undefined;
      if (displaced && displacedRow?.kind === "berth") {
        blockDefects.push({
          sheet: sheet.name,
          month: monthKey(block.year, block.month),
          kind: "displaced_berth_cells",
          detail: `The shift that displaced days 1-${block.anchorDay - 1} of the header also pushed the first berth row's cells for those days (${displacedRow.berth.name}, row ${displacedRow.row}) up into ${rangeRef(sheet.name, displaced.fromRow, displaced.c1, displaced.c2)}; they are imported from there, and what the berth row itself holds under those days (${rangeRef(sheet.name, displacedRow.row, displaced.c1, displaced.c2)}, a filler) is not read.`,
        });
      }
      defects.push(...blockDefects);

      accountHeader(sheet, index, block, columns, ledger, isCarryOver ? null : corruptHeader, displacedRow ? displaced : null);

      const corrupt = block.defects.find((d) => d.kind === "displaced_header" || d.kind === "weekday_row_missing");
      const corruptHeaderDetail = corrupt
        ? `This stay comes from the ${block.title} block of sheet ${sheet.name}, whose header rows are corrupted (day numbers displaced, vessel names where the weekdays belong); its dates are anchored on the printed 7..N and need a human check.`
        : null;

      const blockSegments: Segment[] = [];
      let carryOverLabelCells = 0;
      for (const r of rows) {
        const moved = r === displacedRow && displaced ? displaced : null;
        const context: RowContext = { greyIsBand: faceBand && r.kind === "berth" && r.berth.id === FACE_BERTH, displaced: moved };
        // Displaced cells are this row's cells in all but position, so they count with it. What the berth row itself
        // holds under those columns (a grey filler in the real workbook) is never read; anything written there is quarantined.
        const under = (row: number): CellLabel[] => (moved ? valuedCells(sheet, index, row, moved.c1).filter((c) => c.col <= moved.c2) : []);
        const hidden = under(r.row);
        const cells = [...(moved ? under(moved.fromRow) : []), ...valuedCells(sheet, index, r.row, 2).filter((c) => !hidden.some((h) => h.ref === c.ref))];
        const nameCell = valuedCells(sheet, index, r.row).find((c) => c.col === 1);
        if (nameCell) ledger.put(nameCell.ref, "gridFurniture");

        if (isCarryOver) {
          carryOverLabelCells += cells.length;
          for (const c of [...cells, ...hidden]) ledger.put(c.ref, "carryOverBlock");
          if (r.kind !== "berth") continue;
          for (const run of extractRuns(sheet, r.row, columns, context).runs) {
            blockSegments.push(...resolveRun(run, { block, columns, berth: r.berth, rowOrdinal: r.ordinal, corruptHeader: null }).segments);
          }
          continue;
        }

        for (const c of cells) countVocab(vocab, c);

        if (r.kind === "area") {
          areas.rows++;
          areas.bookingFillCells += bookingFillCells(sheet, index, r.row);
          bump(areas.names, r.name);
          for (const c of cells) {
            ledger.put(c.ref, "areaRow");
            areas.entries.push(toReportCell(c));
          }
          continue;
        }
        if (r.kind === "orphan") {
          orphanRows.rows++;
          orphanRows.bookingFillCells += bookingFillCells(sheet, index, r.row);
          for (const c of cells) {
            ledger.put(c.ref, "orphanRow");
            orphanRows.entries.push(toReportCell(c));
          }
          continue;
        }

        const found = extractRuns(sheet, r.row, columns, context);
        berthRowsSeen.add(r.row);
        runs.emptyMergesDropped += found.emptyMerges.length;
        runs.mergesOutsideDayColumns += found.mergesOutside.length;
        runs.bookingFillCellsOutsideDayColumns += found.bookingFillCellsOutside;
        for (const [key, n] of Object.entries(found.structuralCells)) bump(structuralFills, key, n);
        const touched = new Set(found.runs.flatMap((run) => run.edgeBlobs.filter((b) => !b.inside)));
        for (const blob of found.edgeBlobs) {
          const width = blob.c2 - blob.c1 + 1;
          runs.edgeBlobs.count++;
          runs.edgeBlobs.cells += width;
          if (!touched.has(blob)) continue;
          runs.edgeBlobs.touchingBar++;
          runs.edgeBlobs.cellsTouchingBar += width;
        }
        const file = (list: CellLabel[], bucket: Bucket, into: ReportCell[]) => {
          for (const c of list) {
            ledger.put(c.ref, bucket);
            into.push(toReportCell(c));
          }
        };
        file(hidden, "corruptHeaderRow", corruptHeader);
        file(found.outsideDayColumns, "outsideDayColumns", outside);
        file(found.standaloneNotes, "standaloneNote", standaloneNotes);
        file(found.junkNumerics, "junkNumeric", junkNumerics);

        for (const run of found.runs) {
          runs.total++;
          if (run.source === "merge") runs.merges++;
          else if (run.source === "fill") runs.fillRuns++;
          else runs.labelOnly++;
          if (run.decorativeFill) runs.decorativeColourBars++;
          if (run.mergePastEnd) runs.mergesPastMonthEnd++;
          if (run.mergeBeforeStart) runs.mergesBeforeMonthStart++;

          const resolved = resolveRun(run, { block, columns, berth: r.berth, rowOrdinal: r.ordinal, corruptHeader: corruptHeaderDetail });
          if (resolved.sharedBar) runs.sharedBarRuns++;
          if (resolved.segments.some((s) => s.flags.labelOffFirstCell)) runs.labelOffFirstCell++;
          if (resolved.segments.some((s) => s.flags.repeatedLabel)) runs.repeatedLabelRuns++;
          file(resolved.junk, "junkNumeric", junkNumerics);
          for (const u of resolved.undated) {
            runs.undatedRunsDropped++;
            file(u.cells, "undatedColumn", undatedLabels);
          }
          for (const s of resolved.segments) {
            for (const c of s.labelCells) ledger.put(c.ref, "imported");
            for (const c of s.noteCells) ledger.put(c.ref, "asNote");
            if (s.occupant?.kind === "vessel") {
              const forms = gridForms.get(s.occupant.nameKey) ?? new Map<string, number>();
              for (const c of s.labelCells) forms.set(String(c.value).replace(/\s+/g, " ").trim(), (forms.get(String(c.value).replace(/\s+/g, " ").trim()) ?? 0) + 1);
              gridForms.set(s.occupant.nameKey, forms);
            }
            blockSegments.push(s);
          }
        }
      }

      if (isCarryOver) {
        carryOverWork.push({
          block,
          segments: blockSegments,
          evidence: {
            weekdayMatchesClaimedMonth: weekdays.ok,
            weekdayMatchesSheetYearDecember: validateWeekdays(sheet, block, columns, Number(sheet.name)).ok,
            labelCells: carryOverLabelCells,
          },
        });
      } else segments.push(...blockSegments);
    }

    // Merges are accounted for like cells: on an imported berth row (kept, empty or outside), or not.
    runs.mergesInYearSheets += sheet.merges.length;
    runs.mergesOffBerthRows += sheet.merges.filter((m) => !berthRowsSeen.has(m.r1)).length;
  }

  // Reconciliation: walk every valued cell of every year sheet and demand a bucket for it.
  let labelCells = 0;
  const unaccounted: string[] = [];
  for (const sheet of yearSheets) {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      if (!hasValue(cell)) continue;
      labelCells++;
      const [row, col] = key.split(",").map(Number);
      const ref = `${sheet.name}!${a1(row, col)}`;
      if (!ledger.has(ref)) unaccounted.push(ref);
    }
  }
  const { imported = 0, asNote = 0, ...notImportedCounts } = ledger.counts;
  const notImported = Object.values(notImportedCounts).reduce((a, b) => a + b, 0);

  const { stays, stats } = stitchSegments(segments);

  const registry = parseRegistry(sheets);
  const grid: GridVessel[] = [...gridForms.entries()].map(([nameKey, forms]) => ({ nameKey, forms }));
  const vessels = linkVessels(grid, registry.entries);
  const { seed, overlapPairs, blobNeighbourPairs } = toSeed(stays, vessels);

  const carryOver: CarryOverReport[] = carryOverWork.map((w) =>
    compareCarryOver(w.block, w.segments, segments.filter((s) => s.year === w.block.year && s.month === w.block.month), w.evidence),
  );

  const report = buildReport(seed, {
    source,
    sheets: {
      yearSheets: yearSheets.map((s) => s.name),
      registrySheets: sheets.filter((s) => REGISTRY_SHEETS.includes(s.name)).map((s) => s.name),
      ignored: sheets
        .filter((s) => !isYearSheet(s.name) && !REGISTRY_SHEETS.includes(s.name))
        .map((s) => ({ name: s.name, reason: IGNORED_SHEET_REASONS[s.name] ?? "Not a year grid and not a vessel list; the importer has no rule for it." })),
    },
    blocks: { ...blocksSeen, defects },
    runs,
    stitching: { segments: segments.length, stays: stays.length, joins: stats.joins, crossSheet: stats.crossSheet, sameRowJoins: stats.sameRowJoins, notJoinedDifferentLabels: stats.notJoinedDifferentLabels, notJoinedBothUnlabelled: stats.notJoinedBothUnlabelled, notJoinedDifferentFill: stats.notJoinedDifferentFill, apartByEdgeBlob: blobNeighbourPairs, longestChain: stats.longestChain },
    notImported: {
      areas: { rows: areas.rows, names: sortedCounts(areas.names), bookingFillCells: areas.bookingFillCells, entries: areas.entries },
      orphanRows,
      corruptHeaderLabels: { count: corruptHeader.length, entries: corruptHeader },
      outsideDayColumns: { count: outside.length, entries: outside },
      standaloneNotes: { count: standaloneNotes.length, entries: standaloneNotes },
      junkNumerics: { count: junkNumerics.length, entries: junkNumerics },
      undatedColumnLabels: { count: undatedLabels.length, entries: undatedLabels },
      carryOver,
    },
    structuralFills: sortedCounts(structuralFills),
    reconciliation: {
      labelCells,
      imported,
      asNotes: asNote,
      notImported,
      notImportedByReason: sortedCounts(notImportedCounts),
      unaccounted,
      doubleCounted: ledger.doubleCounted,
      balanced: unaccounted.length === 0 && ledger.doubleCounted.length === 0 && imported + asNote + notImported === labelCells,
    },
    vocab: { closures: sortedCounts(vocab.closures), events: sortedCounts(vocab.events), notes: sortedCounts(vocab.notes), vesselPrefixes: sortedCounts(vocab.vesselPrefixes), unknownLabels: sortedCounts(vocab.unknownLabels) },
    registryEntries: registry.entries.length,
    registryColumnAIgnored: registry.ignoredColumnA,
    overlapPairs,
  });

  return { seed, report };
}

const FACE_BERTH = "north-pier-face";

type BlockLayout = { block: Block; columns: DayColumn[]; rows: BlockRow[] };

/**
 * Whether this sheet paints the grey band along North Pier Face. The band is
 * grey with nothing written on it, month after month (2009-2019); before it
 * existed, grey on that row only ever appears as a named bar (2001). So one
 * bare stretch of grey on a Face row is what tells the two eras apart, and no
 * year has to be hard-coded. Read without band context, a row reports exactly
 * its bare decoration in `structuralCells`.
 */
function paintsFaceBand(sheet: SheetMatrix, layout: readonly BlockLayout[]): boolean {
  return layout.some(({ columns, rows }) =>
    rows.some((r) => r.kind === "berth" && r.berth.id === FACE_BERTH && Object.keys(extractRuns(sheet, r.row, columns).structuralCells).some(isBandGrey)),
  );
}

const bookingFillCells = (sheet: SheetMatrix, index: RowIndex, row: number): number =>
  (index.get(row) ?? []).filter((col) => col > 1 && isBookingFill(cellAt(sheet, row, col)?.fill ?? null)).length;

/**
 * Header rows are grid furniture (title, day numbers, weekday letters). Anything
 * else found in them is quarantined: in the two corrupted 2010 blocks vessel
 * names stand in for the weekday letters, and they say nothing about any berth.
 * The exception is `displaced`: the first berth row's own cells, which the same
 * corruption left in the weekday row. Those are read with their berth row.
 */
function accountHeader(sheet: SheetMatrix, index: RowIndex, block: Block, columns: DayColumn[], ledger: Ledger, quarantine: ReportCell[] | null, displaced: DisplacedCells | null): void {
  const printedCols = new Set(columns.filter((c) => !c.inferred).map((c) => c.col));
  for (const row of block.headerRows) {
    for (const c of valuedCells(sheet, index, row)) {
      // Displaced berth cells only sit in a header row; they are entered with the berth row they belong to.
      if (displaced && row === displaced.fromRow && c.col >= displaced.c1 && c.col <= displaced.c2) continue;
      const cell = cellAt(sheet, row, c.col);
      const isTitle = row === block.titleRow && c.col === 1;
      const isDayNumber = row === block.dayRow && printedCols.has(c.col);
      const isWeekday = row === block.weekdayRow && typeof c.value === "string" && WEEKDAY_TOKENS.includes(c.value.trim().toUpperCase());
      const isDisplacedDay = row !== block.dayRow && row !== block.weekdayRow && row !== block.titleRow && isInt(cell?.v);
      if (isTitle || isDayNumber || isWeekday || isDisplacedDay) ledger.put(c.ref, "gridFurniture");
      else if (quarantine) {
        ledger.put(c.ref, "corruptHeaderRow");
        quarantine.push(toReportCell(c));
      } else ledger.put(c.ref, "carryOverBlock");
    }
  }
}

function countVocab(vocab: { closures: Record<string, number>; events: Record<string, number>; notes: Record<string, number>; vesselPrefixes: Record<string, number>; unknownLabels: Record<string, number> }, c: CellLabel): void {
  const label = classifyLabel(c.value);
  if (label.kind === "vessel") bump(vocab.vesselPrefixes, label.prefix);
  else if (label.kind === "note") bump(vocab.notes, label.note);
  else if (label.kind === "closure") bump(vocab.closures, label.title);
  else if (label.kind === "event" && !label.unknown) bump(vocab.events, label.title);
  else if (label.kind === "event") bump(vocab.unknownLabels, label.text);
}
