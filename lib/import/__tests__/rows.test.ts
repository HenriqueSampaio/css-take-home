import { describe, expect, it } from "vitest";
import { detectBlocks } from "../blocks";
import { BERTHS, classifyRows, parseBerthRow } from "../rows";
import { GREEN, GREY_BAND, modernBlock, SheetBuilder, WHITE } from "./fixture";

describe("parseBerthRow", () => {
  it("reads name and length, tolerating spacing around the dash", () => {
    expect(parseBerthRow("North Pier West - 410'")).toMatchObject({ id: "north-pier-west", lengthFt: 410, sortOrder: 1 });
    expect(parseBerthRow("South Float East -90'")).toMatchObject({ id: "south-float-east", lengthFt: 90 });
    expect(BERTHS.map((b) => b.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("returns null for rows that name no length", () => {
    expect(parseBerthRow("Small craft slips (institution boats)")).toBeNull();
    expect(parseBerthRow("North Finger Piers:")).toBeNull();
  });
  it("refuses a berth it does not know instead of inventing one", () => {
    expect(() => parseBerthRow("West Dolphin - 120'")).toThrow(/Unknown berth/);
    expect(() => parseBerthRow("North Pier West - 400'")).toThrow(/Unknown berth/);
  });
});

describe("classifyRows", () => {
  it("separates berth, area and orphan rows, and skips the header and blank paper", () => {
    const b = new SheetBuilder("2014");
    const first = modernBlock(b, 6, 2014, 1);
    b.set(`A${first + 6}`, "North Finger Piers:").set(`D${first + 6}`, "M/V Golden Current");
    b.set(`A${first + 7}`, "Small craft slips (institution boats)");
    b.set(`G${first + 8}`, "R/V Amber Tide"); // orphan: a label with no column A
    b.fill(`B${first + 9}:F${first + 9}`, WHITE); // background only: blank paper
    b.fill(`B${first + 10}:C${first + 10}`, GREY_BAND); // structural only: still blank
    b.fill(`B${first + 11}:C${first + 11}`, GREEN); // orphan: a booking colour with no column A
    const sheet = b.build();
    const rows = classifyRows(sheet, detectBlocks(sheet)[0]);
    expect(rows.map((r) => r.kind)).toEqual(["berth", "berth", "berth", "berth", "berth", "berth", "area", "area", "orphan", "orphan"]);
    expect(rows[6]).toMatchObject({ kind: "area", name: "North Finger Piers:" });
    expect(rows.filter((r) => r.kind === "orphan").map((r) => r.row)).toEqual([first + 8, first + 11]);
  });

  it("puts duplicate berth rows on the same berth, numbering the physical rows", () => {
    const b = new SheetBuilder("1998");
    b.set("A90", "SEPTEMBER 1998").weekdays("B90", 1998, 9, [...Array(30).keys()].map((i) => i + 1)).days("B91", [...Array(30).keys()].map((i) => i + 1), true);
    b.berths(92, ["North Pier West - 410'", "North Pier West - 410'", "North Pier Face - 75'"]);
    const sheet = b.build();
    const rows = classifyRows(sheet, detectBlocks(sheet)[0]);
    expect(rows.map((r) => (r.kind === "berth" ? [r.row, r.berth.id, r.ordinal] : null))).toEqual([
      [92, "north-pier-west", 0],
      [93, "north-pier-west", 1],
      [94, "north-pier-face", 0],
    ]);
  });
});
