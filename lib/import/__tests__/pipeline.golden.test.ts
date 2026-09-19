/**
 * Golden test: the REAL workbook through the whole pipeline. Skipped when the
 * workbook is not checked out. The inline snapshot is a compact summary of the
 * report, so any change to an import rule shows up as a reviewable diff here.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { isISODate, toEpochDay } from "../../domain/dates";
import { findOverlappingPairs } from "../../domain/ranges";
import { validateSeed } from "../../seed/validate";
import { runImport, type ImportResult } from "../pipeline";
import { readWorkbook } from "../read-workbook";

const WORKBOOK = resolve(__dirname, "../../../data/source/Dock Schedule - Synthetic Sample.xlsx");

describe.skipIf(!existsSync(WORKBOOK))("legacy workbook (golden)", () => {
  let result: ImportResult;
  beforeAll(async () => {
    result = runImport(await readWorkbook(WORKBOOK, { maxCol: Number.MAX_SAFE_INTEGER }), { file: "Dock Schedule - Synthetic Sample.xlsx", sha256: "" });
  }, 60_000);

  it("satisfies the seed contract", () => {
    expect(validateSeed(result.seed)).toEqual([]);
  });

  it("accounts for every valued cell of the year sheets", () => {
    const rec = result.report.reconciliation;
    expect(rec.unaccounted).toEqual([]);
    expect(rec.doubleCounted).toEqual([]);
    expect(rec.imported + rec.asNotes + rec.notImported).toBe(rec.labelCells);
    expect(rec.balanced).toBe(true);
  });

  it("finds 272 blocks, 3 of them carry-over copies that are reported, not imported", () => {
    expect(result.report.blocks).toMatchObject({ total: 272, primary: 269, carryOver: 3 });
    expect(result.report.notImported.carryOver.map((c) => `${c.sheet}:${c.claims}`)).toEqual(["2002:2001-12", "2003:2002-12", "2004:2003-12"]);
    for (const c of result.report.notImported.carryOver) expect([c.weekdayMatchesClaimedMonth, c.weekdayMatchesSheetYearDecember]).toEqual([false, true]);
    // Nothing dated in year Y may cite a cell of another year's sheet: the December copies stayed out.
    for (const r of result.seed.reservations) {
      for (const run of r.sourceRef.split(";")) {
        const sheetYear = run.split("!")[0];
        expect(r.startDate.slice(0, 4) <= sheetYear && sheetYear <= r.endDate.slice(0, 4), `${r.id} ${r.sourceRef}`).toBe(true);
      }
    }
  });

  it("validates every primary block's weekday letters except the two corrupted headers", () => {
    expect(result.report.blocks.weekdayValidated).toBe(267);
    expect(result.report.blocks.weekdayUnverifiable).toEqual(["2010 2010-11", "2010 2010-12"]);
    expect(result.report.blocks.defects.filter((d) => d.kind === "weekday_mismatch")).toEqual([]);
  });

  it("flags the 1998 double-booking on duplicate North Pier West rows", () => {
    const overlap = result.seed.issues.find((i) => i.type === "overlap" && i.sourceRef?.includes("1998!Q92"));
    expect(overlap).toBeDefined();
    const self = result.seed.reservations.find((r) => r.id === overlap?.reservationId);
    const other = result.seed.reservations.find((r) => r.id === overlap?.relatedReservationIds[0]);
    expect(self).toMatchObject({ berthId: "north-pier-west", startDate: "1998-09-16", endDate: "1998-09-21", status: "needs_review", rawLabel: "OSV Wild Star" });
    expect(other).toMatchObject({ berthId: "north-pier-west", startDate: "1998-09-14", endDate: "1998-09-20", status: "needs_review", rawLabel: "Barge Salt Dory" });
  });

  it("stitches R/V CLEAR SEXTANT into one 14-month stay across the 2007/2008 sheets", () => {
    const vessel = result.seed.vessels.find((v) => v.nameKey === "CLEAR SEXTANT");
    const stay = result.seed.reservations.find((r) => r.vesselId === vessel?.id && r.berthId === "north-pier-west" && r.startDate === "2007-01-01");
    expect(stay).toMatchObject({ endDate: "2008-02-29", status: "confirmed" });
    expect(stay?.sourceRef.split(";")).toHaveLength(14);
  });

  const stayFrom = (ref: string) => result.seed.reservations.find((r) => r.sourceRef.split(";").includes(ref));
  const issuesOf = (id: string | undefined) => result.seed.issues.filter((i) => i.reservationId === id);

  it("reads M/V CORAL LANTERN, painted in the banner colour, as one 45-day stay (2005!B108:AF108)", () => {
    expect(stayFrom("2005!B108:AF108")).toMatchObject({ berthId: "north-pier-west", startDate: "2005-09-23", endDate: "2005-11-06", status: "confirmed", rawLabel: "M/V CORAL LANTERN", sourceRef: "2005!X97:AE97;2005!B108:AF108;2005!B119:G119" });
    expect(issuesOf(stayFrom("2005!B108:AF108")?.id)).toEqual([]);
    // The same rule elsewhere: grey bars in 2001, and a banner-blue bar that carries on in a booking colour.
    expect(stayFrom("2001!V71:Y71")).toMatchObject({ berthId: "north-pier-face", startDate: "2001-07-21", endDate: "2001-07-24" });
    expect(stayFrom("2006!B85:I85")).toMatchObject({ startDate: "2006-07-31", endDate: "2006-08-08", sourceRef: "2006!AF74;2006!B85:I85" });
    expect(stayFrom("2006!S85:Z85")).toMatchObject({ startDate: "2006-08-18", endDate: "2006-09-05", sourceRef: "2006!S85:Z85;2006!AA85:AF85;2006!B97:F97" });
    // The first cell alone used to be imported as a one-day stay: no such row is left behind.
    for (const cell of ["2005!X97", "2005!B108", "2005!B119", "2001!V71", "2006!B85", "2006!S85"]) expect(stayFrom(cell), cell).toBeUndefined();
  });

  it("keeps a banner-colour bar that ends within four cells of a month edge, and says the tail is in doubt", () => {
    for (const [ref, start, end] of [["2004!AD64:AF64", "2004-05-29", "2004-05-31"], ["2005!AB54:AF54", "2005-05-27", "2005-05-31"]]) {
      expect(stayFrom(ref)).toMatchObject({ startDate: start, endDate: end, status: "confirmed" });
      expect(issuesOf(stayFrom(ref)?.id).map((i) => `${i.type}/${i.reason}`)).toEqual(["ambiguous_extent/decorative_colour_edge"]);
    }
  });

  it("still reads a name on the grey North Pier Face band as one day (2011!AB31 on a full-month band)", () => {
    const star = stayFrom("2011!AB31");
    expect(star).toMatchObject({ berthId: "north-pier-face", rawLabel: "R/V Quiet Star" });
    expect(star?.startDate).toBe(star?.endDate);
    expect(issuesOf(star?.id).map((i) => i.reason)).toContain("label_unfilled");
  });

  it("imports the day 1-6 cells that the 2010 header corruption pushed one row up", () => {
    const december = stayFrom("2010!H130:R130");
    expect(december).toMatchObject({ berthId: "north-pier-west", startDate: "2010-12-01", endDate: "2010-12-17", status: "needs_review", sourceRef: "2010!B129:G129;2010!H130:R130" });
    expect(issuesOf(december?.id).find((i) => i.reason === "corrupt_header")?.detail).toContain("2010!B129:G129 was read as part of this stay");
    // Oct 31 (2010!AF108) continues on Nov 1 in the displaced cell C118, which used to be listed as header junk.
    expect(stayFrom("2010!C118")).toMatchObject({ startDate: "2010-10-31", endDate: "2010-11-01", status: "needs_review", rawLabel: "R/V GOLDEN COMPASS", sourceRef: "2010!AF108;2010!C118" });
    expect(result.report.notImported.corruptHeaderLabels.entries.map((e) => e.ref)).not.toContain("2010!C118");
    expect(result.report.blocks.defects.filter((d) => d.kind === "displaced_berth_cells").map((d) => d.detail.match(/up into (\S+);/)?.[1])).toEqual(["2010!C118:H118", "2010!B129:G129"]);
  });

  it("leaves month-edge blobs out of occupancy, but warns on the bar they touch and names the stay beyond (2015!H141)", () => {
    const december = stayFrom("2015!I141:X141");
    const november = stayFrom("2015!Z129:AK129");
    expect(december).toMatchObject({ startDate: "2015-12-02", status: "confirmed" });
    expect(november).toMatchObject({ endDate: "2015-11-30", status: "confirmed" });
    expect(issuesOf(december?.id)).toEqual([expect.objectContaining({ type: "ambiguous_extent", reason: "decorative_overpaint", severity: "warning", relatedReservationIds: [november?.id] })]);
    expect(issuesOf(december?.id)[0].detail).toContain("1 banner-coloured cell at the start of the month (2015!H141, 2015-12-01)");
    // Ground truth: CLEAR SEXTANT's 14 months are bounded by two such blobs and stay exactly as they are; its neighbours point at it.
    const sextant = stayFrom("2007!B8:AF8");
    expect(sextant).toMatchObject({ startDate: "2007-01-01", endDate: "2008-02-29", status: "confirmed" });
    expect(issuesOf(sextant?.id)).toEqual([]);
    for (const ref of ["2006!O130:AD130", "2008!E30:S30"]) expect(issuesOf(stayFrom(ref)?.id).find((i) => i.reason === "decorative_overpaint")?.relatedReservationIds).toEqual([sextant?.id]);
    // Every blob that touches a bar raised a warning, and none of them carries a booking.
    expect(result.seed.issues.filter((i) => i.reason === "decorative_overpaint")).toHaveLength(result.report.runs.edgeBlobs.touchingBar);
    for (const r of result.seed.reservations) expect(r.sourceRef, r.id).not.toMatch(/(^|;)2015!H141($|;)|2011!C68:D68|2008!B30:D30/);
  });

  it("occupies 10,852 distinct berth-days", () => {
    const days = new Set<string>();
    for (const r of result.seed.reservations) for (let d = toEpochDay(r.startDate); d <= toEpochDay(r.endDate); d++) days.add(`${r.berthId}|${d}`);
    expect(days.size).toBe(10852);
  });

  it("gives every reservation real dates inside the workbook's span", () => {
    for (const r of result.seed.reservations) {
      expect(isISODate(r.startDate) && isISODate(r.endDate), r.id).toBe(true);
      expect(r.startDate <= r.endDate, r.id).toBe(true);
      expect(r.startDate >= "1997-08-01" && r.endDate <= "2019-12-31", r.id).toBe(true);
    }
  });

  it("never confirms two overlapping stays on one berth", () => {
    const confirmed = result.seed.reservations.filter((r) => r.status === "confirmed").map((r) => ({ id: r.id, berthId: r.berthId, start: r.startDate, end: r.endDate }));
    expect(findOverlappingPairs(confirmed, (r) => r.berthId)).toEqual([]);
  });

  it("never turns a shared bar into an overlap", () => {
    const shared = new Set(result.seed.issues.filter((i) => i.reason === "shared_bar").map((i) => i.reservationId));
    const overlapping = new Set(result.seed.issues.filter((i) => i.type === "overlap").map((i) => i.reservationId));
    expect([...shared].filter((id) => overlapping.has(id))).toEqual([]);
  });

  it("matches the recorded summary", () => {
    const { blocks, runs, stitching, imported, issues, vesselLinking, fit, notImported, reconciliation } = result.report;
    expect({
      blocks: { total: blocks.total, primary: blocks.primary, carryOver: blocks.carryOver, weekdayValidated: blocks.weekdayValidated, defects: blocks.defects.map((d) => `${d.month} ${d.kind}`) },
      runs,
      stitching: { ...stitching, longestChain: stitching.longestChain?.segments },
      imported,
      issues,
      vesselLinking: { ...vesselLinking, registryConflicts: vesselLinking.registryConflicts.map((c) => `${c.vessel} ${c.candidates.join("/")}`), topUnlinked: vesselLinking.topUnlinked.slice(0, 3) },
      fit: { ...fit, top: fit.top.slice(0, 3) },
      notImported: {
        areaRows: notImported.areas.rows,
        areaEntries: notImported.areas.entries.length,
        orphanRows: notImported.orphanRows.rows,
        orphanEntries: notImported.orphanRows.entries.length,
        corruptHeaderLabels: notImported.corruptHeaderLabels.count,
        outsideDayColumns: notImported.outsideDayColumns.count,
        standaloneNotes: notImported.standaloneNotes.count,
        junkNumerics: notImported.junkNumerics.count,
        undatedColumnLabels: notImported.undatedColumnLabels.count,
        carryOver: notImported.carryOver.map((c) => `${c.claims}: ${c.segmentsFound} segments, ${c.identicalSegments} identical`),
      },
      reconciliation: { ...reconciliation, unaccounted: reconciliation.unaccounted.length, doubleCounted: reconciliation.doubleCounted.length },
    }).toMatchInlineSnapshot(`
      {
        "blocks": {
          "carryOver": 3,
          "defects": [
            "2008-06 impossible_date",
            "2009-02 impossible_date",
            "2010-11 weekday_row_missing",
            "2010-11 displaced_header",
            "2010-11 title_year_mismatch",
            "2010-11 displaced_berth_cells",
            "2010-12 weekday_row_missing",
            "2010-12 displaced_header",
            "2010-12 title_year_mismatch",
            "2010-12 displaced_berth_cells",
            "2011-03 skipped_day",
            "2012-01 missing_days",
            "2013-03 skipped_day",
          ],
          "primary": 269,
          "total": 272,
          "weekdayValidated": 267,
        },
        "fit": {
          "resolvableReservations": 469,
          "top": [
            {
              "berth": "South Float East",
              "berthFt": 90,
              "count": 46,
              "vessel": "S/V Far Horizon",
              "vesselFt": 170,
            },
            {
              "berth": "North Pier Face",
              "berthFt": 75,
              "count": 14,
              "vessel": "R/V Long Anchor",
              "vesselFt": 170,
            },
            {
              "berth": "Inner Channel",
              "berthFt": 55,
              "count": 4,
              "vessel": "M/V Iron Heron",
              "vesselFt": 100,
            },
          ],
          "unknownLengthReservations": 1412,
          "violations": 90,
        },
        "imported": {
          "berths": 6,
          "busiestMonth": "2010-08",
          "busiestMonthReservationDays": 114,
          "dateRange": {
            "first": "1997-08-01",
            "last": "2019-12-31",
          },
          "reservations": {
            "byBerth": {
              "inner-channel": 67,
              "north-pier-east": 517,
              "north-pier-face": 125,
              "north-pier-west": 516,
              "south-float-east": 352,
              "south-float-west": 434,
            },
            "byKind": {
              "closure": 20,
              "event": 110,
              "vessel": 1881,
            },
            "byYear": {
              "1997": 30,
              "1998": 67,
              "1999": 66,
              "2000": 70,
              "2001": 96,
              "2002": 135,
              "2003": 105,
              "2004": 79,
              "2005": 62,
              "2006": 54,
              "2007": 45,
              "2008": 47,
              "2009": 93,
              "2010": 158,
              "2011": 157,
              "2012": 50,
              "2013": 101,
              "2014": 109,
              "2015": 127,
              "2016": 135,
              "2017": 109,
              "2018": 71,
              "2019": 45,
            },
            "confirmed": 1898,
            "needsReview": 113,
            "total": 2011,
          },
          "vessels": {
            "fromGrid": 412,
            "registryOnly": 98,
          },
        },
        "issues": {
          "byReason": {
            "ambiguous_extent/decorative_colour_edge": 2,
            "ambiguous_extent/decorative_overpaint": 114,
            "ambiguous_extent/label_unfilled": 120,
            "ambiguous_extent/merge_before_month_start": 10,
            "ambiguous_extent/merge_past_month_end": 2,
            "ambiguous_extent/shared_bar": 23,
            "calendar_defect/corrupt_header": 20,
            "calendar_defect/impossible_date": 1,
            "length_conflict/registry_conflict": 7,
            "overlap/duplicate_berth_row": 8,
            "unlabelled/no_label": 71,
            "unlabelled/notes_only": 18,
          },
          "byType": {
            "ambiguous_extent": 271,
            "calendar_defect": 21,
            "length_conflict": 7,
            "overlap": 8,
            "unlabelled": 89,
          },
          "overlapPairs": 4,
          "total": 396,
        },
        "notImported": {
          "areaEntries": 61,
          "areaRows": 163,
          "carryOver": [
            "2001-12: 7 segments, 1 identical",
            "2002-12: 4 segments, 2 identical",
            "2003-12: 3 segments, 0 identical",
          ],
          "corruptHeaderLabels": 61,
          "junkNumerics": 1,
          "orphanEntries": 288,
          "orphanRows": 120,
          "outsideDayColumns": 55,
          "standaloneNotes": 13,
          "undatedColumnLabels": 0,
        },
        "reconciliation": {
          "asNotes": 27,
          "balanced": true,
          "doubleCounted": 0,
          "imported": 2154,
          "labelCells": 21297,
          "notImported": 19116,
          "notImportedByReason": {
            "areaRow": 61,
            "carryOverBlock": 14,
            "corruptHeaderRow": 61,
            "gridFurniture": 18623,
            "junkNumeric": 1,
            "orphanRow": 288,
            "outsideDayColumns": 55,
            "standaloneNote": 13,
          },
          "unaccounted": 0,
        },
        "runs": {
          "bookingFillCellsOutsideDayColumns": 17,
          "decorativeColourBars": 40,
          "edgeBlobs": {
            "cells": 677,
            "cellsTouchingBar": 263,
            "count": 290,
            "touchingBar": 114,
          },
          "emptyMergesDropped": 43,
          "fillRuns": 1449,
          "labelOffFirstCell": 42,
          "labelOnly": 123,
          "merges": 609,
          "mergesBeforeMonthStart": 15,
          "mergesInYearSheets": 749,
          "mergesOffBerthRows": 96,
          "mergesOutsideDayColumns": 1,
          "mergesPastMonthEnd": 2,
          "repeatedLabelRuns": 55,
          "sharedBarRuns": 11,
          "total": 2181,
          "undatedRunsDropped": 0,
        },
        "stitching": {
          "apartByEdgeBlob": 56,
          "crossSheet": 16,
          "joins": 140,
          "longestChain": 14,
          "notJoinedBothUnlabelled": 2,
          "notJoinedDifferentFill": 2,
          "notJoinedDifferentLabels": 18,
          "sameRowJoins": 42,
          "segments": 2193,
          "stays": 2011,
        },
        "vesselLinking": {
          "bookingCoveragePct": 24.9,
          "conflict": 7,
          "probable": 44,
          "registryColumnAIgnored": 45,
          "registryConflicts": [
            "M/V Deep Reef 24/100",
            "R/V High Reef 32/72",
            "R/V High Sound 32/65",
            "R/V Iron Ketch 46/65",
            "Barge Northern Marlin 24/65",
            "M/Y Western Strand 52/65/145",
            "OSV Wild Star 24/145",
          ],
          "registryEntries": 166,
          "topUnlinked": [
            {
              "bookings": 267,
              "name": "R/V Long Ketch",
            },
            {
              "bookings": 152,
              "name": "R/V Golden Compass",
            },
            {
              "bookings": 104,
              "name": "OSV Amber Reef",
            },
          ],
          "unknown": 347,
          "verified": 112,
        },
      }
    `);
  });
});
