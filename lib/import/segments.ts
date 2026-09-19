import { a1 } from "./types";
import { rangeRef, spanRef } from "./grid";
import { classifyLabel, isOccupantLabel, type LabelClass } from "./labels";
import type { BerthInfo, Block, CellLabel, DatedEdgeBlob, DayColumn, Occupant, RawRun, Segment } from "./model";

export type RunContext = {
  block: Block;
  columns: DayColumn[];
  berth: BerthInfo;
  rowOrdinal: number;
  /** Set for the two corrupted 2010 blocks: every booking in them needs a human look. */
  corruptHeader: string | null;
};

export type ResolvedRun = {
  segments: Segment[];
  /** Bare numbers found inside the run. */
  junk: CellLabel[];
  /** Pieces that ended up with no real date at all (they sit wholly under an impossible day). */
  undated: { sourceRef: string; cells: CellLabel[] }[];
  sharedBar: boolean;
};

type OccupantGroup = { occupant: Occupant; rawLabel: string; firstCol: number; cells: CellLabel[] };

/** `key` is what "the same occupant" means: the vessel's name without prefix, or the canonical vocabulary text. */
function toOccupant(label: Extract<LabelClass, { kind: "vessel" | "closure" | "event" }>): Occupant {
  if (label.kind === "vessel") return { kind: "vessel", key: `vessel:${label.nameKey}`, nameKey: label.nameKey, prefix: label.prefix, name: label.name };
  return { kind: label.kind, key: `${label.kind}:${label.title.toLowerCase()}`, title: label.title, unknown: label.unknown };
}

/**
 * Decides who a run belongs to. The label can sit anywhere in the run and may
 * be repeated; notes ride along; bare numbers are junk. Two or more DISTINCT
 * occupants in one bar are split back-to-back at each new name's column (the
 * first occupant keeps the leading cells) and flagged: a shared bar is
 * ambiguous, but it is never evidence of an overlap.
 */
export function resolveRun(run: RawRun, ctx: RunContext): ResolvedRun {
  const junk: CellLabel[] = [];
  const notes: { cell: CellLabel; note: string }[] = [];
  const groups: OccupantGroup[] = [];

  for (const cell of run.labels) {
    const label = classifyLabel(cell.value);
    if (label.kind === "junk") junk.push(cell);
    else if (label.kind === "note") notes.push({ cell, note: label.note });
    else if (isOccupantLabel(label)) {
      const occupant = toOccupant(label);
      const current = groups[groups.length - 1];
      if (current && current.occupant.key === occupant.key) current.cells.push(cell);
      else groups.push({ occupant, rawLabel: String(cell.value), firstCol: Math.max(cell.col, run.c1), cells: [cell] });
    }
  }

  const sharedBar = groups.length > 1;
  const pieces = groups.length === 0 ? [{ c1: run.c1, c2: run.c2, group: null as OccupantGroup | null }] : groups.map((group, i) => ({
    c1: i === 0 ? run.c1 : group.firstCol,
    c2: i + 1 < groups.length ? groups[i + 1].firstCol - 1 : run.c2,
    group,
  }));

  const result: ResolvedRun = { segments: [], junk, undated: [], sharedBar };
  const firstValid = ctx.columns.find((c) => c.date !== null)?.col ?? Infinity;
  const lastValid = [...ctx.columns].reverse().find((c) => c.date !== null)?.col ?? -Infinity;

  for (const piece of pieces) {
    const covered = ctx.columns.filter((c) => c.col >= piece.c1 && c.col <= piece.c2);
    const dated = covered.filter((c) => c.date !== null);
    const pieceNotes = notes.filter((n) => pieces.length === 1 || (n.cell.col >= piece.c1 && n.cell.col <= piece.c2));
    // A whole-run sourceRef keeps a merge's own address; split pieces cite just their own cells.
    const displaced = run.displacedRef !== null ? ctx.block.displacedCells : null;
    const sourceRef = pieces.length === 1 ? run.sourceRef : spanRef(run.sheet, run.row, piece.c1, piece.c2, displaced);
    if (dated.length === 0) {
      result.undated.push({ sourceRef, cells: [...(piece.group?.cells ?? []), ...pieceNotes.map((n) => n.cell)] });
      continue;
    }

    const undatedCols = covered.filter((c) => c.date === null);
    // A stay read partly from the row above says so, with the cells, because that is the first thing a person will want to check.
    const movedRef = displaced && piece.c1 <= displaced.c2 && piece.c2 >= displaced.c1 ? rangeRef(run.sheet, displaced.fromRow, Math.max(piece.c1, displaced.c1), Math.min(piece.c2, displaced.c2)) : null;
    const moved = movedRef ? ` The same corruption pushed this berth row's cells for days 1-${ctx.block.anchorDay - 1} up one row: ${movedRef} was read as part of this stay.` : "";
    const calendarDefect: Segment["flags"]["calendarDefect"] = ctx.corruptHeader
      ? { reason: "corrupt_header", detail: `${ctx.corruptHeader}${moved}` }
      : undatedCols.length > 0
        ? {
            reason: "impossible_date",
            detail: `The bar reaches ${undatedCols.map((c) => `${run.sheet}!${a1(ctx.block.dayRow, c.col)} (printed day ${c.printed})`).join(", ")}, which is not a real date; those cells were left out, check the true end of the stay.`,
          }
        : null;

    result.segments.push({
      sheet: run.sheet,
      blockIndex: ctx.block.index,
      year: ctx.block.year,
      month: ctx.block.month,
      row: run.row,
      berthId: ctx.berth.id,
      rowOrdinal: ctx.rowOrdinal,
      c1: piece.c1,
      c2: piece.c2,
      sourceRef,
      runRef: run.sourceRef,
      source: run.source,
      fill: run.fill,
      occupant: piece.group?.occupant ?? null,
      rawLabel: piece.group?.rawLabel ?? null,
      notes: pieceNotes.map((n) => n.note),
      startDate: dated[0].date as string,
      endDate: dated[dated.length - 1].date as string,
      touchesStart: piece.c1 <= firstValid,
      touchesEnd: piece.c2 >= lastValid,
      flags: {
        sharedBar,
        labelUnfilled: run.labelUnfilled,
        unknownLabel: piece.group?.occupant.kind !== "vessel" && piece.group?.occupant.unknown === true,
        mergePastEnd: run.mergePastEnd && piece.c2 === run.c2,
        mergeBeforeStart: run.mergeBeforeStart && piece.c1 === run.c1,
        calendarDefect,
        labelOffFirstCell: run.source === "fill" && piece.group !== null && !sharedBar && piece.group.cells[0].col !== run.c1,
        repeatedLabel: (piece.group?.cells.length ?? 0) > 1,
        edgeBlobs: run.edgeBlobs.flatMap((blob): DatedEdgeBlob[] => {
          // A blob belongs to the piece at its end of the bar, and only exists for us on days that are real.
          if (blob.side === "start" ? piece.c1 !== run.c1 : piece.c2 !== run.c2) return [];
          const days = ctx.columns.filter((c) => c.col >= blob.c1 && c.col <= blob.c2 && c.date !== null);
          return days.length === 0 ? [] : [{ ...blob, startDate: days[0].date as string, endDate: days[days.length - 1].date as string }];
        }),
      },
      labelCells: piece.group?.cells ?? [],
      noteCells: pieceNotes.map((n) => n.cell),
    });
  }
  return result;
}
