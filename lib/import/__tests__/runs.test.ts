import { describe, expect, it } from "vitest";
import { detectBlocks } from "../blocks";
import { mapDayColumns } from "../calendar";
import { extractRuns, type RowContext } from "../runs";
import { BANNER, col, GREEN, GREY_BAND, modernBlock, RED, SheetBuilder, WHITE } from "./fixture";

/** January 2011 with day 1 in column C, so column B is outside the day columns. Berth rows start at 8. */
function january(paint: (b: SheetBuilder) => void) {
  const b = new SheetBuilder("2011");
  modernBlock(b, 6, 2011, 1, { firstCol: "C" });
  paint(b);
  const sheet = b.build();
  const columns = mapDayColumns(sheet, detectBlocks(sheet)[0]);
  return (row: number, ctx?: RowContext) => extractRuns(sheet, row, columns, ctx);
}

/** The same month after the 2010 corruption: days 1-6 of the weekday row (row 7) hold the first berth row's cells, not weekday letters. */
const displaced = { fromRow: 7, c1: col("C"), c2: col("H") };
const shifted = (paint: (b: SheetBuilder) => void) =>
  january((b) => {
    for (const letters of ["C", "D", "E", "F", "G", "H"]) b.set(`${letters}7`, null);
    paint(b);
  });

const shape = (r: { c1: number; c2: number; source: string; fill: string | null; sourceRef: string }) => [r.source, r.sourceRef, r.fill];

describe("extractRuns", () => {
  it("fill runs: maximal stretches of one booking colour; a colour change starts a new run", () => {
    const runs = january((b) => b.fill("D8:G8", GREEN).fill("H8:I8", RED).fill("M8:M8", GREEN).set("E8", "R/V Blue Reef", GREEN))(8).runs;
    expect(runs.map(shape)).toEqual([
      ["fill", "2011!D8:G8", GREEN],
      ["fill", "2011!H8:I8", RED],
      ["fill", "2011!M8", GREEN],
    ]);
    expect(runs[0].labels.map((l) => l.ref)).toEqual(["2011!E8"]);
  });

  it("merge-first: a labelled, filled merge is one run and its slaves never start fill runs", () => {
    const runs = january((b) => b.merge("E8:K8", "M/Y BLUE TIDE", GREEN))(8).runs;
    expect(runs.map(shape)).toEqual([["merge", "2011!E8:K8", GREEN]]);
    expect(runs[0]).toMatchObject({ c1: col("E"), c2: col("K"), mergePastEnd: false, mergeBeforeStart: false });
  });

  it("a merge boundary splits a same-colour neighbour", () => {
    const runs = january((b) => b.merge("E8:H8", "R/V GOLDEN COMPASS", GREEN).fill("I8:L8", GREEN))(8).runs;
    expect(runs.map(shape)).toEqual([
      ["merge", "2011!E8:H8", GREEN],
      ["fill", "2011!I8:L8", GREEN],
    ]);
  });

  it("keeps a labelled merge with no fill, and one with only a structural fill", () => {
    const at = january((b) => b.merge("E8:H8", "R/V Golden Horizon", null).merge("E9:H9", "R/V Quiet Star", GREY_BAND));
    expect(at(8).runs.map(shape)).toEqual([["merge", "2011!E8:H8", null]]);
    expect(at(9).runs.map(shape)).toEqual([["merge", "2011!E9:H9", null]]);
    expect(at(8).runs[0].labelUnfilled).toBe(false);
  });

  it("drops a merge with neither booking fill nor label, and counts it", () => {
    const found = january((b) => b.merge("E8:H8", null, null).merge("J8:K8", null, GREY_BAND))(8);
    expect(found.runs).toEqual([]);
    expect(found.emptyMerges.map((m) => m.ref)).toEqual(["E8:H8", "J8:K8"]);
  });

  it("clips a merge that runs past the last day column, or starts left of day 1, and flags it", () => {
    const at = january((b) => b.merge("AD8:AJ8", "Barge Grey Sound", GREEN).merge("B9:F9", "R/V GOLDEN COMPASS", GREEN));
    expect(at(8).runs[0]).toMatchObject({ c1: col("AD"), c2: col("AG"), mergePastEnd: true, sourceRef: "2011!AD8:AJ8" });
    const early = at(9);
    expect(early.runs[0]).toMatchObject({ c1: col("C"), c2: col("F"), mergeBeforeStart: true });
    // The master sits in column B, outside the day columns, but it is this run's label, not a stray.
    expect(early.runs[0].labels.map((l) => l.ref)).toEqual(["2011!B9"]);
    expect(early.outsideDayColumns).toEqual([]);
  });

  it("never forms runs from background fills or bare decoration", () => {
    const found = january((b) => b.fill("C8:AG8", GREY_BAND).fill("C9:AG9", WHITE).fill("M10:P10", BANNER).set("N10", "ETD PM", BANNER))(8);
    expect(found.runs).toEqual([]);
    expect(found.structuralCells).toEqual({ [GREY_BAND]: 31 });
    // A note does not make decoration a bar: it is reported, and the cells stay decoration.
    const noted = january((b) => b.fill("M10:P10", BANNER).set("N10", "ETD PM", BANNER))(10);
    expect(noted.runs).toEqual([]);
    expect(noted.standaloneNotes.map((c) => c.ref)).toEqual(["2011!N10"]);
    expect(noted.structuralCells).toEqual({ [BANNER]: 4 });
  });

  it("named decoration: a stretch of a decorative colour with a name on it is a bar with its full painted extent", () => {
    // 2005!B108:AF108 in the real workbook: M/V CORAL LANTERN painted in the banner colour for all of October.
    const at = january((b) => b.fill("C8:AG8", BANNER).set("C8", "M/V CORAL LANTERN", BANNER).fill("N10:R10", GREY_BAND).set("P10", "R/V Green Sextant", GREY_BAND).set("Q10", "Fueling", GREY_BAND));
    expect(at(8).runs).toEqual([expect.objectContaining({ source: "fill", sourceRef: "2011!C8:AG8", fill: BANNER, decorativeFill: true, labelUnfilled: false, edgeBlobs: [] })]);
    expect(at(8).structuralCells).toEqual({});
    // The name may sit anywhere in the stretch, and notes ride along as in any bar.
    expect(at(10).runs.map(shape)).toEqual([["fill", "2011!N10:R10", GREY_BAND]]);
    expect(at(10).runs[0].labels.map((l) => l.ref)).toEqual(["2011!P10", "2011!Q10"]);
    expect(at(10).standaloneNotes).toEqual([]);
  });

  it("named decoration stops at a change of colour, like any fill run", () => {
    const runs = january((b) => b.fill("F8:I8", BANNER).set("F8", "R/V Blue Ledge", BANNER).fill("J8:L8", GREEN).fill("M8:N8", GREY_BAND))(8).runs;
    expect(runs.map(shape)).toEqual([
      ["fill", "2011!F8:I8", BANNER],
      ["fill", "2011!J8:L8", GREEN],
    ]);
  });

  it("the grey band is the exception: a name on it is a one-day entry, and the band stays decoration", () => {
    const found = january((b) => b.fill("C9:AG9", GREY_BAND).set("R9", "R/V Quiet Star", GREY_BAND).set("T9", "Arrival 1400", GREY_BAND))(9, { greyIsBand: true });
    expect(found.runs).toEqual([expect.objectContaining({ source: "label_only", sourceRef: "2011!R9", fill: null, decorativeFill: false, labelUnfilled: true })]);
    expect(found.standaloneNotes.map((c) => c.ref)).toEqual(["2011!T9"]);
    expect(found.structuralCells).toEqual({ [GREY_BAND]: 31 });
    // Only the grey is a band: a named banner-colour stretch on the same row is still a bar.
    const blue = january((b) => b.fill("F9:H9", BANNER).set("F9", "Tug Wild Gannet", BANNER))(9, { greyIsBand: true });
    expect(blue.runs.map(shape)).toEqual([["fill", "2011!F9:H9", BANNER]]);
  });

  it("label-only: a vessel written on a cell with no colour is a one-day run, flagged", () => {
    const at = january((b) => b.set("F9", "R/V Golden Horizon").set("K9", "M/V Far Star", WHITE));
    expect(at(9).runs.map(shape)).toEqual([["label_only", "2011!F9", null], ["label_only", "2011!K9", null]]);
    expect(at(9).runs.every((r) => r.labelUnfilled)).toBe(true);
  });

  it("remembers a bare banner blob on the bar it touches at a month edge, and never counts its cells", () => {
    // 2015!H141 and 2017!C61:D61 in the real workbook: the blob sits between day 1 and the bar.
    const found = january((b) => b.fill("C8:D8", BANNER).merge("E8:K8", "OSV AMBER REEF", GREEN).fill("Y8:AD8", RED).set("Y8", "R/V GOLDEN COMPASS", RED).fill("AE8:AG8", BANNER))(8);
    expect(found.runs.map(shape)).toEqual([
      ["merge", "2011!E8:K8", GREEN],
      ["fill", "2011!Y8:AD8", RED],
    ]);
    expect(found.runs[0].edgeBlobs).toEqual([{ side: "start", c1: col("C"), c2: col("D"), sourceRef: "2011!C8:D8", inside: false }]);
    expect(found.runs[1].edgeBlobs).toEqual([{ side: "end", c1: col("AE"), c2: col("AG"), sourceRef: "2011!AE8:AG8", inside: false }]);
    expect(found.edgeBlobs).toHaveLength(2);
    expect(found.structuralCells).toEqual({ [BANNER]: 5 });
  });

  it("does not pin a blob on a bar it does not touch, on a one-day label, or away from the month edge", () => {
    const at = january((b) =>
      b.fill("C8:D8", BANNER).fill("F8:H8", GREEN) // a gap at E
        .fill("C9:D9", BANNER).set("E9", "R/V Golden Horizon") // label-only neighbour
        .fill("M10:N10", BANNER).fill("O10:Q10", GREEN), // interior
    );
    expect(at(8).runs[0].edgeBlobs).toEqual([]);
    expect(at(8).edgeBlobs.map((e) => e.sourceRef)).toEqual(["2011!C8:D8"]);
    expect(at(9).runs[0]).toMatchObject({ source: "label_only", edgeBlobs: [] });
    expect(at(10).runs[0].edgeBlobs).toEqual([]);
    expect(at(10).edgeBlobs).toEqual([]);
  });

  it("flags the cells between a banner-colour bar's name and the month edge when they are few enough to be a blob", () => {
    // 2005!AB54:AF54: name + 4 cells to month end. 2005!X97:AE97: name + 7 cells, too many for a blob.
    const at = january((b) => b.fill("AC8:AG8", BANNER).set("AC8", "Barge Silver Voyager", BANNER).fill("Z9:AG9", BANNER).set("Z9", "M/V CORAL LANTERN", BANNER).fill("AE10:AG10", GREY_BAND).set("AE10", "R/V Green Sextant", GREY_BAND));
    expect(at(8).runs[0].edgeBlobs).toEqual([{ side: "end", c1: col("AD"), c2: col("AG"), sourceRef: "2011!AD8:AG8", inside: true }]);
    expect(at(9).runs[0]).toMatchObject({ sourceRef: "2011!Z9:AG9", edgeBlobs: [] });
    // Grey never turns up as an edge blob, so a grey bar at the edge is not in doubt.
    expect(at(10).runs[0]).toMatchObject({ sourceRef: "2011!AE10:AG10", decorativeFill: true, edgeBlobs: [] });
    const start = january((b) => b.fill("C8:H8", BANNER).set("E8", "R/V Blue Ledge", BANNER))(8).runs[0];
    expect(start.edgeBlobs).toEqual([{ side: "start", c1: col("C"), c2: col("D"), sourceRef: "2011!C8:D8", inside: true }]);
  });

  it("reads displaced columns from the row above, and cites every cell where it physically sits", () => {
    // December 2010 in the real workbook: B129:G129 belong to the berth row below, whose own cells there hold a grey filler.
    const found = shifted((b) => b.fill("C7:H7", GREEN).fill("C8:H8", GREY_BAND).fill("I8:R8", GREEN).set("D7", "ETA 1200", GREEN))(8, { displaced });
    expect(found.runs.map(shape)).toEqual([["fill", "2011!C7:H7;2011!I8:R8", GREEN]]);
    expect(found.runs[0]).toMatchObject({ row: 8, c1: col("C"), c2: col("R"), displacedRef: "2011!C7:H7" });
    expect(found.runs[0].labels.map((l) => l.ref)).toEqual(["2011!D7"]);
    // The filler is not this row's content any more, so it is not counted as decoration either.
    expect(found.structuralCells).toEqual({});
    const single = shifted((b) => b.set("C7", "R/V GOLDEN COMPASS", GREEN).fill("K8:L8", RED))(8, { displaced });
    expect(single.runs.map((r) => [r.sourceRef, r.displacedRef])).toEqual([["2011!C7", "2011!C7"], ["2011!K8:L8", null]]);
  });

  it("refuses a merge over displaced cells instead of guessing which row it belongs to", () => {
    expect(() => shifted((b) => b.merge("G8:K8", "R/V Quiet Star", GREEN))(8, { displaced })).toThrow(/2011!G8:K8.*displaced/);
    expect(() => shifted((b) => b.merge("D7:E7", null, GREEN))(8, { displaced })).toThrow(/2011!D7:E7.*displaced/);
  });

  it("reports notes and numbers on unbooked cells instead of turning them into stays", () => {
    const found = january((b) => b.set("J8", "ETD PM").set("AA8", 1400).set("B8", "R/V Golden Horizon").set("AJ8", "Holiday"))(8);
    expect(found.runs).toEqual([]);
    expect(found.standaloneNotes.map((c) => c.ref)).toEqual(["2011!J8"]);
    expect(found.junkNumerics.map((c) => c.ref)).toEqual(["2011!AA8"]);
    expect(found.outsideDayColumns.map((c) => c.ref)).toEqual(["2011!B8", "2011!AJ8"]);
  });

  it("ignores booking colour outside the day columns but counts the cells", () => {
    const found = january((b) => b.fill("B8:E8", GREEN))(8);
    expect(found.runs.map(shape)).toEqual([["fill", "2011!C8:E8", GREEN]]);
    expect(found.bookingFillCellsOutside).toBe(1);
  });
});
