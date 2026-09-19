import type { FillKey } from "./types";

/** The colour part of a spreadsheet fill, as ExcelJS and openpyxl both expose it. */
export type RawColor = { argb?: string; theme?: number; tint?: number; indexed?: number };
export type RawFill = { type?: string; pattern?: string; fgColor?: RawColor } | null | undefined;

/**
 * One canonical key per fill. Only solid pattern fills count: the workbook has a
 * stray `gray125` pattern and many `none` fills that must read as "unfilled".
 * Theme colours are never resolved to RGB (the file ships a custom indexed
 * palette, so resolving would invent precision we don't have).
 */
export function fillKey(fill: RawFill): FillKey | null {
  if (!fill || fill.type !== "pattern" || fill.pattern !== "solid") return null;
  const c = fill.fgColor;
  if (!c) return null;
  if (typeof c.argb === "string") return `rgb:${c.argb.slice(-6).toUpperCase()}`;
  if (typeof c.theme === "number") return `theme:${c.theme}:${formatTint(c.tint ?? 0)}`;
  if (typeof c.indexed === "number") return `indexed:${c.indexed}`;
  return null;
}

/** Tints arrive unrounded (-0.1499984740745262); two decimals identifies them, and "-0.00" is normalised. */
export function formatTint(tint: number): string {
  const s = tint.toFixed(2);
  return s === "-0.00" ? "0.00" : s;
}

export type FillClass = "background" | "structural" | "booking";

/** White-ish fills painted across whole rows: equivalent to no fill at all. */
const BACKGROUND: ReadonlySet<FillKey> = new Set([
  "theme:0:0.00",
  "rgb:FFFFFF",
  "indexed:9",
  "theme:0:-0.05",
  "rgb:F2F2F2",
  "rgb:BFBFBF",
]);

/**
 * Fills that decorate the sheet rather than mark a booking:
 * - `rgb:D9D9D9` / `theme:0:-0.15`: the full-month grey band on the North Pier Face row (2009-2019)
 * - `theme:3:-0.25` / `rgb:16365C`: the sheet banner colour, plus stray unlabelled 1-4 cell blobs
 */
const STRUCTURAL: ReadonlySet<FillKey> = new Set([
  "rgb:D9D9D9",
  "theme:0:-0.15",
  "theme:3:-0.25",
  "rgb:16365C",
]);

export function fillClass(key: FillKey | null): FillClass {
  if (key === null || BACKGROUND.has(key)) return "background";
  if (STRUCTURAL.has(key)) return "structural";
  return "booking";
}

/** True when the cell's fill marks berth occupancy. */
export const isBookingFill = (key: FillKey | null): key is FillKey => fillClass(key) === "booking";
