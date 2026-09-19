import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { classifyBerths } from "../../../domain/availability";
import { buildTimeline } from "../../../domain/timeline";
import { fixtureSeed } from "../../../seed/fixture";
import { cancelReservation, confirmReservation, createReservation } from "../../../services/reservations";
import { createTestDb, expectOk, seedFixture } from "../../../services/__tests__/helpers";
import { setVesselLength } from "../../../services/vessels";
import type { Db } from "../../types";
import {
  getAppMeta, getBerths, getDefaultMonth, getFitViolationList, getFitViolations, getHealth, getIssueSummary, getLiveStats,
  getMonthReservations, getOccupancy, getOpenIssues, getReservationDetail, getVesselDetail, getVesselOptions, getVessels,
} from "../index";

let db: Db;
let pristine: Db;

beforeAll(async () => {
  ({ db } = await createTestDb());
  ({ db: pristine } = await createTestDb()); // migrated, never seeded
}, 60_000);

beforeEach(() => seedFixture(db));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Walks any query result: no Date objects anywhere, and every `...Date` / start / end field is a plain ISO date. */
function assertSerialisable(value: unknown, path = "result"): void {
  if (value instanceof Date) throw new Error(`${path} is a Date object`);
  if (Array.isArray(value)) return value.forEach((item, i) => assertSerialisable(item, `${path}[${i}]`));
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/(^start$|^end$|Date$)/.test(key) && child !== null) expect(child, `${path}.${key}`).toMatch(ISO_DATE);
      if (/At$/.test(key) && child !== null) expect(child, `${path}.${key}`).toMatch(ISO_TIMESTAMP);
      assertSerialisable(child, `${path}.${key}`);
    }
  }
}

describe("serialisable results", () => {
  it("every query returns plain strings for dates and timestamps, and survives a JSON round trip", async () => {
    expectOk(await cancelReservation(db, { id: "r_fx_tour_sfw", version: 1 }));
    expectOk(await confirmReservation(db, { id: "r_fx_pair_a", version: 1 }));
    const results = {
      berths: await getBerths(db),
      month: await getMonthReservations(db, "2019-07", { includeCancelled: true }),
      detail: await getReservationDetail(db, "r_fx_pair_a"),
      cancelledDetail: await getReservationDetail(db, "r_fx_tour_sfw"),
      occupancy: await getOccupancy(db, { start: "2019-07-01", end: "2019-07-31" }),
      defaultMonth: await getDefaultMonth(db, "2026-09-19"),
      vesselOptions: await getVesselOptions(db),
      vessels: await getVessels(db),
      vesselDetail: await getVesselDetail(db, "v_far-horizon"),
      summary: await getIssueSummary(db),
      openIssues: await getOpenIssues(db, {}),
      fitGroups: await getFitViolations(db),
      fitList: await getFitViolationList(db),
      meta: await getAppMeta(db),
      stats: await getLiveStats(db),
      health: await getHealth(db),
    };
    assertSerialisable(results);
    expect(JSON.parse(JSON.stringify(results))).toEqual(results);
    expect(results.cancelledDetail?.cancelledAt).toMatch(ISO_TIMESTAMP);
    expect(results.meta.lastResetAt).toMatch(ISO_TIMESTAMP);
  });
});

describe("getBerths", () => {
  it("returns the six berths in dock order", async () => {
    expect((await getBerths(db)).map((b) => b.id)).toEqual([
      "north-pier-west", "north-pier-face", "north-pier-east", "inner-channel", "south-float-west", "south-float-east",
    ]);
  });
});

describe("getMonthReservations", () => {
  it("returns everything touching the month, including a stay that crosses into it", async () => {
    const july = await getMonthReservations(db, "2019-07");
    const expected = fixtureSeed.reservations.filter((r) => r.startDate <= "2019-07-31" && r.endDate >= "2019-07-01").map((r) => r.id);
    expect(july.map((r) => r.id).sort()).toEqual(expected.sort());

    const august = await getMonthReservations(db, "2019-08");
    expect(august.map((r) => r.id)).toContain("r_fx_crossmonth_npw");
    expect(august.find((r) => r.id === "r_fx_crossmonth_npw")).toMatchObject({ startDate: "2019-07-28", endDate: "2019-08-06", start: "2019-07-28", end: "2019-08-06" });
  });

  it("labels rows, attaches the vessel, counts open issues and computes fit", async () => {
    const july = await getMonthReservations(db, "2019-07");
    const byId = new Map(july.map((r) => [r.id, r]));

    expect(byId.get("r_fx_farhorizon_sfe_1")).toMatchObject({
      label: "M/Y Far Horizon",
      berthName: "South Float East",
      berthLengthFt: 90,
      vessel: { id: "v_far-horizon", name: "Far Horizon", prefix: "M/Y", displayName: "M/Y Far Horizon", lengthFt: 170, lengthStatus: "probable" },
      fit: { kind: "too_long", vesselFt: 170, berthFt: 90, overByFt: 80 },
      openIssueCount: 0,
      source: "legacy",
      version: 1,
    });
    expect(byId.get("r_fx_tidewater_npf_1")?.fit).toEqual({ kind: "fits", marginFt: 15 });
    expect(byId.get("r_fx_ironpetrel_npw")?.fit).toEqual({ kind: "unknown" });
    expect(byId.get("r_fx_sailday_npf")).toMatchObject({ label: "Community sail day", kind: "event", vessel: null, fit: null });
    expect(byId.get("r_fx_closure_npw")).toMatchObject({ label: "Pier repair - no docking", kind: "closure", fit: null });
    expect(byId.get("r_fx_unlabelled_sfw")).toMatchObject({ label: "Unlabelled booking", status: "needs_review", openIssueCount: 1 });
    expect(byId.get("r_fx_pair_a")).toMatchObject({ status: "needs_review", openIssueCount: 1 });
  });

  it("hides cancelled rows unless asked", async () => {
    expectOk(await cancelReservation(db, { id: "r_fx_sailday_npf", version: 1 }));
    expect((await getMonthReservations(db, "2019-07")).map((r) => r.id)).not.toContain("r_fx_sailday_npf");
    const withCancelled = await getMonthReservations(db, "2019-07", { includeCancelled: true });
    expect(withCancelled.find((r) => r.id === "r_fx_sailday_npf")?.status).toBe("cancelled");
  });

  it("feeds buildTimeline directly: the double-booked pair lands in two lanes", async () => {
    const july = await getMonthReservations(db, "2019-07");
    const berthIds = (await getBerths(db)).map((b) => b.id);
    const rows = buildTimeline("2019-07", berthIds, july);
    expect(rows.find((r) => r.berthId === "north-pier-east")?.laneCount).toBe(2);
    expect(rows.find((r) => r.berthId === "inner-channel")?.bars[0]).toMatchObject({ startDay: 1, span: 31 });
  });

  it("rejects a malformed month", async () => {
    await expect(getMonthReservations(db, "2019-13")).rejects.toThrow(RangeError);
  });
});

describe("getReservationDetail", () => {
  it("returns the row with berth, vessel, issues, live overlaps and fit", async () => {
    const detail = await getReservationDetail(db, "r_fx_pair_a");
    expect(detail).toMatchObject({
      id: "r_fx_pair_a",
      label: "R/V Tidewater",
      status: "needs_review",
      startDate: "2019-07-10",
      endDate: "2019-07-16",
      source: "legacy",
      sourceRef: "2019!L42:R42",
      rawLabel: "R/V TIDEWATER",
      version: 1,
      cancelledAt: null,
      berth: { id: "north-pier-east", name: "North Pier East", lengthFt: 240 },
      vessel: { id: "v_tidewater", displayName: "R/V Tidewater", lengthFt: 60, lengthStatus: "verified", version: 1, lengthCandidates: [60] },
      fit: { kind: "fits", marginFt: 180 },
    });
    expect(detail?.issues).toEqual([expect.objectContaining({ id: "i_fx_overlap_a", type: "overlap", severity: "blocking", resolvedAt: null, relatedReservationIds: ["r_fx_pair_b"] })]);
    expect(detail?.overlaps).toEqual([{ id: "r_fx_pair_b", label: "OSV Amber Reef", startDate: "2019-07-14", endDate: "2019-07-20", status: "needs_review" }]);
  });

  it("keeps resolved issues, and recomputes overlaps after the other row is cancelled", async () => {
    expectOk(await confirmReservation(db, { id: "r_fx_pair_a", version: 1 }));
    expectOk(await cancelReservation(db, { id: "r_fx_pair_b", version: 1 }));
    const detail = await getReservationDetail(db, "r_fx_pair_a");
    expect(detail?.status).toBe("confirmed");
    expect(detail?.issues[0]).toMatchObject({ id: "i_fx_overlap_a", resolution: "confirmed" });
    expect(detail?.issues[0].resolvedAt).toMatch(ISO_TIMESTAMP);
    expect(detail?.overlaps).toEqual([]);
  });

  it("returns null for an unknown id and handles events", async () => {
    expect(await getReservationDetail(db, "r_nope")).toBeNull();
    expect(await getReservationDetail(db, "r_fx_sailday_npf")).toMatchObject({ label: "Community sail day", vessel: null, fit: null, overlaps: [] });
  });
});

describe("getOccupancy", () => {
  it("returns live reservations intersecting the range, ready for classifyBerths", async () => {
    expectOk(await cancelReservation(db, { id: "r_fx_tidewater_npf_1", version: 1 }));
    const range = { start: "2019-07-05", end: "2019-07-12" };
    const occupancy = await getOccupancy(db, range);
    expect(occupancy.map((o) => o.id).sort()).toEqual(
      ["r_fx_farhorizon_sfe_1", "r_fx_harbormule_ic_1", "r_fx_ironpetrel_npw", "r_fx_pair_a", "r_fx_unlabelled_sfw"].sort(),
    );
    expect(occupancy.find((o) => o.id === "r_fx_pair_a")).toEqual({
      id: "r_fx_pair_a", berthId: "north-pier-east", status: "needs_review", label: "R/V Tidewater", start: "2019-07-10", end: "2019-07-16",
    });

    const options = classifyBerths(await getBerths(db), occupancy, { range, vesselLengthFt: 60, requiresFit: true });
    const verdicts = Object.fromEntries(options.map((o) => [o.berth.id, o.verdict]));
    expect(verdicts).toEqual({
      "north-pier-face": "available", // its only July stay was cancelled above
      "south-float-west": "available", // unresolved legacy rows caution, they do not block
      "north-pier-east": "available",
      "south-float-east": "occupied",
      "north-pier-west": "occupied",
      "inner-channel": "too_short",
    });
    expect(options.find((o) => o.berth.id === "south-float-west")?.cautions.map((c) => c.id)).toEqual(["r_fx_unlabelled_sfw"]);
  });

  it("rejects malformed dates", async () => {
    await expect(getOccupancy(db, { start: "2019-07-32", end: "2019-08-01" })).rejects.toThrow(RangeError);
  });
});

describe("getDefaultMonth", () => {
  it("is the latest month on or before today with a live reservation", async () => {
    expect(await getDefaultMonth(db, "2026-09-19")).toBe("2019-08");
    expect(await getDefaultMonth(db, "2019-07-15")).toBe("2019-07");
    expect(await getDefaultMonth(db, "2019-05-20")).toBe("2019-03"); // Feb 26 - Mar 1 runs into March
    expect(await getDefaultMonth(db, "2018-12-25")).toBe("2018-11");
  });

  it("counts a long stay for every month it covers, and ignores cancelled rows", async () => {
    expectOk(await createReservation(db, { kind: "closure", berthId: "north-pier-east", title: "Winter layup", startDate: "2019-11-01", endDate: "2020-03-31" }));
    expect(await getDefaultMonth(db, "2020-01-10")).toBe("2020-01");
    expect(await getDefaultMonth(db, "2026-09-19")).toBe("2020-03");

    for (const r of fixtureSeed.reservations.filter((r) => r.startDate >= "2019-08-01")) expectOk(await cancelReservation(db, { id: r.id, version: 1 }));
    expect(await getDefaultMonth(db, "2019-10-01")).toBe("2019-08"); // the Jul 28 - Aug 6 stay still reaches August
  });

  it("falls back to today's month when nothing is booked yet", async () => {
    expect(await getDefaultMonth(pristine, "2026-09-19")).toBe("2026-09");
    expect(await getDefaultMonth(db, "1999-01-01")).toBe("1999-01");
  });
});

describe("vessel queries", () => {
  it("getVesselOptions lists every vessel by name with its display name", async () => {
    const options = await getVesselOptions(db);
    expect(options.map((o) => o.name)).toEqual(["Amber Reef", "Far Horizon", "Golden Compass", "Harbor Mule", "Iron Petrel", "Long Ketch", "Silver Gull", "Tidewater"]);
    expect(options[1]).toEqual({ id: "v_far-horizon", displayName: "M/Y Far Horizon", name: "Far Horizon", prefix: "M/Y", lengthFt: 170, lengthStatus: "probable" });
  });

  it("getVessels counts live bookings and computed misfits", async () => {
    expectOk(await cancelReservation(db, { id: "r_fx_farhorizon_sfe_2", version: 1 }));
    const all = await getVessels(db);
    const byId = new Map(all.map((v) => [v.id, v]));
    expect(all).toHaveLength(8);
    expect(byId.get("v_far-horizon")).toMatchObject({ bookingCount: 2, misfitCount: 1, version: 1, origin: "grid" });
    expect(byId.get("v_long-ketch")).toMatchObject({ bookingCount: 4, misfitCount: 0, lengthStatus: "unknown" });
    expect(byId.get("v_silver-gull")).toMatchObject({ bookingCount: 0, misfitCount: 0, origin: "registry" });
    expect(byId.get("v_iron-petrel")).toMatchObject({ lengthCandidates: [120, 135], lengthStatus: "conflict" });
  });

  it("getVessels filters by text (with or without prefix) and by length status", async () => {
    expect((await getVessels(db, { q: "horiz" })).map((v) => v.id)).toEqual(["v_far-horizon"]);
    expect((await getVessels(db, { q: "r/v gold" })).map((v) => v.id)).toEqual(["v_golden-compass"]);
    expect((await getVessels(db, { q: "100%" })).length).toBe(0);
    expect((await getVessels(db, { q: "_" })).length).toBe(0);
    expect((await getVessels(db, { status: "unknown" })).map((v) => v.id)).toEqual(["v_long-ketch"]);
    expect((await getVessels(db, { status: "probable", q: "gull" })).map((v) => v.id)).toEqual(["v_silver-gull"]);
  });

  it("getVesselDetail lists bookings with a fit verdict each, and open issues", async () => {
    const detail = await getVesselDetail(db, "v_far-horizon");
    expect(detail).toMatchObject({ displayName: "M/Y Far Horizon", bookingCount: 3, misfitCount: 2 });
    expect(detail?.bookings.map((b) => [b.id, b.fit.kind])).toEqual([
      ["r_fx_farhorizon_sfe_1", "too_long"], ["r_fx_farhorizon_sfe_2", "too_long"], ["r_fx_farhorizon_npw", "fits"],
    ]);
    expect((await getVesselDetail(db, "v_iron-petrel"))?.openIssues.map((i) => i.id)).toEqual(["i_fx_length_ironpetrel"]);
    expect(await getVesselDetail(db, "v_ghost")).toBeNull();
  });
});

describe("getIssueSummary", () => {
  it("counts open import findings by type and reason, plus the computed problems", async () => {
    expect(await getIssueSummary(db)).toEqual({
      openTotal: 7,
      byType: { overlap: 2, unlabelled: 1, calendar_defect: 1, ambiguous_extent: 2, length_conflict: 1 },
      ambiguousExtentByReason: { merge_past_month_end: 1, shared_bar: 1 },
      misfitReservations: 2,
      vesselsWithUnknownLength: 1,
      vesselsWithConflictingLength: 1,
      needsReviewReservations: 4,
    });
  });

  it("moves as the data is worked on: nothing is stored, so nothing goes stale", async () => {
    expectOk(await confirmReservation(db, { id: "r_fx_unlabelled_sfw", version: 1 }));
    expectOk(await cancelReservation(db, { id: "r_fx_pair_b", version: 1 }));
    expectOk(await setVesselLength(db, { vesselId: "v_iron-petrel", version: 1, lengthFt: 135 }));
    expectOk(await setVesselLength(db, { vesselId: "v_long-ketch", version: 1, lengthFt: 60 }));
    expectOk(await setVesselLength(db, { vesselId: "v_far-horizon", version: 1, lengthFt: 88 }));

    expect(await getIssueSummary(db)).toEqual({
      openTotal: 4,
      byType: { overlap: 1, unlabelled: 0, calendar_defect: 1, ambiguous_extent: 2, length_conflict: 0 },
      ambiguousExtentByReason: { merge_past_month_end: 1, shared_bar: 1 },
      misfitReservations: 2, // Far Horizon's two are gone; Long Ketch at 60 ft no longer fits Inner Channel (55 ft), twice
      vesselsWithUnknownLength: 0,
      vesselsWithConflictingLength: 0,
      needsReviewReservations: 2,
    });
  });

  it("is all zeroes on an empty database", async () => {
    expect(await getIssueSummary(pristine)).toMatchObject({ openTotal: 0, byType: { overlap: 0 }, misfitReservations: 0, needsReviewReservations: 0 });
  });
});

describe("getOpenIssues", () => {
  it("joins each issue with its reservation or vessel", async () => {
    const { total, rows } = await getOpenIssues(db, {});
    expect(total).toBe(7);
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.id === "i_fx_overlap_a")).toMatchObject({
      type: "overlap",
      severity: "blocking",
      relatedReservationIds: ["r_fx_pair_b"],
      reservation: { id: "r_fx_pair_a", label: "R/V Tidewater", berthName: "North Pier East", startDate: "2019-07-10", endDate: "2019-07-16", status: "needs_review", version: 1 },
      vessel: null,
    });
    expect(rows.find((r) => r.id === "i_fx_unlabelled")?.reservation?.label).toBe("Unlabelled booking");
    expect(rows.find((r) => r.id === "i_fx_length_ironpetrel")).toMatchObject({
      reservation: null,
      vessel: { id: "v_iron-petrel", displayName: "S/V Iron Petrel", lengthStatus: "conflict", lengthCandidates: [120, 135], version: 1 },
    });
  });

  it("filters by type, pages, and drops resolved issues", async () => {
    expect((await getOpenIssues(db, { type: "ambiguous_extent" })).rows.map((r) => r.id).sort()).toEqual(["i_fx_extent_month_end", "i_fx_extent_shared_bar"]);

    const firstPage = await getOpenIssues(db, { limit: 3 });
    const secondPage = await getOpenIssues(db, { limit: 3, offset: 3 });
    expect(firstPage.total).toBe(7);
    expect(firstPage.rows).toHaveLength(3);
    expect(new Set([...firstPage.rows, ...secondPage.rows].map((r) => r.id)).size).toBe(6);

    expectOk(await confirmReservation(db, { id: "r_fx_pair_a", version: 1 }));
    const overlaps = await getOpenIssues(db, { type: "overlap" });
    expect(overlaps.total).toBe(1);
    expect(overlaps.rows.map((r) => r.id)).toEqual(["i_fx_overlap_b"]);
  });

  it("drops a warning once its already-confirmed row is confirmed from the worklist", async () => {
    const before = await getOpenIssues(db, { type: "ambiguous_extent" });
    const target = before.rows.find((r) => r.id === "i_fx_extent_month_end")!.reservation!;
    expect(target).toMatchObject({ id: "r_fx_crossmonth_npw", status: "confirmed", version: 1 });

    // Exactly what a "looks right" button sends: the id and version this list handed out.
    expectOk(await confirmReservation(db, { id: target.id, version: target.version }));
    const after = await getOpenIssues(db, { type: "ambiguous_extent" });
    expect(after.rows.map((r) => r.id)).toEqual(["i_fx_extent_shared_bar"]);
    expect((await getIssueSummary(db)).byType.ambiguous_extent).toBe(1);
  });
});

describe("getFitViolations", () => {
  it("groups misfits by vessel and berth, and lists them flat", async () => {
    const grouped = await getFitViolations(db);
    expect(grouped).toEqual({
      totalGroups: 1,
      totalReservations: 2,
      groups: [{
        vesselId: "v_far-horizon", vesselName: "M/Y Far Horizon", vesselLengthFt: 170, lengthStatus: "probable",
        berthId: "south-float-east", berthName: "South Float East", berthLengthFt: 90, overByFt: 80,
        count: 2, firstDate: "2018-08-06", lastDate: "2019-07-09", sampleReservationId: "r_fx_farhorizon_sfe_1",
      }],
    });

    const flat = await getFitViolationList(db);
    expect(flat.total).toBe(2);
    expect(flat.rows.map((r) => r.reservationId)).toEqual(["r_fx_farhorizon_sfe_1", "r_fx_farhorizon_sfe_2"]);
    expect(flat.rows[0]).toMatchObject({ vesselName: "M/Y Far Horizon", overByFt: 80, status: "confirmed", startDate: "2019-07-03" });
  });

  it("follows the vessel's current length and ignores cancelled stays", async () => {
    expectOk(await cancelReservation(db, { id: "r_fx_farhorizon_sfe_1", version: 1 }));
    expectOk(await setVesselLength(db, { vesselId: "v_long-ketch", version: 1, lengthFt: 100 }));
    const grouped = await getFitViolations(db);
    expect(grouped.totalGroups).toBe(4);
    expect(grouped.totalReservations).toBe(5);
    // Worst overage first: Far Horizon is 80 ft over; Long Ketch is 45 ft over on Inner Channel, 10 ft on the floats.
    expect(grouped.groups.map((g) => [g.vesselId, g.berthId, g.count, g.overByFt])).toEqual([
      ["v_far-horizon", "south-float-east", 1, 80],
      ["v_long-ketch", "inner-channel", 2, 45],
      ["v_long-ketch", "south-float-west", 1, 10],
      ["v_long-ketch", "south-float-east", 1, 10],
    ]);
    expect((await getFitViolations(db, { limit: 1, offset: 1 })).groups.map((g) => g.berthId)).toEqual(["inner-channel"]);
    expect((await getFitViolationList(db, { vesselId: "v_long-ketch", berthId: "inner-channel" })).total).toBe(2);
  });
});

describe("app meta, stats and health", () => {
  it("getAppMeta has defaults before the first seed and real values after", async () => {
    expect(await getAppMeta(pristine)).toEqual({ seedVersion: null, lastResetAt: null, mutationsSinceReset: 0 });
    expectOk(await cancelReservation(db, { id: "r_fx_tour_sfw", version: 1 }));
    const meta = await getAppMeta(db);
    expect(meta.seedVersion).toMatch(/^s1-[0-9a-f]{12}$/);
    expect(meta.mutationsSinceReset).toBe(1);
  });

  it("getLiveStats counts rows by status and spans the live date range", async () => {
    expectOk(await cancelReservation(db, { id: "r_fx_harbormule_ic_2", version: 1 })); // the earliest stay
    expect(await getLiveStats(db)).toEqual({
      berths: 6,
      vessels: 8,
      reservations: { total: 30, confirmed: 25, needsReview: 4, cancelled: 1 },
      openIssues: 7,
      firstReservationDate: "2017-07-09",
      lastReservationDate: "2019-08-23",
    });
    expect(await getLiveStats(pristine)).toMatchObject({ berths: 0, reservations: { total: 0 }, firstReservationDate: null, lastReservationDate: null });
  });

  it("getHealth proves the extension and the constraint exist", async () => {
    expect(await getHealth(db)).toMatchObject({ counts: { berths: 6, vessels: 8, reservations: 30, issues: 7 }, btreeGist: true, constraint: true });
    expect(await getHealth(pristine)).toMatchObject({ counts: { berths: 0, vessels: 0, reservations: 0, issues: 0 }, btreeGist: true, constraint: true, seedVersion: null, lastResetAt: null });
  });
});
