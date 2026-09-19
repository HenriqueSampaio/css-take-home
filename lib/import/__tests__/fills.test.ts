import { describe, expect, it } from "vitest";
import { fillClass, fillKey, formatTint, isBandGrey, isBannerFill, isBookingFill } from "../fills";

const solid = (fgColor: object) => ({ type: "pattern", pattern: "solid", fgColor });

describe("fill keys", () => {
  it("rounds unrounded theme tints to two decimals and never prints -0.00", () => {
    expect(fillKey(solid({ theme: 0, tint: -0.1499984740745262 }))).toBe("theme:0:-0.15");
    expect(fillKey(solid({ theme: 3, tint: 0.5999938962981048 }))).toBe("theme:3:0.60");
    expect(formatTint(-0.0001)).toBe("0.00");
    expect(fillKey(solid({ theme: 4 }))).toBe("theme:4:0.00");
  });

  it("keeps the last six hex digits of an ARGB colour, and indexed colours as they are", () => {
    expect(fillKey(solid({ argb: "FF60497A" }))).toBe("rgb:60497A");
    expect(fillKey(solid({ argb: "ff00b050" }))).toBe("rgb:00B050");
    expect(fillKey(solid({ indexed: 44 }))).toBe("indexed:44");
  });

  it("reads anything that is not a solid pattern as unfilled", () => {
    expect(fillKey(null)).toBeNull();
    expect(fillKey({ type: "pattern", pattern: "none" })).toBeNull();
    expect(fillKey({ type: "pattern", pattern: "gray125", fgColor: { argb: "FF000000" } })).toBeNull();
    expect(fillKey(solid({}))).toBeNull();
  });
});

describe("fill classes", () => {
  it("treats no fill and white-ish row paint as background", () => {
    for (const key of [null, "theme:0:0.00", "rgb:FFFFFF", "indexed:9", "theme:0:-0.05", "rgb:F2F2F2", "rgb:BFBFBF"]) expect(fillClass(key)).toBe("background");
  });
  it("treats the grey North Pier Face band and the banner colour as structural, never as a booking", () => {
    for (const key of ["rgb:D9D9D9", "theme:0:-0.15", "theme:3:-0.25", "rgb:16365C"]) {
      expect(fillClass(key)).toBe("structural");
      expect(isBookingFill(key)).toBe(false);
    }
  });
  it("tells the two kinds of decoration apart: banner blue makes month-edge blobs, grey makes the Face band", () => {
    expect(["theme:3:-0.25", "rgb:16365C"].map((key) => [isBannerFill(key), isBandGrey(key)])).toEqual([[true, false], [true, false]]);
    expect(["rgb:D9D9D9", "theme:0:-0.15"].map((key) => [isBannerFill(key), isBandGrey(key)])).toEqual([[false, true], [false, true]]);
    for (const key of [null, "theme:0:0.00", "rgb:00B050", "theme:3:-0.50"]) expect([isBannerFill(key), isBandGrey(key)]).toEqual([false, false]);
  });
  it("treats every other colour as a booking", () => {
    for (const key of ["indexed:44", "rgb:00B050", "theme:4:0.00", "theme:5:0.40"]) expect(isBookingFill(key)).toBe(true);
  });
});
