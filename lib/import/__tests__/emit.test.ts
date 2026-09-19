import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateSeed } from "../../seed/validate";
import { issueId, reservationId, sortedCounts, stableStringify } from "../emit";
import { runImport } from "../pipeline";
import type { SheetMatrix } from "../types";
import { BANNER, GREEN, GREY_BAND, modernBlock, range, RED, SheetBuilder } from "./fixture";

/** A two-year workbook small enough to read: one December, one January, a registry and an ignored sheet. */
function workbook(): SheetMatrix[] {
  const y1998 = new SheetBuilder("1998");
  y1998.set("A1", "DECEMBER 1998").weekdays("B2", 1998, 12, range(1, 31)).days("B3", range(1, 31), true);
  y1998.berths(4, ["North Pier West - 410'", "North Pier West - 410'", "North Pier East - 240'"]);
  y1998.fill("U4:AF4", GREEN).set("V4", "Barge Salt Dory", GREEN); // Dec 20-31, label off the first cell
  y1998.fill("W5:Y5", RED).set("W5", "OSV Wild Star", RED); // duplicate berth row: Dec 22-24 collides
  y1998.fill("F6:G6", GREEN); // unlabelled
  y1998.set("P8", "R/V Amber Tide"); // orphan row

  const y1999 = new SheetBuilder("1999");
  y1999.set("A1", "Harborview Marine Research Center");
  const first = modernBlock(y1999, 6, 1999, 1);
  y1999.fill(`B${first}:K${first}`, GREEN); // Jan 1-10, unlabelled, same colour: continues Salt Dory
  y1999.fill(`B${first + 2}:Y${first + 2}`, RED).set(`B${first + 2}`, "Tug WESTERN CURRENT", RED).set(`D${first + 2}`, "OSV Iron Meridian", RED).set(`E${first + 2}`, "Fueling @0800", RED);
  y1999.set(`J${first + 3}`, "ETD PM").set(`K${first + 3}`, 1400).set(`M${first + 3}`, "Holiday");
  y1999.set(`A${first + 6}`, "Small craft slips (institution boats)").set(`D${first + 6}`, "M/V Golden Current");

  const science = new SheetBuilder("Science").set("A1", "VESSEL").set("A2", "Barge Salt Dory 85'").set("A3", "R/V High Reef 32'").set("A4", "R/V High Reef 72'").build();
  const tours = new SheetBuilder("Tours").set("A1", "Tour date").build();
  return [y1998.build(), y1999.build(), science, tours];
}

describe("ids", () => {
  it("derive from where a row came from, so they survive a re-import", () => {
    const expected = createHash("sha256").update("1998!U4:AF4#0").digest("hex").slice(0, 10);
    expect(reservationId("1998!U4:AF4", 0)).toBe(`r_${expected}`);
    expect(reservationId("1998!U4:AF4", 1)).not.toBe(reservationId("1998!U4:AF4", 0));
    expect(issueId("overlap", "r_abc", "duplicate_berth_row", 0)).toMatch(/^i_[0-9a-f]{10}$/);
    expect(issueId("overlap", "r_abc", null, 0)).not.toBe(issueId("overlap", "r_abc", null, 1));
  });
});

describe("stableStringify", () => {
  it("writes two-space JSON with a trailing newline, and count maps with sorted keys", () => {
    expect(stableStringify({ b: 1, a: [1, 2] })).toBe('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}\n');
    expect(Object.keys(sortedCounts({ zulu: 1, alpha: 2, mike: 3 }))).toEqual(["alpha", "mike", "zulu"]);
  });
});

describe("runImport on a small workbook", () => {
  const { seed, report } = runImport(workbook(), { file: "fixture.xlsx", sha256: "0".repeat(64) });
  const byRef = (ref: string) => seed.reservations.find((r) => r.sourceRef.startsWith(ref));

  it("produces a valid seed and a balanced ledger", () => {
    expect(validateSeed(seed)).toEqual([]);
    expect(report.reconciliation).toMatchObject({ balanced: true, unaccounted: [], doubleCounted: [], imported: 5, asNotes: 1 });
    expect(report.reconciliation.notImportedByReason).toMatchObject({ areaRow: 1, orphanRow: 1, standaloneNote: 1, junkNumeric: 1 });
    expect(report.sheets.ignored.map((s) => s.name)).toEqual(["Tours"]);
  });

  it("is byte-identical across runs and does not depend on sheet order", () => {
    const again = runImport(workbook(), { file: "fixture.xlsx", sha256: "0".repeat(64) });
    const shuffled = runImport([...workbook()].reverse(), { file: "fixture.xlsx", sha256: "0".repeat(64) });
    for (const other of [again, shuffled]) {
      expect(stableStringify(other.seed)).toBe(stableStringify(seed));
      expect(stableStringify(other.report)).toBe(stableStringify(report));
    }
  });

  it("sorts every emitted array by id", () => {
    for (const rows of [seed.vessels, seed.reservations, seed.issues]) expect(rows.map((r) => r.id)).toEqual(rows.map((r) => r.id).sort());
    expect(seed.berths.map((b) => b.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("stitches December into January and names the stay after its first source run", () => {
    const stay = byRef("1998!U4:AF4");
    expect(stay).toMatchObject({ id: reservationId("1998!U4:AF4", 0), kind: "vessel", vesselId: "v_salt-dory", startDate: "1998-12-20", endDate: "1999-01-10", sourceRef: "1998!U4:AF4;1999!B8:K8", rawLabel: "Barge Salt Dory" });
    expect(report.stitching).toMatchObject({ joins: 1, crossSheet: 1 });
  });

  it("flags both sides of a duplicate-row collision and confirms neither", () => {
    const dory = byRef("1998!U4:AF4");
    const star = byRef("1998!W5:Y5");
    expect([dory?.status, star?.status]).toEqual(["needs_review", "needs_review"]);
    const overlaps = seed.issues.filter((i) => i.type === "overlap");
    expect(overlaps.map((i) => [i.reservationId, i.relatedReservationIds]).sort()).toEqual([[dory?.id, [star?.id]], [star?.id, [dory?.id]]].sort());
    expect(overlaps.every((i) => i.severity === "blocking" && i.reason === "duplicate_berth_row")).toBe(true);
  });

  it("gives an unlabelled bar a title and a blocking issue", () => {
    const bar = byRef("1998!F6:G6");
    expect(bar).toMatchObject({ kind: "event", title: "Unlabelled legacy booking", vesselId: null, status: "needs_review", rawLabel: null });
    expect(seed.issues.find((i) => i.reservationId === bar?.id)).toMatchObject({ type: "unlabelled", severity: "blocking" });
  });

  it("splits a shared bar into confirmed back-to-back stays with a warning each, notes attached", () => {
    const tug = byRef("1999!B10:C10");
    const osv = byRef("1999!D10:Y10");
    expect(tug).toMatchObject({ startDate: "1999-01-01", endDate: "1999-01-02", status: "confirmed", notes: "" });
    expect(osv).toMatchObject({ startDate: "1999-01-03", endDate: "1999-01-24", status: "confirmed", notes: "Fueling @0800" });
    const warnings = seed.issues.filter((i) => i.reason === "shared_bar");
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatchObject({ type: "ambiguous_extent", severity: "warning" });
    expect(warnings[0].detail).toContain("possible double-booking or handover");
  });

  it("imports a label with no colour as a one-day event, flagged", () => {
    const holiday = byRef("1999!M11");
    expect(holiday).toMatchObject({ kind: "event", title: "Holiday", startDate: "1999-01-12", endDate: "1999-01-12", status: "confirmed" });
    expect(seed.issues.find((i) => i.reservationId === holiday?.id)).toMatchObject({ type: "ambiguous_extent", reason: "label_unfilled" });
  });

  it("raises one vessel-level warning per registry conflict and keeps registry-only vessels", () => {
    expect(seed.vessels.find((v) => v.id === "v_high-reef")).toMatchObject({ origin: "registry", lengthStatus: "conflict", lengthFt: null, lengthCandidates: [32, 72] });
    expect(seed.issues.filter((i) => i.type === "length_conflict")).toEqual([expect.objectContaining({ vesselId: "v_high-reef", reservationId: null, severity: "warning" })]);
    expect(seed.vessels.find((v) => v.id === "v_salt-dory")).toMatchObject({ origin: "grid", lengthStatus: "verified", lengthFt: 85 });
  });

  it("sets needs_review exactly when there is a blocking issue", () => {
    const blocked = new Set(seed.issues.filter((i) => i.severity === "blocking").map((i) => i.reservationId));
    for (const r of seed.reservations) expect(r.status === "needs_review", r.sourceRef).toBe(blocked.has(r.id));
  });

  it("refuses year sheets that do not chain", () => {
    const [a, b, ...rest] = workbook();
    const gap = new SheetBuilder("1999");
    modernBlock(gap, 6, 1999, 2);
    expect(() => runImport([a, gap.build(), ...rest])).toThrow(/expected January/);
    expect(b.name).toBe("1999");
  });
});

describe("decorative colours, end to end", () => {
  const issuesOf = (seed: ReturnType<typeof runImport>["seed"], id: string | undefined) => seed.issues.filter((i) => i.reservationId === id).map((i) => `${i.type}/${i.reason}`);

  it("reads named bars painted in a decorative colour in full, and stitches them across months (2005 CORAL LANTERN)", () => {
    const b = new SheetBuilder("2005");
    const [sep, oct, nov] = [modernBlock(b, 6, 2005, 9), modernBlock(b, 17, 2005, 10), modernBlock(b, 28, 2005, 11)];
    b.fill(`X${sep}:AE${sep}`, BANNER).set(`X${sep}`, "M/V CORAL LANTERN", BANNER);
    b.fill(`B${oct}:AF${oct}`, BANNER).set(`B${oct}`, "M/V CORAL LANTERN", BANNER);
    b.fill(`B${nov}:G${nov}`, BANNER).set(`B${nov}`, "M/V CORAL LANTERN", BANNER);
    // Before the band existed, grey on North Pier Face is a bar like any other (2001!V71:Y71).
    b.fill(`V${sep + 1}:Y${sep + 1}`, GREY_BAND).set(`V${sep + 1}`, "R/V Green Sextant", GREY_BAND);
    // A banner-colour bar whose name is within four cells of the month end (2005!AB54:AF54).
    b.fill(`AB${sep + 2}:AE${sep + 2}`, BANNER).set(`AB${sep + 2}`, "Barge Silver Voyager", BANNER);
    const { seed, report } = runImport([b.build()]);

    expect(validateSeed(seed)).toEqual([]);
    const lantern = seed.reservations.find((r) => r.rawLabel === "M/V CORAL LANTERN");
    expect(seed.reservations.filter((r) => r.rawLabel === "M/V CORAL LANTERN")).toHaveLength(1);
    expect(lantern).toMatchObject({ berthId: "north-pier-west", startDate: "2005-09-23", endDate: "2005-11-06", status: "confirmed", sourceRef: `2005!X${sep}:AE${sep};2005!B${oct}:AF${oct};2005!B${nov}:G${nov}` });
    expect(issuesOf(seed, lantern?.id)).toEqual([]);
    expect(seed.reservations.find((r) => r.rawLabel === "R/V Green Sextant")).toMatchObject({ berthId: "north-pier-face", startDate: "2005-09-21", endDate: "2005-09-24" });

    const barge = seed.reservations.find((r) => r.rawLabel === "Barge Silver Voyager");
    expect(barge).toMatchObject({ startDate: "2005-09-27", endDate: "2005-09-30", status: "confirmed" });
    const [edge] = seed.issues.filter((i) => i.reservationId === barge?.id);
    expect(edge).toMatchObject({ type: "ambiguous_extent", reason: "decorative_colour_edge", severity: "warning" });
    expect(edge.detail).toContain(`last 3 days (2005!AC${sep + 2}:AE${sep + 2}, 2005-09-28 to 2005-09-30) may be decoration; they were kept`);
    expect(report.runs).toMatchObject({ decorativeColourBars: 5, labelOnly: 0 });
    expect(report.structuralFills).toEqual({});
  });

  it("keeps the grey Face band as decoration once a sheet paints it bare, so a name on it is one day", () => {
    const b = new SheetBuilder("2011");
    const [may, jun] = [modernBlock(b, 6, 2011, 5), modernBlock(b, 17, 2011, 6)];
    b.fill(`B${may + 1}:AF${may + 1}`, GREY_BAND);
    b.fill(`B${jun + 1}:AE${jun + 1}`, GREY_BAND).set(`X${jun + 1}`, "R/V Quiet Star", GREY_BAND);
    // The same grey off the Face row is not a band: named, it is a bar.
    b.fill(`P${jun + 2}:Q${jun + 2}`, GREY_BAND).set(`P${jun + 2}`, "M/Y GREEN LANTERN", GREY_BAND);
    const { seed, report } = runImport([b.build()]);

    const star = seed.reservations.find((r) => r.rawLabel === "R/V Quiet Star");
    expect(star).toMatchObject({ startDate: "2011-06-23", endDate: "2011-06-23", sourceRef: `2011!X${jun + 1}` });
    expect(issuesOf(seed, star?.id)).toEqual(["ambiguous_extent/label_unfilled"]);
    expect(seed.reservations.find((r) => r.rawLabel === "M/Y GREEN LANTERN")).toMatchObject({ startDate: "2011-06-15", endDate: "2011-06-16" });
    expect(report.structuralFills).toEqual({ [GREY_BAND]: 61 });
  });

  it("never counts an edge blob, but warns on the bars it touches and introduces the stays on either side", () => {
    const b = new SheetBuilder("2011");
    const [may, jun] = [modernBlock(b, 6, 2011, 5), modernBlock(b, 17, 2011, 6)];
    b.merge(`T${may}:AC${may}`, "OSV AMBER REEF", GREEN).fill(`AD${may}:AF${may}`, BANNER);
    b.fill(`B${jun}:C${jun}`, BANNER).fill(`D${jun}:O${jun}`, GREEN).set(`I${jun}`, "OSV AMBER REEF", GREEN);
    b.fill(`B${jun + 2}:D${jun + 2}`, BANNER); // a blob nobody touches
    const { seed, report } = runImport([b.build()]);

    expect(validateSeed(seed)).toEqual([]);
    const [first, second] = [...seed.reservations].sort((x, y) => (x.startDate < y.startDate ? -1 : 1));
    expect([first.startDate, first.endDate, second.startDate, second.endDate]).toEqual(["2011-05-19", "2011-05-28", "2011-06-03", "2011-06-14"]);
    expect([first.status, second.status]).toEqual(["confirmed", "confirmed"]);
    const warning = (id: string) => seed.issues.find((i) => i.reservationId === id);
    expect(warning(first.id)).toMatchObject({ type: "ambiguous_extent", reason: "decorative_overpaint", severity: "warning", relatedReservationIds: [second.id] });
    expect(warning(second.id)).toMatchObject({ reason: "decorative_overpaint", relatedReservationIds: [first.id] });
    expect(warning(first.id)?.detail).toContain(`3 banner-coloured cells at the end of the month (2011!AD${may}:AF${may}, 2011-05-29 to 2011-05-31)`);
    expect(warning(second.id)?.detail).toContain(`held by OSV Amber Reef (2011-05-19 to 2011-05-28, 2011!T${may}:AC${may}), so the two may be one stay.`);
    expect(report.runs.edgeBlobs).toEqual({ count: 3, cells: 8, touchingBar: 2, cellsTouchingBar: 5 });
    expect(report.stitching).toMatchObject({ joins: 0, apartByEdgeBlob: 1 });
    expect(report.issues.byReason).toEqual({ "ambiguous_extent/decorative_overpaint": 2 });
  });
});

describe("displaced berth cells of a corrupted header, end to end", () => {
  const corrupted = () => {
    const b = new SheetBuilder("2010");
    const nov = modernBlock(b, 6, 2010, 11);
    b.fill(`Y${nov}:AE${nov}`, GREEN).set(`Y${nov}`, "R/V GOLDEN COMPASS", GREEN);
    // DECEMBER: 7..31 printed from H18, 1..6 one row up, a stand-in name where a weekday belongs, and the first
    // berth row's days 1-6 sitting in the weekday row (B19:G19) above a grey filler (B20:G20).
    b.days("E17", range(1, 6)).set("A18", "DECEMBER 2018").days("H18", range(7, 31)).set("K19", "OSV CLEAR OSPREY").berths(20);
    return b.fill("B19:G19", GREEN).set("B19", "R/V GOLDEN COMPASS", GREEN).fill("B20:G20", GREY_BAND).fill("H20:R20", GREEN);
  };
  const nov = 8;
  const { seed, report } = runImport([corrupted().build()]);

  it("imports them as days 1-6 of the first berth row, joined to the rest of the bar and to November", () => {
    expect(validateSeed(seed)).toEqual([]);
    expect(seed.reservations).toEqual([
      expect.objectContaining({ berthId: "north-pier-west", startDate: "2010-11-24", endDate: "2010-12-17", status: "needs_review", rawLabel: "R/V GOLDEN COMPASS", sourceRef: `2010!Y${nov}:AE${nov};2010!B19:G19;2010!H20:R20` }),
    ]);
    const [defect] = seed.issues;
    expect(defect).toMatchObject({ type: "calendar_defect", reason: "corrupt_header", severity: "blocking" });
    expect(defect.detail).toContain("2010!B19:G19 was read as part of this stay");
  });

  it("enters the displaced label as imported, not as header junk, and says so in the report", () => {
    expect(report.reconciliation).toMatchObject({ balanced: true, unaccounted: [], doubleCounted: [], imported: 2 });
    expect(report.notImported.corruptHeaderLabels.entries).toEqual([{ ref: "2010!K19", value: "OSV CLEAR OSPREY" }]);
    expect(report.blocks.defects.find((d) => d.kind === "displaced_berth_cells")).toMatchObject({ month: "2010-12", detail: expect.stringContaining("(North Pier West, row 20) up into 2010!B19:G19") });
    expect(report.vocab.vesselPrefixes).toEqual({ "R/V": 2 });
  });

  it("quarantines anything written on the filler the berth row was left with, instead of losing it", () => {
    const odd = runImport([corrupted().set("D20", "M/V Nowhere", GREY_BAND).build()]);
    expect(odd.seed.reservations).toHaveLength(1);
    expect(odd.report.reconciliation).toMatchObject({ balanced: true, unaccounted: [] });
    expect(odd.report.notImported.corruptHeaderLabels.entries.map((e) => e.ref)).toEqual(["2010!K19", "2010!D20"]);
  });
});
