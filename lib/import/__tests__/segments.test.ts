import { describe, expect, it } from "vitest";
import { detectBlocks } from "../blocks";
import { mapDayColumns } from "../calendar";
import { extractRuns } from "../runs";
import { BERTHS } from "../rows";
import { resolveRun } from "../segments";
import { BANNER, GREEN, GREY_BAND, modernBlock, range, SheetBuilder } from "./fixture";

/** Resolves every run on row 8 (North Pier West) of a one-block sheet. */
function resolve(paint: (b: SheetBuilder) => void, opts: { year?: number; month?: number; days?: number[] } = {}) {
  const year = opts.year ?? 2006;
  const b = new SheetBuilder(String(year));
  modernBlock(b, 6, year, opts.month ?? 5, { days: opts.days });
  paint(b);
  const sheet = b.build();
  const block = detectBlocks(sheet)[0];
  const columns = mapDayColumns(sheet, block);
  return extractRuns(sheet, 8, columns).runs.map((run) => resolveRun(run, { block, columns, berth: BERTHS[0], rowOrdinal: 0, corruptHeader: null }));
}

const brief = (s: { sourceRef: string; startDate: string; endDate: string; rawLabel: string | null }) => [s.sourceRef, s.startDate, s.endDate, s.rawLabel];

describe("resolveRun", () => {
  it("finds a label that is not in the first cell", () => {
    const [r] = resolve((b) => b.fill("B8:F8", GREEN).set("C8", "S/V FAR HORIZON", GREEN));
    expect(r.segments.map(brief)).toEqual([["2006!B8:F8", "2006-05-01", "2006-05-05", "S/V FAR HORIZON"]]);
    expect(r.segments[0].flags.labelOffFirstCell).toBe(true);
    expect(r.segments[0].occupant).toMatchObject({ kind: "vessel", nameKey: "FAR HORIZON", prefix: "S/V" });
  });

  it("finds a label in the last cell", () => {
    const [r] = resolve((b) => b.fill("J8:M8", GREEN).set("M8", "Tug Blue Fathom", GREEN));
    expect(r.segments.map(brief)).toEqual([["2006!J8:M8", "2006-05-09", "2006-05-12", "Tug Blue Fathom"]]);
  });

  it("treats a repeated label as one booking", () => {
    const [r] = resolve((b) => b.fill("H8:J8", GREEN).set("H8", "R/V Long Ketch", GREEN).set("I8", "R/V LONG KETCH", GREEN));
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].flags).toMatchObject({ repeatedLabel: true, sharedBar: false, labelOffFirstCell: false });
    expect(r.segments[0].labelCells.map((c) => c.ref)).toEqual(["2006!H8", "2006!I8"]);
  });

  it("attaches notes to the vessel they annotate and reports numbers as junk", () => {
    const [r] = resolve((b) => b.fill("U8:Y8", GREEN).set("U8", "F/V SALT FATHOM", GREEN).set("V8", "Delayed due to weather", GREEN).set("X8", "eta 1200", GREEN).set("Y8", 1400, GREEN));
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].notes).toEqual(["Delayed due to weather", "ETA 1200"]);
    expect(r.segments[0].noteCells.map((c) => c.ref)).toEqual(["2006!V8", "2006!X8"]);
    expect(r.junk.map((c) => c.ref)).toEqual(["2006!Y8"]);
  });

  it("splits a shared bar back-to-back at the second name; the first occupant keeps the leading cells", () => {
    const [r] = resolve((b) => b.fill("B8:Y8", GREEN).set("B8", "Tug WESTERN CURRENT", GREEN).set("D8", "OSV Iron Meridian", GREEN).set("E8", "Fueling", GREEN));
    expect(r.sharedBar).toBe(true);
    expect(r.segments.map(brief)).toEqual([
      ["2006!B8:C8", "2006-05-01", "2006-05-02", "Tug WESTERN CURRENT"],
      ["2006!D8:Y8", "2006-05-03", "2006-05-24", "OSV Iron Meridian"],
    ]);
    expect(r.segments.every((s) => s.flags.sharedBar && s.runRef === "2006!B8:Y8")).toBe(true);
    expect(r.segments.map((s) => s.notes)).toEqual([[], ["Fueling"]]);
    // Never an overlap: the pieces tile the bar exactly.
    expect(r.segments[0].endDate < r.segments[1].startDate).toBe(true);
  });

  it("splits A-B-A into three pieces, leading cells going to the first A", () => {
    const [r] = resolve((b) => b.fill("C8:K8", GREEN).set("D8", "R/V Alpha", GREEN).set("G8", "R/V Bravo", GREEN).set("J8", "R/V ALPHA", GREEN));
    expect(r.segments.map(brief)).toEqual([
      ["2006!C8:F8", "2006-05-02", "2006-05-05", "R/V Alpha"],
      ["2006!G8:I8", "2006-05-06", "2006-05-08", "R/V Bravo"],
      ["2006!J8:K8", "2006-05-09", "2006-05-10", "R/V ALPHA"],
    ]);
  });

  it("imports a filled run with only a note as unlabelled, keeping the note", () => {
    const [noteOnly, empty] = resolve((b) => b.fill("G8:I8", GREEN).set("G8", "Arrival 1400", GREEN).fill("P8:Q8", GREEN));
    expect(noteOnly.segments[0]).toMatchObject({ occupant: null, rawLabel: null, notes: ["Arrival 1400"] });
    expect(empty.segments[0]).toMatchObject({ occupant: null, notes: [], startDate: "2006-05-15", endDate: "2006-05-16" });
  });

  it("clips cells under an impossible date, flags the booking, and still counts it as reaching month end", () => {
    const [r] = resolve((b) => b.fill("AD8:AF8", GREEN).set("AD8", "OSV Grey Fathom", GREEN), { year: 2008, month: 6, days: range(1, 31) });
    expect(r.segments[0]).toMatchObject({ startDate: "2008-06-29", endDate: "2008-06-30", touchesEnd: true });
    expect(r.segments[0].flags.calendarDefect).toMatchObject({ reason: "impossible_date" });
  });

  it("drops a run that lives wholly under an impossible date, and says so", () => {
    const [r] = resolve((b) => b.set("AF8", "R/V Nowhere", GREEN), { year: 2008, month: 6, days: range(1, 31) });
    expect(r.segments).toEqual([]);
    expect(r.undated).toEqual([{ sourceRef: "2008!AF8", cells: [expect.objectContaining({ ref: "2008!AF8" })] }]);
  });

  it("dates the edge blobs of a bar, and a bar next to a blob does not touch the month edge", () => {
    const [r] = resolve((b) => b.fill("B8:D8", BANNER).fill("E8:S8", GREEN).set("E8", "R/V CLEAR SEXTANT", GREEN));
    expect(r.segments[0]).toMatchObject({ startDate: "2006-05-04", endDate: "2006-05-18", touchesStart: false });
    expect(r.segments[0].flags.edgeBlobs).toEqual([{ side: "start", c1: 2, c2: 4, sourceRef: "2006!B8:D8", inside: false, startDate: "2006-05-01", endDate: "2006-05-03" }]);
  });

  it("gives a blob to the piece at its end of a shared bar, and drops one that has no real day under it", () => {
    const [shared] = resolve((b) => b.fill("B8:C8", BANNER).fill("D8:K8", GREEN).set("D8", "R/V Alpha", GREEN).set("H8", "R/V Bravo", GREEN));
    expect(shared.segments.map((s) => s.flags.edgeBlobs.length)).toEqual([1, 0]);
    // June 31 does not exist: a blob sitting only under it hides no day of anybody's stay.
    const [r] = resolve((b) => b.fill("AD8:AE8", GREEN).fill("AF8:AF8", BANNER), { year: 2008, month: 6, days: range(1, 31) });
    expect(r.segments[0]).toMatchObject({ endDate: "2008-06-30", touchesEnd: true });
    expect(r.segments[0].flags.edgeBlobs).toEqual([]);
  });

  it("says which cells of a stay were read from the row above in a corrupted 2010 block", () => {
    const b = new SheetBuilder("2010");
    modernBlock(b, 6, 2010, 11);
    // DECEMBER: 7..31 printed from H, 1..6 one row up, and B18:G18 (the weekday row) holding the first berth row's cells.
    b.days("E16", range(1, 6)).set("A17", "DECEMBER 2010").days("H17", range(7, 31)).berths(19);
    b.fill("B18:G18", GREEN).fill("B19:G19", GREY_BAND).fill("H19:R19", GREEN).set("J19", "R/V GOLDEN COMPASS", GREEN).set("M19", "Barge Salt Dory", GREEN);
    const sheet = b.build();
    const block = detectBlocks(sheet)[1];
    const columns = mapDayColumns(sheet, block);
    const [run] = extractRuns(sheet, 19, columns, { displaced: block.displacedCells }).runs;
    const { segments } = resolveRun(run, { block, columns, berth: BERTHS[0], rowOrdinal: 0, corruptHeader: "Corrupted header." });
    expect(segments.map(brief)).toEqual([
      ["2010!B18:G18;2010!H19:L19", "2010-12-01", "2010-12-11", "R/V GOLDEN COMPASS"],
      ["2010!M19:R19", "2010-12-12", "2010-12-17", "Barge Salt Dory"],
    ]);
    expect(segments[0].flags.calendarDefect).toEqual({ reason: "corrupt_header", detail: "Corrupted header. The same corruption pushed this berth row's cells for days 1-6 up one row: 2010!B18:G18 was read as part of this stay." });
    expect(segments[1].flags.calendarDefect).toEqual({ reason: "corrupt_header", detail: "Corrupted header." });
  });

  it("knows which bars touch day 1 and the last valid day", () => {
    const [head, middle, tail] = resolve((b) => b.fill("B8:C8", GREEN).fill("J8:K8", GREEN).fill("AE8:AF8", GREEN));
    expect([head.segments[0].touchesStart, head.segments[0].touchesEnd]).toEqual([true, false]);
    expect([middle.segments[0].touchesStart, middle.segments[0].touchesEnd]).toEqual([false, false]);
    expect([tail.segments[0].touchesStart, tail.segments[0].touchesEnd]).toEqual([false, true]);
  });
});
