import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appMeta, reservations, vessels } from "../../db/schema";
import type { Db, Tx } from "../../db/types";
import { retireBerth, updateBerth } from "../berths";
import { cancelReservation, createReservation, restoreReservation, updateReservation } from "../reservations";
import { updateVessel } from "../vessels";
import { AT, book, createTestDb, expectFail, expectOk, seedFixture, stay, TODAY, YESTERDAY } from "./helpers";

let db: Db;

beforeAll(async () => {
  ({ db } = await createTestDb());
}, 60_000);

beforeEach(() => seedFixture(db));
afterEach(() => vi.restoreAllMocks());

const reservationById = async (id: string) => (await db.select().from(reservations).where(eq(reservations.id, id)))[0];
const vesselById = async (id: string) => (await db.select().from(vessels).where(eq(vessels.id, id)))[0];
const mutations = async () => (await db.select().from(appMeta))[0].mutationsSinceReset;

/** A rival request that wins the berth in the gap between our pre-check and our write. */
const rivalBooks = (id: string, berthId: string, startDate: string, endDate: string) => async (tx: Tx) => {
  await tx.insert(reservations).values({ id, berthId, kind: "vessel", vesselId: "v_golden-compass", startDate, endDate, status: "confirmed" });
};

/** Booked back when it was still in the future, so that by TODAY it has ended (Sep 8 to Sep 12). */
const endedStay = () => stay(db, "south-float-west", "v_tidewater", "2026-09-08", "2026-09-12", "2026-09-01");
/** Booked on Sep 10 for Sep 15 to Sep 25: on TODAY (Sep 19) the vessel is in port. */
const stayInProgress = () => stay(db, "south-float-west", "v_tidewater", "2026-09-15", "2026-09-25", "2026-09-10");

describe("createReservation", () => {
  it("books a vessel that fits into a free slot", async () => {
    const { data, warning } = expectOk(
      await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2026-09-21", endDate: "2026-09-23", notes: "ETA 0900" }, AT),
    );
    expect(warning).toBeUndefined();
    expect(data.id).toMatch(/^r_[0-9a-f]{16}$/);
    expect(await reservationById(data.id)).toMatchObject({
      berthId: "south-float-east", kind: "vessel", vesselId: "v_tidewater", title: null, startDate: "2026-09-21", endDate: "2026-09-23",
      status: "confirmed", notes: "ETA 0900", version: 1, cancelledAt: null,
    });
    expect(await mutations()).toBe(1);
  });

  it("refuses a start date of yesterday and accepts today", async () => {
    const request = { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", endDate: "2026-09-22" } as const;
    const failed = expectFail(await createReservation(db, { ...request, startDate: YESTERDAY }, AT));
    expect(failed.code).toBe("VALIDATION");
    expect(failed.message).toBe("Reservations start today (Sep 19, 2026) or later.");
    expect(failed.fieldErrors).toEqual({ startDate: [failed.message] });
    expect(await mutations()).toBe(0);

    expectOk(await createReservation(db, { ...request, startDate: TODAY }, AT));
  });

  it("uses the facility's real date when none is pinned", async () => {
    const failed = expectFail(await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2001-03-01", endDate: "2001-03-04" }));
    expect(failed.fieldErrors?.startDate?.[0]).toMatch(/^Reservations start today \(.+\) or later\.$/);
  });

  it("refuses an overlap and names the booking in the way, with its berth", async () => {
    const blocker = await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-30");
    const failed = expectFail(
      await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2026-09-27", endDate: "2026-10-02" }, AT),
    );
    expect(failed.code).toBe("CONFLICT");
    expect(failed.message).toBe("South Float East is taken Sep 21 to Sep 30, 2026 by OSV Amber Reef.");
    expect(failed.conflicts).toEqual([{ id: blocker, label: "OSV Amber Reef", berthName: "South Float East", startDate: "2026-09-21", endDate: "2026-09-30" }]);
    expect(await mutations()).toBe(1);
  });

  it("treats a stay that starts on another's last day as a conflict, and the day after as free", async () => {
    await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-30");
    const touching = await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2026-09-30", endDate: "2026-10-03" }, AT);
    expect(expectFail(touching).code).toBe("CONFLICT");
    const touchingBefore = await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2026-09-19", endDate: "2026-09-21" }, AT);
    expect(expectFail(touchingBefore).code).toBe("CONFLICT");
    expectOk(await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2026-10-01", endDate: "2026-10-03" }, AT));
  });

  it("allows the same dates on another berth, and blocks events and closures on an occupied one", async () => {
    await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-30");
    await stay(db, "south-float-west", "v_tidewater", "2026-09-21", "2026-09-30");
    const failed = expectFail(await createReservation(db, { kind: "closure", berthId: "south-float-east", title: "Float rebuild", startDate: "2026-09-19", endDate: "2026-10-31" }, AT));
    expect(failed.code).toBe("CONFLICT");
    expect(failed.conflicts?.[0].label).toBe("OSV Amber Reef");
  });

  it("names an event that is in the way by its title", async () => {
    await book(db, { kind: "event", berthId: "north-pier-face", title: "Community sail day", startDate: "2026-10-03", endDate: "2026-10-03" });
    const failed = expectFail(await createReservation(db, { kind: "vessel", berthId: "north-pier-face", vesselId: "v_tidewater", startDate: "2026-10-01", endDate: "2026-10-05" }, AT));
    expect(failed.message).toBe("North Pier Face is taken Oct 3, 2026 by Community sail day.");
  });

  it("refuses a vessel that is too long and reports by how much", async () => {
    const failed = expectFail(
      await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_far-horizon", startDate: "2026-09-21", endDate: "2026-09-23" }, AT),
    );
    expect(failed.code).toBe("TOO_LONG");
    expect(failed.fit).toEqual({ vesselFt: 170, berthFt: 90, overByFt: 80 });
    expect(failed.message).toBe("M/Y Far Horizon is 170 ft; South Float East is 90 ft. It is 80 ft too long for this berth.");

    // A vessel exactly as long as the berth fits.
    expectOk(await updateVessel(db, { vesselId: "v_amber-reef", version: 1, lengthFt: 90 }, AT));
    await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-23");
  });

  it("reports TOO_LONG rather than CONFLICT when both apply: a berth that is too short can never work", async () => {
    await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-30");
    const failed = expectFail(
      await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_far-horizon", startDate: "2026-09-25", endDate: "2026-09-27" }, AT),
    );
    expect(failed.code).toBe("TOO_LONG");
    expect(failed.conflicts).toBeUndefined();
  });

  it("requires a title for events and closures, which have no length to check, and a vessel for vessel bookings", async () => {
    const noTitle = expectFail(await createReservation(db, { kind: "event", berthId: "inner-channel", startDate: "2026-09-21", endDate: "2026-09-21", title: "   " }, AT));
    expect(noTitle.code).toBe("VALIDATION");
    expect(noTitle.fieldErrors?.title).toEqual(["Give the event a title."]);
    expect(expectFail(await createReservation(db, { kind: "closure", berthId: "inner-channel", startDate: "2026-09-21", endDate: "2026-09-21" }, AT)).fieldErrors?.title).toBeDefined();

    const noVessel = expectFail(await createReservation(db, { kind: "vessel", berthId: "inner-channel", startDate: "2026-09-21", endDate: "2026-09-21" }, AT));
    expect(noVessel.code).toBe("VALIDATION");
    expect(noVessel.fieldErrors?.vesselId).toBeDefined();

    // Inner Channel is 55 ft, the shortest berth: an event books it without any fit check.
    const { data } = expectOk(await createReservation(db, { kind: "event", berthId: "inner-channel", startDate: "2026-09-21", endDate: "2026-09-21", title: " Dive training " }, AT));
    expect(await reservationById(data.id)).toMatchObject({ kind: "event", title: "Dive training", vesselId: null });
  });

  it("ignores, and does not validate, the fields that do not apply to the kind of booking", async () => {
    const blankPanel = { name: "", lengthFt: Number.NaN };
    const event = expectOk(
      await createReservation(db, { kind: "event", berthId: "north-pier-face", title: "Open house", vesselId: "v_far-horizon", newVessel: blankPanel, startDate: "2026-09-21", endDate: "2026-09-21" }, AT),
    );
    expect(await reservationById(event.data.id)).toMatchObject({ kind: "event", vesselId: null, title: "Open house" });

    const picked = expectOk(
      await createReservation(db, { kind: "vessel", berthId: "north-pier-face", vesselId: "v_tidewater", newVessel: blankPanel, title: "x".repeat(500), startDate: "2026-09-23", endDate: "2026-09-24" }, AT),
    );
    expect(await reservationById(picked.data.id)).toMatchObject({ kind: "vessel", vesselId: "v_tidewater", title: null });
  });

  it("registers a new vessel on the fly, and reuses it by name the next time", async () => {
    const first = expectOk(
      await createReservation(db, { kind: "vessel", berthId: "north-pier-east", newVessel: { name: "r/v SEA FOX", lengthFt: 95 }, startDate: "2026-09-21", endDate: "2026-09-23" }, AT),
    );
    expect(first.warning).toBeUndefined();
    expect(await vesselById("v_sea-fox")).toMatchObject({ name: "Sea Fox", nameKey: "SEA FOX", prefix: "R/V", lengthFt: 95, version: 1 });
    expect((await reservationById(first.data.id)).vesselId).toBe("v_sea-fox");

    const again = expectOk(
      await createReservation(db, { kind: "vessel", berthId: "north-pier-east", newVessel: { name: "Sea  fox", prefix: "M/V", lengthFt: 99 }, startDate: "2026-09-28", endDate: "2026-09-30" }, AT),
    );
    expect((await reservationById(again.data.id)).vesselId).toBe("v_sea-fox");
    expect(again.warning).toBe("R/V Sea Fox is already registered at 95 ft, so that length was used. To correct it, edit the vessel.");
    expect(await db.select().from(vessels).where(eq(vessels.nameKey, "SEA FOX"))).toHaveLength(1);
    expect(await vesselById("v_sea-fox")).toMatchObject({ lengthFt: 95, prefix: "R/V", version: 1 });

    // The reused vessel is checked at the length on file, not the one typed: 170 ft does not fit a 90 ft float.
    const reused = expectFail(
      await createReservation(db, { kind: "vessel", berthId: "south-float-east", newVessel: { name: "Far Horizon", lengthFt: 80 }, startDate: "2026-09-21", endDate: "2026-09-23" }, AT),
    );
    expect(reused.code).toBe("TOO_LONG");
    expect(reused.fit?.vesselFt).toBe(170);
  });

  it("refuses a new vessel without a length", async () => {
    const newVessel = { name: "S/V Petrel II" } as { name: string; lengthFt: number };
    const failed = expectFail(await createReservation(db, { kind: "vessel", berthId: "north-pier-east", newVessel, startDate: "2026-09-21", endDate: "2026-09-23" }, AT));
    expect(failed.code).toBe("VALIDATION");
    expect(failed.fieldErrors).toEqual({ "newVessel.lengthFt": ["Enter the length in whole feet."] });
    expect(await db.select().from(vessels).where(eq(vessels.nameKey, "PETREL II"))).toHaveLength(0);
  });

  it("does not leave a new vessel behind when its booking is refused", async () => {
    const failed = expectFail(
      await createReservation(db, { kind: "vessel", berthId: "inner-channel", newVessel: { name: "Barge Goliath", lengthFt: 200 }, startDate: "2026-09-21", endDate: "2026-09-23" }, AT),
    );
    expect(failed.code).toBe("TOO_LONG");
    expect(await db.select().from(vessels).where(eq(vessels.nameKey, "GOLIATH"))).toHaveLength(0);
  });

  it("refuses a retired berth", async () => {
    expectOk(await retireBerth(db, { berthId: "north-pier-face", version: 1 }, AT));
    const failed = expectFail(await createReservation(db, { kind: "vessel", berthId: "north-pier-face", vesselId: "v_tidewater", startDate: "2026-09-21", endDate: "2026-09-23" }, AT));
    expect(failed.code).toBe("INVALID_STATE");
    expect(failed.message).toBe("North Pier Face has been retired and cannot be booked.");
    expect(failed.fieldErrors?.berthId).toEqual([failed.message]);
  });

  it("validates dates in order: real dates, not in the past, start before end, then the 731 day limit", async () => {
    const base = { kind: "vessel", berthId: "north-pier-west", vesselId: "v_tidewater" } as const;
    const notReal = expectFail(await createReservation(db, { ...base, startDate: "2027-02-29", endDate: "2027-03-02" }, AT));
    expect(notReal).toMatchObject({ code: "VALIDATION", fieldErrors: { startDate: ["Start date must be a real calendar date."] } });

    const pastAndBackwards = expectFail(await createReservation(db, { ...base, startDate: YESTERDAY, endDate: "2026-09-01" }, AT));
    expect(pastAndBackwards.fieldErrors?.startDate).toBeDefined();

    const backwards = expectFail(await createReservation(db, { ...base, startDate: "2026-10-02", endDate: "2026-10-01" }, AT));
    expect(backwards).toMatchObject({ code: "VALIDATION", message: "The end date is before the start date." });
    expect(backwards.fieldErrors?.endDate).toBeDefined();

    // 2027-01-01..2028-12-31 is exactly 731 days (2028 is a leap year); one more day is too many.
    expectOk(await createReservation(db, { ...base, startDate: "2027-01-01", endDate: "2028-12-31" }, AT));
    const tooLong = expectFail(await createReservation(db, { ...base, berthId: "north-pier-east", startDate: "2027-01-01", endDate: "2029-01-01" }, AT));
    expect(tooLong.code).toBe("VALIDATION");
    expect(tooLong.fieldErrors?.endDate?.[0]).toContain("731 days");
  });

  it("reports an unknown berth or vessel as NOT_FOUND", async () => {
    expect(expectFail(await createReservation(db, { kind: "event", berthId: "nowhere", title: "X", startDate: "2026-09-21", endDate: "2026-09-21" }, AT)).code).toBe("NOT_FOUND");
    expect(expectFail(await createReservation(db, { kind: "vessel", berthId: "north-pier-west", vesselId: "v_ghost", startDate: "2026-09-21", endDate: "2026-09-21" }, AT)).code).toBe("NOT_FOUND");
  });

  it("maps a lost race (23P01 from the exclusion constraint) to the same CONFLICT, naming the winner", async () => {
    const failed = expectFail(
      await createReservation(
        db,
        { kind: "vessel", berthId: "north-pier-west", newVessel: { name: "M/V Latecomer", lengthFt: 80 }, startDate: "2026-09-21", endDate: "2026-09-25" },
        { ...AT, afterPreCheck: rivalBooks("r_rival", "north-pier-west", "2026-09-24", "2026-09-28") },
      ),
    );
    expect(failed.code).toBe("CONFLICT");
    expect(failed.message).toBe("North Pier West is taken Sep 24 to Sep 28, 2026 by R/V Golden Compass.");
    expect(failed.conflicts).toEqual([{ id: "r_rival", label: "R/V Golden Compass", berthName: "North Pier West", startDate: "2026-09-24", endDate: "2026-09-28" }]);
    // The whole transaction rolled back: no booking, no rival, and the vessel registered along the way is gone too.
    expect(await db.select().from(reservations)).toHaveLength(0);
    expect(await db.select().from(vessels).where(eq(vessels.nameKey, "LATECOMER"))).toHaveLength(0);
    expect(await mutations()).toBe(0);
  });
});

describe("updateReservation", () => {
  it("fails with STALE when the row changed since the form was loaded", async () => {
    const id = await stay(db, "north-pier-face", "v_tidewater", "2026-09-21", "2026-09-25");
    const edit = { id, berthId: "north-pier-face", startDate: "2026-09-21", endDate: "2026-09-26" };
    const first = expectOk(await updateReservation(db, { ...edit, version: 1 }, AT));
    expect(first.data).toEqual({ id, version: 2 });

    const stale = expectFail(await updateReservation(db, { ...edit, endDate: "2026-09-27", version: 1 }, AT));
    expect(stale.code).toBe("STALE");
    expect((await reservationById(id)).endDate).toBe("2026-09-26");

    expectOk(await updateReservation(db, { ...edit, endDate: "2026-09-27", version: 2 }, AT));
    expect(await reservationById(id)).toMatchObject({ endDate: "2026-09-27", version: 3 });
    expect(await mutations()).toBe(3);
  });

  it("refuses a move onto an occupied berth, naming the occupant", async () => {
    const id = await stay(db, "north-pier-face", "v_tidewater", "2026-09-21", "2026-09-25");
    const occupant = await stay(db, "south-float-east", "v_amber-reef", "2026-09-24", "2026-09-30");
    const failed = expectFail(await updateReservation(db, { id, version: 1, berthId: "south-float-east", startDate: "2026-09-21", endDate: "2026-09-25" }, AT));
    expect(failed.code).toBe("CONFLICT");
    expect(failed.message).toBe("South Float East is taken Sep 24 to Sep 30, 2026 by OSV Amber Reef.");
    expect(failed.conflicts).toEqual([{ id: occupant, label: "OSV Amber Reef", berthName: "South Float East", startDate: "2026-09-24", endDate: "2026-09-30" }]);
    expect(await reservationById(id)).toMatchObject({ berthId: "north-pier-face", version: 1 });
  });

  it("refuses a move onto a berth that is too short, and allows one that is long enough", async () => {
    const id = await stay(db, "north-pier-west", "v_far-horizon", "2026-09-21", "2026-09-25");
    const failed = expectFail(await updateReservation(db, { id, version: 1, berthId: "south-float-west", startDate: "2026-09-21", endDate: "2026-09-25" }, AT));
    expect(failed.code).toBe("TOO_LONG");
    expect(failed.fit).toEqual({ vesselFt: 170, berthFt: 90, overByFt: 80 });

    expectOk(await updateReservation(db, { id, version: 1, berthId: "north-pier-east", startDate: "2026-09-21", endDate: "2026-09-25" }, AT));
    expect((await reservationById(id)).berthId).toBe("north-pier-east");
  });

  it("refuses a move onto a retired berth", async () => {
    const id = await stay(db, "north-pier-west", "v_tidewater", "2026-09-21", "2026-09-25");
    expectOk(await retireBerth(db, { berthId: "north-pier-face", version: 1 }, AT));
    const failed = expectFail(await updateReservation(db, { id, version: 1, berthId: "north-pier-face", startDate: "2026-09-21", endDate: "2026-09-25" }, AT));
    expect(failed.code).toBe("INVALID_STATE");
    expect(failed.message).toBe("North Pier Face has been retired and cannot be booked.");
  });

  it("does not collide with itself when only the dates shift", async () => {
    const id = await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-30");
    expectOk(await updateReservation(db, { id, version: 1, berthId: "south-float-east", startDate: "2026-09-22", endDate: "2026-10-01" }, AT));
  });

  it("refuses any change to a stay that has ended", async () => {
    const id = await endedStay();
    const failed = expectFail(await updateReservation(db, { id, version: 1, berthId: "south-float-west", startDate: "2026-09-08", endDate: "2026-09-30" }, AT));
    expect(failed.code).toBe("INVALID_STATE");
    expect(failed.message).toBe("This stay ended on Sep 12, 2026 and can no longer be changed.");
    expect(await reservationById(id)).toMatchObject({ endDate: "2026-09-12", version: 1 });
  });

  it("lets a stay in progress extend or shorten its end, but not rewrite days that have passed", async () => {
    const id = await stayInProgress();
    const where = { id, berthId: "south-float-west" };

    const extended = expectOk(await updateReservation(db, { ...where, version: 1, startDate: "2026-09-15", endDate: "2026-09-28" }, AT));
    expect(await reservationById(id)).toMatchObject({ startDate: "2026-09-15", endDate: "2026-09-28", version: 2 });

    // Leaving today is fine; having left yesterday is not something an edit can claim.
    expectOk(await updateReservation(db, { ...where, version: extended.data.version, startDate: "2026-09-15", endDate: TODAY }, AT));
    const endedEarly = expectFail(await updateReservation(db, { ...where, version: 3, startDate: "2026-09-15", endDate: YESTERDAY }, AT));
    expect(endedEarly.code).toBe("VALIDATION");
    expect(endedEarly.fieldErrors).toEqual({ endDate: ["The end date must be today (Sep 19, 2026) or later."] });

    for (const startDate of ["2026-09-14", "2026-09-16", YESTERDAY]) {
      const moved = expectFail(await updateReservation(db, { ...where, version: 3, startDate, endDate: "2026-09-28" }, AT));
      expect(moved.code).toBe("VALIDATION");
      expect(moved.fieldErrors).toEqual({ startDate: ["This stay began on Sep 15, 2026. Keep that start date, or move it to today (Sep 19, 2026) or later."] });
    }
    expect(await reservationById(id)).toMatchObject({ startDate: "2026-09-15", endDate: TODAY, version: 3 });

    // Giving up the past days entirely is a forward-only change, so it is allowed.
    expectOk(await updateReservation(db, { ...where, version: 3, startDate: TODAY, endDate: "2026-09-28" }, AT));
  });

  it("refuses to move an upcoming stay's start into the past", async () => {
    const id = await stay(db, "south-float-west", "v_tidewater", "2026-09-21", "2026-09-25");
    const failed = expectFail(await updateReservation(db, { id, version: 1, berthId: "south-float-west", startDate: YESTERDAY, endDate: "2026-09-25" }, AT));
    expect(failed.code).toBe("VALIDATION");
    expect(failed.fieldErrors).toEqual({ startDate: ["Reservations start today (Sep 19, 2026) or later."] });
    expectOk(await updateReservation(db, { id, version: 1, berthId: "south-float-west", startDate: TODAY, endDate: "2026-09-25" }, AT));
  });

  it("checks the range itself before looking anything up", async () => {
    const id = await stay(db, "south-float-west", "v_tidewater", "2026-09-21", "2026-09-25");
    const backwards = expectFail(await updateReservation(db, { id, version: 1, berthId: "south-float-west", startDate: "2026-09-25", endDate: "2026-09-21" }, AT));
    expect(backwards.fieldErrors?.endDate).toEqual(["The end date is before the start date."]);
    const tooLong = expectFail(await updateReservation(db, { id, version: 1, berthId: "south-float-west", startDate: "2026-09-21", endDate: "2028-09-21" }, AT));
    expect(tooLong.fieldErrors?.endDate?.[0]).toContain("731 days");
  });

  it("keeps fields that were not sent, changes a title, and never changes the vessel", async () => {
    const vesselStay = await book(db, { kind: "vessel", berthId: "north-pier-face", vesselId: "v_golden-compass", startDate: "2026-09-21", endDate: "2026-09-25", notes: "Fueling @0800" });
    // A `vesselId` from an older client is not part of the input any more and changes nothing.
    const sneaky = { id: vesselStay, version: 1, berthId: "north-pier-face", startDate: "2026-09-21", endDate: "2026-09-26", title: "ignored", vesselId: "v_tidewater" };
    expectOk(await updateReservation(db, sneaky, AT));
    expect(await reservationById(vesselStay)).toMatchObject({ vesselId: "v_golden-compass", title: null, notes: "Fueling @0800", endDate: "2026-09-26" });

    const event = await book(db, { kind: "event", berthId: "inner-channel", title: "Community sail day", startDate: "2026-10-03", endDate: "2026-10-03" });
    const where = { id: event, berthId: "inner-channel", startDate: "2026-10-03", endDate: "2026-10-04" };
    expectOk(await updateReservation(db, { ...where, version: 1 }, AT));
    expect((await reservationById(event)).title).toBe("Community sail day");
    expectOk(await updateReservation(db, { ...where, version: 2, title: " Community sail weekend ", notes: "" }, AT));
    expect(await reservationById(event)).toMatchObject({ title: "Community sail weekend", vesselId: null, notes: "" });

    const blank = expectFail(await updateReservation(db, { ...where, version: 3, title: "  " }, AT));
    expect(blank.fieldErrors?.title).toEqual(["Give this booking a title."]);
  });

  it("rejects edits to missing and cancelled rows", async () => {
    const edit = { berthId: "north-pier-face", startDate: "2026-09-21", endDate: "2026-09-25" };
    const missing = expectFail(await updateReservation(db, { ...edit, id: "r_nope", version: 1 }, AT));
    expect(missing).toMatchObject({ code: "NOT_FOUND", message: "This reservation no longer exists. The demo data may have been reset." });

    const id = await stay(db, "north-pier-face", "v_tidewater", "2026-09-21", "2026-09-25");
    expectOk(await cancelReservation(db, { id, version: 1 }, AT));
    expect(expectFail(await updateReservation(db, { ...edit, id, version: 2 }, AT)).code).toBe("INVALID_STATE");
  });

  it("maps a lost race on update to CONFLICT", async () => {
    const id = await stay(db, "north-pier-face", "v_tidewater", "2026-09-21", "2026-09-25");
    const failed = expectFail(
      await updateReservation(
        db,
        { id, version: 1, berthId: "north-pier-face", startDate: "2026-10-05", endDate: "2026-10-09" },
        { ...AT, afterPreCheck: rivalBooks("r_rival", "north-pier-face", "2026-10-09", "2026-10-11") },
      ),
    );
    expect(failed.code).toBe("CONFLICT");
    expect(failed.conflicts?.[0]).toMatchObject({ id: "r_rival", label: "R/V Golden Compass", berthName: "North Pier Face" });
    expect(await reservationById(id)).toMatchObject({ startDate: "2026-09-21", version: 1 });
  });
});

describe("cancelReservation", () => {
  it("soft-cancels and is idempotent", async () => {
    const id = await stay(db, "north-pier-east", "v_tidewater", "2026-09-21", "2026-09-25");
    const first = expectOk(await cancelReservation(db, { id, version: 1 }, AT));
    expect(first.data).toEqual({ id, version: 2 });
    const row = await reservationById(id);
    expect(row.status).toBe("cancelled");
    expect(row.cancelledAt).toBeInstanceOf(Date);

    // Same request again (double click, or a stale tab): still a success, nothing changes.
    const again = expectOk(await cancelReservation(db, { id, version: 1 }, AT));
    expect(again.data).toEqual({ id, version: 2 });
    expect(await mutations()).toBe(2); // the booking and one cancel
  });

  it("frees the days for a new confirmed booking", async () => {
    const id = await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-30");
    const slot = { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2026-09-21", endDate: "2026-09-30" } as const;
    expect(expectFail(await createReservation(db, slot, AT)).code).toBe("CONFLICT");
    expectOk(await cancelReservation(db, { id, version: 1 }, AT));
    expectOk(await createReservation(db, slot, AT));
  });

  it("cancels a stay in progress, but not one that has ended", async () => {
    const inPort = await stayInProgress();
    expectOk(await cancelReservation(db, { id: inPort, version: 1 }, AT));

    const ended = await stay(db, "south-float-east", "v_tidewater", "2026-09-08", "2026-09-12", "2026-09-01");
    const failed = expectFail(await cancelReservation(db, { id: ended, version: 1 }, AT));
    expect(failed.code).toBe("INVALID_STATE");
    expect(failed.message).toBe("This stay ended on Sep 12, 2026 and can no longer be changed.");
    expect((await reservationById(ended)).status).toBe("confirmed");
  });

  it("checks the version and the id", async () => {
    const id = await stay(db, "north-pier-east", "v_tidewater", "2026-09-21", "2026-09-25");
    expect(expectFail(await cancelReservation(db, { id, version: 7 }, AT)).code).toBe("STALE");
    expect(expectFail(await cancelReservation(db, { id: "r_nope", version: 1 }, AT)).code).toBe("NOT_FOUND");
  });
});

describe("restoreReservation", () => {
  it("restores a cancelled booking while its days are still free, and refuses once they are taken", async () => {
    const id = await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-30");
    expectOk(await cancelReservation(db, { id, version: 1 }, AT));
    const restored = expectOk(await restoreReservation(db, { id, version: 2 }, AT));
    expect(restored.data).toEqual({ id, version: 3 });
    expect(await reservationById(id)).toMatchObject({ status: "confirmed", cancelledAt: null });

    expectOk(await cancelReservation(db, { id, version: 3 }, AT));
    const newcomer = await stay(db, "south-float-east", "v_tidewater", "2026-09-24", "2026-09-25");
    const blocked = expectFail(await restoreReservation(db, { id, version: 4 }, AT));
    expect(blocked.code).toBe("CONFLICT");
    expect(blocked.message).toBe("South Float East is taken Sep 24 to Sep 25, 2026 by R/V Tidewater.");
    expect(blocked.conflicts).toEqual([{ id: newcomer, label: "R/V Tidewater", berthName: "South Float East", startDate: "2026-09-24", endDate: "2026-09-25" }]);
    expect((await reservationById(id)).status).toBe("cancelled");
  });

  it("refuses once the stay's dates have passed", async () => {
    const id = await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-30");
    expectOk(await cancelReservation(db, { id, version: 1 }, AT));
    const failed = expectFail(await restoreReservation(db, { id, version: 2 }, { today: "2026-10-01" }));
    expect(failed.code).toBe("INVALID_STATE");
    expect(failed.message).toBe("This stay ended on Sep 30, 2026 and can no longer be changed.");
    // On its last day it can still come back.
    expectOk(await restoreReservation(db, { id, version: 2 }, { today: "2026-09-30" }));
  });

  it("refuses while the berth is retired", async () => {
    const id = await stay(db, "north-pier-face", "v_tidewater", "2026-09-21", "2026-09-25");
    expectOk(await cancelReservation(db, { id, version: 1 }, AT));
    expectOk(await retireBerth(db, { berthId: "north-pier-face", version: 1 }, AT));
    const failed = expectFail(await restoreReservation(db, { id, version: 2 }, AT));
    expect(failed.code).toBe("INVALID_STATE");
    expect(failed.message).toContain("North Pier Face has been retired, so this stay cannot be restored there.");
  });

  it("refuses when the vessel or the berth changed while it was cancelled and it no longer fits", async () => {
    const onFace = await stay(db, "north-pier-face", "v_tidewater", "2026-09-21", "2026-09-25");
    expectOk(await cancelReservation(db, { id: onFace, version: 1 }, AT));
    // Nothing holds the length in place now, so the correction goes through...
    expectOk(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 80 }, AT));
    // ...and the cancelled stay cannot come back onto a 75 ft berth.
    const tooLong = expectFail(await restoreReservation(db, { id: onFace, version: 2 }, AT));
    expect(tooLong.code).toBe("TOO_LONG");
    expect(tooLong.fit).toEqual({ vesselFt: 80, berthFt: 75, overByFt: 5 });

    const onFloat = await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-25");
    expectOk(await cancelReservation(db, { id: onFloat, version: 1 }, AT));
    expectOk(await updateBerth(db, { berthId: "south-float-east", version: 1, name: "South Float East", lengthFt: 70 }, AT));
    expect(expectFail(await restoreReservation(db, { id: onFloat, version: 2 }, AT)).fit).toEqual({ vesselFt: 85, berthFt: 70, overByFt: 15 });
  });

  it("is idempotent on a confirmed row and checks the version otherwise", async () => {
    const id = await stay(db, "north-pier-east", "v_tidewater", "2026-09-21", "2026-09-25");
    expect(expectOk(await restoreReservation(db, { id, version: 99 }, AT)).data.version).toBe(1);
    expectOk(await cancelReservation(db, { id, version: 1 }, AT));
    expect(expectFail(await restoreReservation(db, { id, version: 99 }, AT)).code).toBe("STALE");
    expect(expectFail(await restoreReservation(db, { id: "r_nope", version: 1 }, AT)).code).toBe("NOT_FOUND");
  });

  it("maps a lost race on restore to CONFLICT", async () => {
    const id = await stay(db, "south-float-west", "v_tidewater", "2026-09-21", "2026-09-25");
    expectOk(await cancelReservation(db, { id, version: 1 }, AT));
    const failed = expectFail(await restoreReservation(db, { id, version: 2 }, { ...AT, afterPreCheck: rivalBooks("r_rival", "south-float-west", "2026-09-25", "2026-09-26") }));
    expect(failed.code).toBe("CONFLICT");
    expect(failed.message).toBe("South Float West is taken Sep 25 to Sep 26, 2026 by R/V Golden Compass.");
    expect((await reservationById(id)).status).toBe("cancelled");
  });
});

describe("mutation counter", () => {
  it("counts every successful write and nothing else", async () => {
    expect(await mutations()).toBe(0);
    const id = await stay(db, "north-pier-east", "v_tidewater", "2026-09-21", "2026-09-25"); // 1
    expectFail(await createReservation(db, { kind: "vessel", berthId: "north-pier-east", vesselId: "v_amber-reef", startDate: "2026-09-25", endDate: "2026-09-26" }, AT));
    expectOk(await updateReservation(db, { id, version: 1, berthId: "north-pier-east", startDate: "2026-09-21", endDate: "2026-09-26" }, AT)); // 2
    expectFail(await updateReservation(db, { id, version: 1, berthId: "north-pier-east", startDate: "2026-09-21", endDate: "2026-09-27" }, AT));
    expectOk(await cancelReservation(db, { id, version: 2 }, AT)); // 3
    expectOk(await cancelReservation(db, { id, version: 2 }, AT)); // idempotent repeat: not a write
    expectOk(await restoreReservation(db, { id, version: 3 }, AT)); // 4
    expect(await mutations()).toBe(4);
  });
});
