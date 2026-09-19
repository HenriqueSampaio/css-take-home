import { describe, expect, it } from "vitest";
import { detectBlocks } from "../blocks";
import { daysIn, modernBlock, range, SheetBuilder } from "./fixture";

describe("detectBlocks", () => {
  it("era 1997-2001: title alone on top of the first block, then weekdays, then formula day numbers", () => {
    const b = new SheetBuilder("1999");
    b.set("A1", "JANUARY 1999").weekdays("B2", 1999, 1, range(1, 31)).days("B3", range(1, 31), true).berths(4);
    // Later blocks share the title row with the weekdays.
    b.set("A13", "FEBRUARY 1999").weekdays("B13", 1999, 2, range(1, 28)).days("B14", range(1, 28), true).berths(15);
    const [jan, feb] = detectBlocks(b.build());
    expect(jan).toMatchObject({ year: 1999, month: 1, titleRow: 1, weekdayRow: 2, dayRow: 3, firstRow: 1, lastRow: 12, firstDayCol: 2, role: "primary" });
    expect(feb).toMatchObject({ month: 2, titleRow: 13, weekdayRow: 13, dayRow: 14, headerRows: [13, 14], firstRow: 13 });
  });

  it("era 2002-2004: literal day numbers under a shared title/weekday row, opening with a carry-over December", () => {
    const b = new SheetBuilder("2002");
    b.set("A1", "DECEMBER 2001").weekdays("B1", 2002, 12, range(1, 31)).days("B2", range(1, 31), true).berths(3);
    b.set("A12", "JANUARY 2002").weekdays("B12", 2002, 1, range(1, 31)).days("B13", range(1, 31)).berths(14);
    const [carry, jan] = detectBlocks(b.build());
    expect(carry).toMatchObject({ role: "carry_over", year: 2001, month: 12, defects: [] });
    expect(jan).toMatchObject({ role: "primary", year: 2002, month: 1, weekdayRow: 12, dayRow: 13 });
  });

  it("era 2005-2019: banner rows on top, the title row IS the day row, weekdays below, bare month titles", () => {
    const b = new SheetBuilder("2016");
    b.set("A1", "Harborview Marine Research Center").set("A2", "2016 Pier & Dock Schedule (synthetic sample data)").set("A3", "Contact: Dock Coordinator");
    modernBlock(b, 7, 2016, 1, { title: "January", firstCol: "C" });
    modernBlock(b, 19, 2016, 2, { title: "February", firstCol: "C" });
    const [jan, feb] = detectBlocks(b.build());
    expect(jan).toMatchObject({ year: 2016, month: 1, titleRow: 7, dayRow: 7, weekdayRow: 8, firstRow: 7, lastRow: 18, firstDayCol: 3, defects: [] });
    expect(feb).toMatchObject({ month: 2, firstDayCol: 3 });
  });

  it("follows a first-day column that drifts from block to block, with an irregular pitch", () => {
    const b = new SheetBuilder("2012");
    modernBlock(b, 6, 2012, 1, { firstCol: "G" });
    modernBlock(b, 17, 2012, 2, { firstCol: "D" });
    modernBlock(b, 32, 2012, 3, { firstCol: "L" });
    expect(detectBlocks(b.build()).map((x) => [x.dayRow, x.firstDayCol])).toEqual([[6, 7], [17, 4], [32, 12]]);
  });

  it("does not mistake a berth row with stray numbers for a header", () => {
    const b = new SheetBuilder("2010");
    const berth = modernBlock(b, 6, 2010, 1);
    b.set(`C${berth}`, 1).set(`D${berth}`, 2).set(`E${berth}`, 3).set(`AA${berth}`, 1400);
    expect(detectBlocks(b.build())).toHaveLength(1);
  });

  it("anchors a corrupted header on its printed 7..N and claims the displaced 1..6 row", () => {
    const b = new SheetBuilder("2010");
    modernBlock(b, 6, 2010, 10);
    // NOVEMBER block: title says 2018, 7..30 start in I, 1..6 sit one row up, names where the weekdays belong.
    b.days("D16", range(1, 6));
    b.set("A17", "NOVEMBER 2018").set("C17", "F/V GREY STRAND").days("I17", range(7, 30));
    b.set("I18", "S/V FAR LANTERN").set("J18", "OSV CLEAR OSPREY");
    b.berths(19);
    const nov = detectBlocks(b.build())[1];
    expect(nov).toMatchObject({ year: 2010, month: 11, dayRow: 17, weekdayRow: 18, anchorCol: 9, anchorDay: 7, firstDayCol: 3, headerRows: [16, 17, 18], firstRow: 16 });
    expect(nov.defects.map((d) => d.kind).sort()).toEqual(["displaced_header", "title_year_mismatch", "weekday_row_missing"]);
    expect(nov.defects.every((d) => d.month === "2010-11")).toBe(true);
    // Days 1-6 slid up one row as a unit, so the first berth row's cells for them now sit in the weekday row (C18:H18).
    expect(nov.displacedCells).toEqual({ fromRow: 18, c1: 3, c2: 8 });
    expect(detectBlocks(b.build())[0].displacedCells).toBeNull();
  });

  it("does not look for displaced berth cells without the displaced 1..6 to prove the shift", () => {
    const b = new SheetBuilder("2010");
    b.set("A17", "NOVEMBER 2010").days("I17", range(7, 30)).berths(19);
    expect(detectBlocks(b.build())[0]).toMatchObject({ anchorDay: 7, firstDayCol: 3, headerRows: [17, 18], displacedCells: null });
  });

  it("lets the sheet name overrule a title year, and reports the disagreement", () => {
    const b = new SheetBuilder("2010");
    modernBlock(b, 6, 2010, 11, { title: "NOVEMBER 2018" });
    const [block] = detectBlocks(b.build());
    expect(block.year).toBe(2010);
    expect(block.defects).toEqual([expect.objectContaining({ kind: "title_year_mismatch", month: "2010-11" })]);
  });

  it("treats a lone December as a real month, not a carry-over", () => {
    const b = new SheetBuilder("1997");
    modernBlock(b, 1, 1997, 12);
    expect(detectBlocks(b.build())[0]).toMatchObject({ role: "primary", year: 1997 });
  });

  it("throws when months are not contiguous or a header has no title", () => {
    const gap = new SheetBuilder("2006");
    modernBlock(gap, 6, 2006, 1);
    modernBlock(gap, 18, 2006, 3);
    expect(() => detectBlocks(gap.build())).toThrow(/not contiguous/);

    const untitled = new SheetBuilder("2006");
    untitled.days("B6", range(1, daysIn(2006, 1)));
    expect(() => detectBlocks(untitled.build())).toThrow(/without a month title/);
  });
});
