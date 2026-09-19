/**
 * The import rules, one sentence each, in the order the pipeline applies them.
 * Plain strings with no imports, so the About page can render them next to the
 * numbers in `import-report.json`. Each entry names the module that implements
 * it; if a rule here stops being true, that module's tests should fail first.
 */
export type ImportRule = { id: string; module: string; rule: string };

export const IMPORT_RULES: readonly ImportRule[] = [
  { id: "sheets", module: "pipeline.ts", rule: "Sheets named like a year (1997 to 2019) are schedule grids, Science and Yachts are the vessel length lists, and every other sheet is ignored with a stated reason." },
  { id: "blocks", module: "blocks.ts", rule: "A month block starts at any row where some cell in columns B to L begins at least 20 consecutive day numbers; its title is in column A of that row or the two rows above, and its year is always the sheet name." },
  { id: "carry-over", module: "carryover.ts", rule: "A December block that opens a sheet ahead of January is a copy of the previous year: it is compared with the real December and reported, never imported." },
  { id: "dates", module: "calendar.ts", rule: "A column's date is the day number printed above it (a formula cell means previous + 1); a printed number that is not a real day of that month gives the column no date." },
  { id: "weekdays", module: "calendar.ts", rule: "The weekday letters under each header are checked against the real calendar as a free test that the block is the month we think it is." },
  { id: "corrupt-headers", module: "blocks.ts", rule: "The two 2010 blocks whose headers are corrupted are dated from their printed 7..N; the same shift pushed the first berth row's cells for days 1 to 6 up into the weekday row, so they are read from there; everything else written in the header rows is quarantined in the report, and every booking in these blocks goes to review." },
  { id: "rows", module: "rows.ts", rule: "Only rows whose column A reads like \"North Pier West - 410'\" are berths; other named rows are areas and unnamed rows are orphans, both listed in the report and not imported; a berth listed twice in one block keeps both rows." },
  { id: "runs", module: "runs.ts", rule: "A booking bar is a merged range with a colour or a label, otherwise an unbroken stretch of one booking colour (a merge edge always ends a stretch), otherwise an unbroken stretch of one decorative colour with a vessel, event or closure name written on it, otherwise a single cell with such a name and no colour of its own." },
  { id: "fills", module: "fills.ts", rule: "White-ish fills are blank paper; the banner blue and the grey are decoration wherever nothing is written on them, and bare they never count as a booking or a closure; in the sheets that paint North Pier Face grey all month, a name on that grey band is a one-day entry, not a bar." },
  { id: "edge-blobs", module: "runs.ts", rule: "Bare banner-colour blobs sit at the first or last days of many months: they are never occupancy and never join two stays, but a bar that runs straight into one is flagged, naming the stay on the far side when the join rule says the two could be one; a named bar in the banner colour itself that ends within four cells of a month edge is kept whole and flagged." },
  { id: "labels", module: "labels.ts", rule: "Text that starts with a vessel type prefix is a vessel; everything else must be in the closed list of closures, events and notes; bare numbers are junk; any other text is kept as an event and flagged." },
  { id: "segments", module: "segments.ts", rule: "The name can sit anywhere in its bar and may repeat; notes ride along with it; two different names in one bar are split back-to-back at the second name and flagged, never treated as an overlap; a bar with no name is imported as unlabelled and sent to review." },
  { id: "stitching", module: "stitch.ts", rule: "Two bars that touch (month end to day 1 of the next month on the same berth, or side by side in one row) are one stay when they carry the same name, or when exactly one is unnamed and both have the identical colour; different names never join." },
  { id: "vessels", module: "registry.ts", rule: "A vessel is identified by its name without the type prefix; its length comes from column A of the registry sheets and is verified (same prefix), probable (different prefix), conflict (two lengths, or an LOA note that disagrees: no length is chosen) or unknown." },
  { id: "audit", module: "audit.ts", rule: "Any two imported stays that share a berth-day are both sent to review with an overlap issue naming the other; the importer never picks a winner." },
  { id: "status", module: "emit.ts", rule: "A reservation needs review exactly when it has a blocking issue (overlap, unlabelled, calendar defect); ambiguous extents and length conflicts are warnings on confirmed rows." },
  { id: "ids", module: "emit.ts", rule: "Ids are hashes of the source cells, arrays are sorted by id and nothing is timestamped, so importing twice gives byte-identical files." },
  { id: "reconciliation", module: "pipeline.ts", rule: "Every cell with a value in the year sheets is counted exactly once as imported, attached as a note, or not imported for a named reason, and the import fails if the totals do not balance." },
];
