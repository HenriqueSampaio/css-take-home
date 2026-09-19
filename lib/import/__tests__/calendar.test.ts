import { describe, expect, it } from "vitest";
import { detectBlocks } from "../blocks";
import { calendarDefects, mapDayColumns, validateWeekdays } from "../calendar";
import { col, modernBlock, range, SheetBuilder } from "./fixture";

function only(b: SheetBuilder) {
  const sheet = b.build();
  const block = detectBlocks(sheet)[0];
  return { sheet, block, columns: mapDayColumns(sheet, block) };
}

describe("mapDayColumns (the date rule)", () => {
  it("gives a printed June 31 no date, and reports it", () => {
    const b = new SheetBuilder("2008");
    modernBlock(b, 61, 2008, 6, { days: range(1, 31) });
    const { block, columns } = only(b);
    expect(columns).toHaveLength(31);
    expect(columns[29]).toMatchObject({ printed: 30, date: "2008-06-30" });
    expect(columns[30]).toMatchObject({ printed: 31, date: null, col: col("AF") });
    expect(calendarDefects(block, columns).map((d) => d.kind)).toEqual(["impossible_date"]);
  });

  it("knows Feb 29 is real in 2008 and not in 2009", () => {
    const leap = new SheetBuilder("2008");
    modernBlock(leap, 17, 2008, 2, { days: range(1, 29) });
    expect(only(leap).columns[28].date).toBe("2008-02-29");

    const common = new SheetBuilder("2009");
    modernBlock(common, 17, 2009, 2, { days: range(1, 29) });
    expect(only(common).columns[28].date).toBeNull();
  });

  it("trusts the printed number over the position: March 2011 prints 29 then 31", () => {
    const b = new SheetBuilder("2011");
    modernBlock(b, 28, 2011, 3, { firstCol: "C", days: [...range(1, 29), 31] });
    const { block, columns } = only(b);
    expect(columns).toHaveLength(30);
    expect(columns[29]).toMatchObject({ col: col("AF"), printed: 31, date: "2011-03-31" });
    expect(calendarDefects(block, columns).map((d) => d.kind)).toEqual(["skipped_day"]);
  });

  it("reports a header that stops short (January 2012 has 30 columns)", () => {
    const b = new SheetBuilder("2012");
    modernBlock(b, 6, 2012, 1, { firstCol: "G", days: range(1, 30) });
    const { block, columns } = only(b);
    expect(columns[columns.length - 1].date).toBe("2012-01-30");
    expect(calendarDefects(block, columns).map((d) => d.kind)).toEqual(["missing_days"]);
  });

  it("reads formula day cells as previous + 1", () => {
    const b = new SheetBuilder("1999");
    b.set("A1", "APRIL 1999").weekdays("B2", 1999, 4, range(1, 30)).days("B3", range(1, 30), true).berths(4);
    const { columns } = only(b);
    expect(columns.map((c) => c.printed)).toEqual(range(1, 30));
    expect(columns[29].date).toBe("1999-04-30");
  });

  it("implies days 1..6 to the left of a corrupted header that prints 7..N", () => {
    const b = new SheetBuilder("2010");
    b.set("A17", "NOVEMBER 2018").days("I17", range(7, 30)).berths(19);
    const { columns } = only(b);
    expect(columns[0]).toMatchObject({ col: col("C"), printed: 1, date: "2010-11-01", inferred: true });
    expect(columns[6]).toMatchObject({ col: col("I"), printed: 7, inferred: false });
    expect(columns[29]).toMatchObject({ col: col("AF"), date: "2010-11-30" });
  });
});

describe("validateWeekdays", () => {
  it("passes a correct block and ignores empty weekday cells", () => {
    const b = new SheetBuilder("2011");
    modernBlock(b, 95, 2011, 9, { firstCol: "C" });
    b.set("K96", null);
    const { sheet, block, columns } = only(b);
    expect(validateWeekdays(sheet, block, columns)).toEqual({ checked: 29, mismatches: 0, ok: true });
  });

  it("fails a carry-over block for the month it claims, and passes it for the sheet year's December", () => {
    const b = new SheetBuilder("2002");
    b.set("A1", "DECEMBER 2001").weekdays("B1", 2002, 12, range(1, 31)).days("B2", range(1, 31), true).berths(3);
    b.set("A12", "JANUARY 2002").weekdays("B12", 2002, 1, range(1, 31)).days("B13", range(1, 31)).berths(14);
    const sheet = b.build();
    const carry = detectBlocks(sheet)[0];
    const columns = mapDayColumns(sheet, carry);
    expect(carry.year).toBe(2001);
    expect(validateWeekdays(sheet, carry, columns).ok).toBe(false);
    expect(validateWeekdays(sheet, carry, columns, 2002).ok).toBe(true);
  });

  it("cannot validate a block with no weekday letters at all", () => {
    const b = new SheetBuilder("2010");
    b.set("A17", "NOVEMBER 2018").days("I17", range(7, 30)).set("I18", "S/V FAR LANTERN").berths(19);
    const { sheet, block, columns } = only(b);
    expect(validateWeekdays(sheet, block, columns)).toEqual({ checked: 0, mismatches: 0, ok: false });
  });
});
