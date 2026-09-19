import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { classifyBerths } from "../../../domain/availability";
import { buildTimeline } from "../../../domain/timeline";
import { createBerth, restoreBerth, retireBerth, updateBerth } from "../../../services/berths";
import { cancelReservation } from "../../../services/reservations";
import { AT, book, createTestDb, expectOk, seedFixture, stay, TODAY } from "../../../services/__tests__/helpers";
import { updateVessel } from "../../../services/vessels";
import type { Db } from "../../types";
import {
  findOpenStays, findOverlapping, getAppMeta, getBerths, getBerthStatuses, getDockToday, getFirstMonth, getHealth, getMonthReservations,
  getOccupancy, getReservationDetail, getVesselOptions, getVessels,
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

/** Walks any query result: no Date objects anywhere, and every `...Date` / start / end / today field is a plain ISO date. */
function assertSerialisable(value: unknown, path = "result"): void {
  if (value instanceof Date) throw new Error(`${path} is a Date object`);
  if (Array.isArray(value)) return value.forEach((item, i) => assertSerialisable(item, `${path}[${i}]`));
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/(^start$|^end$|^today$|Date$)/.test(key) && child !== null) expect(child, `${path}.${key}`).toMatch(ISO_DATE);
      if (/At$/.test(key) && child !== null) expect(child, `${path}.${key}`).toMatch(ISO_TIMESTAMP);
      assertSerialisable(child, `${path}.${key}`);
    }
  }
}

/**
 * A small working dock, as of TODAY (Sat Sep 19, 2026):
 * - North Pier West: Far Horizon in port since Sep 15, leaving Sep 24; Iron Petrel due Oct 1 to Oct 5.
 * - North Pier Face: Golden Compass arrives today; a sail day on Oct 3.
 * - North Pier East: Amber Reef leaves today; Iron Petrel's Sep 8 to Sep 12 stay is history.
 * - Inner Channel: closed for dredging from Sep 28 into October.
 * - South Float West: a cancelled stay only. South Float East: empty.
 */
async function busyDock() {
  const ids = {
    inPort: await stay(db, "north-pier-west", "v_far-horizon", "2026-09-15", "2026-09-24", "2026-09-10"),
    later: await stay(db, "north-pier-west", "v_iron-petrel", "2026-10-01", "2026-10-05"),
    arriving: await stay(db, "north-pier-face", "v_golden-compass", TODAY, "2026-09-23"),
    sailDay: await book(db, { kind: "event", berthId: "north-pier-face", title: "Community sail day", startDate: "2026-10-03", endDate: "2026-10-03", notes: "Rafting allowed" }),
    departing: await stay(db, "north-pier-east", "v_amber-reef", "2026-09-16", TODAY, "2026-09-10"),
    history: await stay(db, "north-pier-east", "v_iron-petrel", "2026-09-08", "2026-09-12", "2026-09-01"),
    dredging: await book(db, { kind: "closure", berthId: "inner-channel", title: "Dredging", startDate: "2026-09-28", endDate: "2026-10-09" }),
    cancelled: await stay(db, "south-float-west", "v_tidewater", "2026-09-21", "2026-09-25"),
  };
  expectOk(await cancelReservation(db, { id: ids.cancelled, version: 1 }, AT));
  return ids;
}

describe("serialisable results", () => {
  it("every query returns plain strings for dates and timestamps, and survives a JSON round trip", async () => {
    const ids = await busyDock();
    expectOk(await retireBerth(db, { berthId: "south-float-east", version: 1 }, AT));
    const results = {
      berths: await getBerths(db, { includeRetired: true }),
      statuses: await getBerthStatuses(db, TODAY, { includeRetired: true }),
      month: await getMonthReservations(db, "2026-09", { includeCancelled: true }),
      detail: await getReservationDetail(db, ids.inPort),
      cancelledDetail: await getReservationDetail(db, ids.cancelled),
      occupancy: await getOccupancy(db, { start: "2026-09-01", end: "2026-09-30" }),
      dock: await getDockToday(db, TODAY),
      firstMonth: await getFirstMonth(db, TODAY),
      vesselOptions: await getVesselOptions(db),
      vessels: await getVessels(db, TODAY),
      meta: await getAppMeta(db),
      health: await getHealth(db),
    };
    assertSerialisable(results);
    expect(JSON.parse(JSON.stringify(results))).toEqual(results);
    expect(results.cancelledDetail?.cancelledAt).toMatch(ISO_TIMESTAMP);
    expect(results.berths.find((b) => b.id === "south-float-east")?.retiredAt).toMatch(ISO_TIMESTAMP);
    expect(results.meta.lastResetAt).toMatch(ISO_TIMESTAMP);
  });
});

describe("getBerths", () => {
  it("returns the berths in dock order, with the version the berth services expect", async () => {
    const all = await getBerths(db);
    expect(all.map((b) => b.id)).toEqual(["north-pier-west", "north-pier-face", "north-pier-east", "inner-channel", "south-float-west", "south-float-east"]);
    expect(all[1]).toEqual({ id: "north-pier-face", name: "North Pier Face", lengthFt: 75, sortOrder: 2, version: 1, retiredAt: null });
  });

  it("leaves retired berths out unless asked, and puts new berths last", async () => {
    expectOk(await retireBerth(db, { berthId: "north-pier-face", version: 1 }, AT));
    expectOk(await createBerth(db, { name: "Fuel Dock", lengthFt: 120 }));
    expect((await getBerths(db)).map((b) => b.id)).toEqual(["north-pier-west", "north-pier-east", "inner-channel", "south-float-west", "south-float-east", "fuel-dock"]);
    const withRetired = await getBerths(db, { includeRetired: true });
    expect(withRetired).toHaveLength(7);
    expect(withRetired[1]).toMatchObject({ id: "north-pier-face", version: 2 });
    expect(withRetired[1].retiredAt).toMatch(ISO_TIMESTAMP);
  });
});

describe("getBerthStatuses", () => {
  it("says who is on each berth today, who is next, and how many stays have not ended", async () => {
    const ids = await busyDock();
    const byId = new Map((await getBerthStatuses(db, TODAY)).map((b) => [b.id, b]));

    expect(byId.get("north-pier-west")).toMatchObject({
      name: "North Pier West",
      lengthFt: 410,
      current: { id: ids.inPort, label: "M/Y Far Horizon", kind: "vessel", startDate: "2026-09-15", endDate: "2026-09-24" },
      next: { id: ids.later, label: "S/V Iron Petrel", kind: "vessel", startDate: "2026-10-01", endDate: "2026-10-05" },
      upcomingCount: 2,
    });
    // Arriving today counts as current, not as next.
    expect(byId.get("north-pier-face")).toMatchObject({ current: { id: ids.arriving }, next: { id: ids.sailDay, label: "Community sail day", kind: "event" }, upcomingCount: 2 });
    // Leaving today is still here today; the stay that ended last week is history and is not counted.
    expect(byId.get("north-pier-east")).toMatchObject({ current: { id: ids.departing }, next: null, upcomingCount: 1 });
    expect(byId.get("inner-channel")).toMatchObject({ current: null, next: { id: ids.dredging, kind: "closure", label: "Dredging" }, upcomingCount: 1 });
    // A cancelled stay is nobody.
    expect(byId.get("south-float-west")).toMatchObject({ current: null, next: null, upcomingCount: 0 });
  });

  it("moves with today", async () => {
    const ids = await busyDock();
    const west = async (today: string) => (await getBerthStatuses(db, today)).find((b) => b.id === "north-pier-west");
    expect(await west("2026-09-25")).toMatchObject({ current: null, next: { id: ids.later }, upcomingCount: 1 });
    expect(await west("2026-10-05")).toMatchObject({ current: { id: ids.later }, next: null, upcomingCount: 1 });
    expect(await west("2026-10-06")).toMatchObject({ current: null, next: null, upcomingCount: 0 });
  });

  it("leaves retired berths out unless asked", async () => {
    expectOk(await retireBerth(db, { berthId: "south-float-east", version: 1 }, AT));
    expect((await getBerthStatuses(db, TODAY)).map((b) => b.id)).not.toContain("south-float-east");
    const retired = (await getBerthStatuses(db, TODAY, { includeRetired: true })).find((b) => b.id === "south-float-east");
    expect(retired).toMatchObject({ current: null, next: null, upcomingCount: 0 });
    expect(retired?.retiredAt).toMatch(ISO_TIMESTAMP);
  });
});

describe("getMonthReservations", () => {
  it("returns everything touching the month, including stays that cross its edges", async () => {
    const ids = await busyDock();
    const september = await getMonthReservations(db, "2026-09");
    expect(september.map((r) => r.id).sort()).toEqual([ids.inPort, ids.arriving, ids.departing, ids.history, ids.dredging].sort());

    // The closure runs Sep 28 to Oct 9: it belongs to both months, with its real dates in each.
    const october = await getMonthReservations(db, "2026-10");
    expect(october.map((r) => r.id).sort()).toEqual([ids.later, ids.sailDay, ids.dredging].sort());
    expect(october.find((r) => r.id === ids.dredging)).toMatchObject({ startDate: "2026-09-28", endDate: "2026-10-09", start: "2026-09-28", end: "2026-10-09" });
    expect(await getMonthReservations(db, "2026-11")).toEqual([]);
  });

  it("includes a stay that only touches the month on its first or last day", async () => {
    const endsOnTheFirst = await stay(db, "south-float-east", "v_tidewater", "2026-10-28", "2026-11-01");
    const startsOnTheLast = await stay(db, "south-float-west", "v_tidewater", "2026-11-30", "2026-12-04");
    expect((await getMonthReservations(db, "2026-11")).map((r) => r.id).sort()).toEqual([endsOnTheFirst, startsOnTheLast].sort());
    expect((await getMonthReservations(db, "2026-10")).map((r) => r.id)).toEqual([endsOnTheFirst]);
    expect((await getMonthReservations(db, "2026-12")).map((r) => r.id)).toEqual([startsOnTheLast]);
    expect(await getMonthReservations(db, "2027-01")).toEqual([]);
  });

  it("labels rows, attaches the vessel and computes fit", async () => {
    const ids = await busyDock();
    const byId = new Map([...(await getMonthReservations(db, "2026-09")), ...(await getMonthReservations(db, "2026-10"))].map((r) => [r.id, r]));

    expect(byId.get(ids.inPort)).toEqual({
      id: ids.inPort,
      berthId: "north-pier-west",
      berthName: "North Pier West",
      berthLengthFt: 410,
      kind: "vessel",
      status: "confirmed",
      startDate: "2026-09-15",
      endDate: "2026-09-24",
      start: "2026-09-15",
      end: "2026-09-24",
      label: "M/Y Far Horizon",
      title: null,
      notes: "",
      version: 1,
      vessel: { id: "v_far-horizon", name: "Far Horizon", prefix: "M/Y", displayName: "M/Y Far Horizon", lengthFt: 170 },
      fit: { kind: "fits", vesselFt: 170, berthFt: 410, marginFt: 240 },
    });
    expect(byId.get(ids.sailDay)).toMatchObject({ label: "Community sail day", kind: "event", title: "Community sail day", notes: "Rafting allowed", vessel: null, fit: null });
    expect(byId.get(ids.dredging)).toMatchObject({ label: "Dredging", kind: "closure", fit: null });
  });

  it("hides cancelled rows unless asked", async () => {
    const ids = await busyDock();
    expect((await getMonthReservations(db, "2026-09")).map((r) => r.id)).not.toContain(ids.cancelled);
    const withCancelled = await getMonthReservations(db, "2026-09", { includeCancelled: true });
    expect(withCancelled.find((r) => r.id === ids.cancelled)).toMatchObject({ status: "cancelled", version: 2 });
  });

  it("hides stays on a retired berth, and shows them again once it is restored", async () => {
    const ids = await busyDock();
    // North Pier East only has a stay leaving today and one from last week: by tomorrow nothing is in the way.
    expectOk(await retireBerth(db, { berthId: "north-pier-east", version: 1 }, { today: "2026-09-20" }));
    const september = (await getMonthReservations(db, "2026-09")).map((r) => r.id);
    expect(september).not.toContain(ids.departing);
    expect(september).not.toContain(ids.history);
    expect(september).toContain(ids.inPort);
    // The record itself is still there, and comes back onto the schedule with the berth.
    expect(await getReservationDetail(db, ids.history)).toMatchObject({ id: ids.history, berth: { id: "north-pier-east" } });
    expectOk(await restoreBerth(db, { berthId: "north-pier-east", version: 2 }));
    expect((await getMonthReservations(db, "2026-09")).map((r) => r.id)).toContain(ids.history);
  });

  it("feeds buildTimeline directly: a cancelled stay drops to a lane beneath the booking that replaced it", async () => {
    const ids = await busyDock();
    const replacement = await stay(db, "south-float-west", "v_harbor-mule", "2026-09-22", "2026-09-24");
    const rows = buildTimeline("2026-09", (await getBerths(db)).map((b) => b.id), await getMonthReservations(db, "2026-09", { includeCancelled: true }));
    const floatWest = rows.find((r) => r.berthId === "south-float-west");
    expect(floatWest?.laneCount).toBe(2);
    expect(floatWest?.bars.map((b) => [b.item.id, b.lane])).toEqual([[replacement, 0], [ids.cancelled, 1]]);
    expect(rows.find((r) => r.berthId === "inner-channel")?.bars[0]).toMatchObject({ startDay: 28, span: 3, continuesAfter: true });
  });

  it("rejects a malformed month", async () => {
    await expect(getMonthReservations(db, "2026-13")).rejects.toThrow(RangeError);
  });
});

describe("getReservationDetail", () => {
  it("returns the row with its berth, vessel, fit and timestamps", async () => {
    const ids = await busyDock();
    const detail = await getReservationDetail(db, ids.arriving);
    expect(detail).toMatchObject({
      id: ids.arriving,
      berthId: "north-pier-face",
      label: "R/V Golden Compass",
      kind: "vessel",
      status: "confirmed",
      startDate: TODAY,
      endDate: "2026-09-23",
      start: TODAY,
      end: "2026-09-23",
      title: null,
      version: 1,
      cancelledAt: null,
      berth: { id: "north-pier-face", name: "North Pier Face", lengthFt: 75, retiredAt: null },
      vessel: { id: "v_golden-compass", displayName: "R/V Golden Compass", lengthFt: 72 },
      fit: { kind: "fits", marginFt: 3 },
    });
    expect(detail?.createdAt).toMatch(ISO_TIMESTAMP);
    expect(detail?.updatedAt).toMatch(ISO_TIMESTAMP);
    expect(detail).not.toHaveProperty("berthName");
  });

  it("computes fit from today's lengths, so a cancelled stay shows why it could not be restored", async () => {
    const ids = await busyDock();
    expectOk(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 95 }, AT));
    expect(await getReservationDetail(db, ids.cancelled)).toMatchObject({ status: "cancelled", fit: { kind: "too_long", vesselFt: 95, berthFt: 90, overByFt: 5 } });
  });

  it("returns null for an unknown id, handles events, and reports a retired berth", async () => {
    const ids = await busyDock();
    expect(await getReservationDetail(db, "r_nope")).toBeNull();
    expect(await getReservationDetail(db, ids.sailDay)).toMatchObject({ label: "Community sail day", title: "Community sail day", vessel: null, fit: null });

    expectOk(await retireBerth(db, { berthId: "south-float-west", version: 1 }, AT));
    expect((await getReservationDetail(db, ids.cancelled))?.berth.retiredAt).toMatch(ISO_TIMESTAMP);
  });
});

describe("getOccupancy", () => {
  it("returns the confirmed stays intersecting the range, ready for classifyBerths", async () => {
    const ids = await busyDock();
    const range = { start: "2026-09-24", end: "2026-09-28" };
    const occupancy = await getOccupancy(db, range);
    // Far Horizon leaves on the 24th and the dredging starts on the 28th: both only touch the range, and both count.
    expect(occupancy).toEqual([
      { id: ids.inPort, berthId: "north-pier-west", label: "M/Y Far Horizon", start: "2026-09-15", end: "2026-09-24" },
      { id: ids.dredging, berthId: "inner-channel", label: "Dredging", start: "2026-09-28", end: "2026-10-09" },
    ]);

    const options = classifyBerths(await getBerths(db), occupancy, { range, vesselLengthFt: 60 });
    expect(Object.fromEntries(options.map((o) => [o.berth.id, o.verdict]))).toEqual({
      "north-pier-face": "available",
      "south-float-west": "available", // its only stay is cancelled
      "south-float-east": "available",
      "north-pier-east": "available",
      "north-pier-west": "occupied",
      "inner-channel": "too_short", // 55 ft: too short outranks occupied
    });
    expect(options[0].berth.id).toBe("north-pier-face"); // tightest fit first
    expect(options.find((o) => o.berth.id === "north-pier-west")?.conflicts.map((c) => c.id)).toEqual([ids.inPort]);
  });

  it("rejects malformed dates", async () => {
    await expect(getOccupancy(db, { start: "2026-09-31", end: "2026-10-01" })).rejects.toThrow(RangeError);
  });
});

describe("findOverlapping and findOpenStays", () => {
  it("name what is in the way with its berth, and leave out cancelled and ended stays", async () => {
    const ids = await busyDock();
    expect(await findOverlapping(db, { berthId: "north-pier-west", startDate: "2026-09-24", endDate: "2026-10-01" })).toEqual([
      { id: ids.inPort, label: "M/Y Far Horizon", berthName: "North Pier West", startDate: "2026-09-15", endDate: "2026-09-24" },
      { id: ids.later, label: "S/V Iron Petrel", berthName: "North Pier West", startDate: "2026-10-01", endDate: "2026-10-05" },
    ]);
    expect(await findOverlapping(db, { berthId: "north-pier-west", startDate: "2026-09-24", endDate: "2026-10-01", excludeId: ids.inPort })).toHaveLength(1);
    expect(await findOverlapping(db, { berthId: "south-float-west", startDate: "2026-09-01", endDate: "2026-12-31" })).toEqual([]);

    const ironPetrel = await findOpenStays(db, { vesselId: "v_iron-petrel", today: TODAY });
    expect(ironPetrel).toEqual([{ id: ids.later, label: "S/V Iron Petrel", berthName: "North Pier West", startDate: "2026-10-01", endDate: "2026-10-05", vesselFt: 135, berthFt: 410 }]);
    expect((await findOpenStays(db, { berthId: "north-pier-face", today: TODAY })).map((s) => [s.id, s.vesselFt])).toEqual([[ids.arriving, 72], [ids.sailDay, null]]);
  });
});

describe("getDockToday", () => {
  it("summarises the dock for today", async () => {
    const ids = await busyDock();
    expect(await getDockToday(db, TODAY)).toEqual({
      today: TODAY,
      berthsTotal: 6,
      berthsOccupied: 3,
      arrivingToday: [{ id: ids.arriving, label: "R/V Golden Compass", kind: "vessel", startDate: TODAY, endDate: "2026-09-23" }],
      departingToday: [{ id: ids.departing, label: "OSV Amber Reef", kind: "vessel", startDate: "2026-09-16", endDate: TODAY }],
      nextArrival: { id: ids.dredging, label: "Dredging", kind: "closure", startDate: "2026-09-28", endDate: "2026-10-09", berthName: "Inner Channel" },
    });
  });

  it("lists a one-day stay as both arriving and departing, and ignores cancelled stays", async () => {
    const dayVisit = await stay(db, "south-float-east", "v_silver-gull", TODAY, TODAY);
    const cancelled = await stay(db, "south-float-west", "v_tidewater", TODAY, "2026-09-22");
    expectOk(await cancelReservation(db, { id: cancelled, version: 1 }, AT));
    const dock = await getDockToday(db, TODAY);
    expect(dock).toMatchObject({ berthsOccupied: 1, nextArrival: null });
    expect(dock.arrivingToday.map((s) => s.id)).toEqual([dayVisit]);
    expect(dock.departingToday.map((s) => s.id)).toEqual([dayVisit]);
  });

  it("counts only berths in use", async () => {
    await busyDock();
    expectOk(await retireBerth(db, { berthId: "south-float-east", version: 1 }, AT));
    expect(await getDockToday(db, TODAY)).toMatchObject({ berthsTotal: 5, berthsOccupied: 3 });
    expect(await getDockToday(pristine, TODAY)).toEqual({ today: TODAY, berthsTotal: 0, berthsOccupied: 0, arrivingToday: [], departingToday: [], nextArrival: null });
  });
});

describe("getFirstMonth", () => {
  it("is today's month while nothing earlier has been booked", async () => {
    expect(await getFirstMonth(pristine, TODAY)).toBe("2026-09");
    expect(await getFirstMonth(db, TODAY)).toBe("2026-09");
    await stay(db, "south-float-east", "v_tidewater", "2026-11-02", "2026-11-05");
    expect(await getFirstMonth(db, TODAY)).toBe("2026-09"); // a future booking does not push the first month forward
  });

  it("reaches back to the earliest reservation of any status as time passes", async () => {
    const early = await stay(db, "south-float-east", "v_tidewater", "2026-09-21", "2026-09-25");
    await stay(db, "south-float-east", "v_tidewater", "2026-11-02", "2026-11-05");
    expect(await getFirstMonth(db, "2027-02-10")).toBe("2026-09");
    expectOk(await cancelReservation(db, { id: early, version: 1 }, AT));
    expect(await getFirstMonth(db, "2027-02-10")).toBe("2026-09"); // cancelled rows are still on the record
  });
});

describe("vessel queries", () => {
  it("getVesselOptions lists every vessel by name with its display name and length", async () => {
    const options = await getVesselOptions(db);
    expect(options.map((o) => o.name)).toEqual(["Amber Reef", "Far Horizon", "Golden Compass", "Harbor Mule", "Iron Petrel", "Long Ketch", "Silver Gull", "Tidewater"]);
    expect(options[1]).toEqual({ id: "v_far-horizon", displayName: "M/Y Far Horizon", name: "Far Horizon", prefix: "M/Y", lengthFt: 170 });
  });

  it("getVessels counts the stays that have not ended, and every stay that was not cancelled", async () => {
    await busyDock();
    const all = await getVessels(db, TODAY);
    const byId = new Map(all.map((v) => [v.id, v]));
    expect(all).toHaveLength(8);
    expect(byId.get("v_iron-petrel")).toEqual({
      id: "v_iron-petrel", displayName: "S/V Iron Petrel", name: "Iron Petrel", prefix: "S/V", lengthFt: 135, version: 1, upcomingCount: 1, totalCount: 2,
    });
    expect(byId.get("v_amber-reef")).toMatchObject({ upcomingCount: 1, totalCount: 1 }); // leaves today: not ended yet
    expect(byId.get("v_tidewater")).toMatchObject({ upcomingCount: 0, totalCount: 0 }); // its only stay is cancelled
    expect(byId.get("v_silver-gull")).toMatchObject({ upcomingCount: 0, totalCount: 0 });
    expect((await getVessels(db, "2026-09-20")).find((v) => v.id === "v_amber-reef")).toMatchObject({ upcomingCount: 0, totalCount: 1 });
  });

  it("getVessels filters by text, with or without the prefix, matching literally", async () => {
    expect((await getVessels(db, TODAY, { q: "horiz" })).map((v) => v.id)).toEqual(["v_far-horizon"]);
    expect((await getVessels(db, TODAY, { q: "r/v gold" })).map((v) => v.id)).toEqual(["v_golden-compass"]);
    expect((await getVessels(db, TODAY, { q: "  " })).length).toBe(8);
    expect((await getVessels(db, TODAY, { q: "100%" })).length).toBe(0);
    expect((await getVessels(db, TODAY, { q: "_" })).length).toBe(0);
  });
});

describe("app meta and health", () => {
  it("getAppMeta has defaults before the first seed and real values after", async () => {
    expect(await getAppMeta(pristine)).toEqual({ lastResetAt: null, mutationsSinceReset: 0 });
    expectOk(await updateBerth(db, { berthId: "inner-channel", version: 1, name: "Inner Channel", lengthFt: 58 }, AT));
    const meta = await getAppMeta(db);
    expect(meta.lastResetAt).toMatch(ISO_TIMESTAMP);
    expect(meta.mutationsSinceReset).toBe(1);
  });

  it("getHealth proves the extension and the constraint exist", async () => {
    await busyDock();
    expect(await getHealth(db)).toMatchObject({ counts: { berths: 6, vessels: 8, reservations: 8 }, btreeGist: true, constraint: true });
    expect(await getHealth(pristine)).toEqual({ counts: { berths: 0, vessels: 0, reservations: 0 }, btreeGist: true, constraint: true, lastResetAt: null });
  });
});
