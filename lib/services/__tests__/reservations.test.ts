import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appMeta, issues, reservations, vessels } from "../../db/schema";
import type { Db, Tx } from "../../db/types";
import { cancelReservation, confirmReservation, createReservation, updateReservation } from "../reservations";
import { createTestDb, expectFail, expectOk, seedFixture } from "./helpers";

let db: Db;

beforeAll(async () => {
  ({ db } = await createTestDb());
}, 60_000);

beforeEach(() => seedFixture(db));
afterEach(() => vi.restoreAllMocks());

const reservationById = async (id: string) => (await db.select().from(reservations).where(eq(reservations.id, id)))[0];
const vesselById = async (id: string) => (await db.select().from(vessels).where(eq(vessels.id, id)))[0];
const openIssuesOf = (reservationId: string) => db.select().from(issues).where(and(eq(issues.reservationId, reservationId), isNull(issues.resolvedAt)));
const mutations = async () => (await db.select().from(appMeta))[0].mutationsSinceReset;

/** A rival request that wins the berth in the gap between our pre-check and our write. */
const rivalBooks = (id: string, berthId: string, startDate: string, endDate: string) => async (tx: Tx) => {
  await tx.insert(reservations).values({ id, berthId, kind: "vessel", vesselId: "v_golden-compass", startDate, endDate, status: "confirmed" });
};

describe("createReservation", () => {
  it("books a vessel that fits into a free slot", async () => {
    const { data, warning } = expectOk(
      await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2019-07-20", endDate: "2019-07-22", notes: "ETA 0900" }),
    );
    expect(warning).toBeUndefined();
    expect(data.id).toMatch(/^a_[0-9a-f]{16}$/);
    expect(await reservationById(data.id)).toMatchObject({
      berthId: "south-float-east", kind: "vessel", vesselId: "v_tidewater", title: null, startDate: "2019-07-20", endDate: "2019-07-22",
      status: "confirmed", source: "app", sourceRef: null, notes: "ETA 0900", version: 1,
    });
    expect(await mutations()).toBe(1);
  });

  it("refuses an overlap and names the booking in the way", async () => {
    const failed = expectFail(
      await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2017-07-15", endDate: "2017-07-20" }),
    );
    expect(failed.code).toBe("CONFLICT");
    expect(failed.message).toBe("South Float East is taken Jul 9 to Jul 18, 2017 by OSV Amber Reef.");
    expect(failed.conflicts).toEqual([{ id: "r_fx_amberreef_sfe", label: "OSV Amber Reef", startDate: "2017-07-09", endDate: "2017-07-18", status: "confirmed" }]);
    expect(await mutations()).toBe(0);
  });

  it("treats a stay that starts on another's last day as a conflict, and the day after as free", async () => {
    const touching = await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2017-07-18", endDate: "2017-07-21" });
    expect(expectFail(touching).code).toBe("CONFLICT");
    expectOk(await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2017-07-19", endDate: "2017-07-21" }));
  });

  it("blocks events and closures on an occupied berth too", async () => {
    const failed = expectFail(await createReservation(db, { kind: "closure", berthId: "south-float-east", title: "Float rebuild", startDate: "2017-07-01", endDate: "2017-07-31" }));
    expect(failed.code).toBe("CONFLICT");
  });

  it("only cautions when the overlap is an unresolved legacy row", async () => {
    const { data, warning } = expectOk(
      await createReservation(db, { kind: "vessel", berthId: "south-float-west", vesselId: "v_tidewater", startDate: "2019-07-10", endDate: "2019-07-12" }),
    );
    expect(warning).toContain("South Float West also has an unresolved entry from the old schedule for Jul 8 to Jul 11, 2019 (Unlabelled booking)");
    expect((await reservationById(data.id)).status).toBe("confirmed");
  });

  it("ignores cancelled bookings when checking for conflicts", async () => {
    expectOk(await cancelReservation(db, { id: "r_fx_amberreef_sfe", version: 1 }));
    expectOk(await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2017-07-10", endDate: "2017-07-12" }));
  });

  it("refuses a vessel that is too long and reports by how much, even on a probable length", async () => {
    const failed = expectFail(
      await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_far-horizon", startDate: "2019-09-02", endDate: "2019-09-04" }),
    );
    expect(failed.code).toBe("TOO_LONG");
    expect(failed.fit).toEqual({ vesselFt: 170, berthFt: 90, overByFt: 80 });
    expect(failed.message).toBe("M/Y Far Horizon is 170 ft; South Float East is 90 ft. It is 80 ft too long for this berth.");
  });

  it("accepts a probable length without asking for it again", async () => {
    expectOk(await createReservation(db, { kind: "vessel", berthId: "north-pier-west", vesselId: "v_far-horizon", startDate: "2019-09-02", endDate: "2019-09-04" }));
    expect(await vesselById("v_far-horizon")).toMatchObject({ lengthStatus: "probable", version: 1 });
  });

  it("asks for a length when none is on file, then verifies the vessel with the one supplied", async () => {
    const request = { kind: "vessel", berthId: "south-float-west", vesselId: "v_long-ketch", startDate: "2019-09-02", endDate: "2019-09-04" } as const;
    const failed = expectFail(await createReservation(db, request));
    expect(failed.code).toBe("LENGTH_REQUIRED");
    expect(failed.message).toContain("no length on file for S/V Long Ketch");
    expect(failed.fieldErrors?.vesselLengthFt).toBeDefined();

    expectOk(await createReservation(db, { ...request, vesselLengthFt: 45 }));
    expect(await vesselById("v_long-ketch")).toMatchObject({ lengthFt: 45, lengthStatus: "verified", version: 2 });
  });

  it("names the candidate lengths for a conflicting vessel and settles the conflict once a length is given", async () => {
    const request = { kind: "vessel", berthId: "north-pier-west", vesselId: "v_iron-petrel", startDate: "2019-09-02", endDate: "2019-09-04" } as const;
    const failed = expectFail(await createReservation(db, request));
    expect(failed.code).toBe("LENGTH_REQUIRED");
    expect(failed.message).toContain("120 ft or 135 ft");

    expectOk(await createReservation(db, { ...request, vesselLengthFt: 135 }));
    expect(await vesselById("v_iron-petrel")).toMatchObject({ lengthFt: 135, lengthStatus: "verified" });
    const [finding] = await db.select().from(issues).where(eq(issues.id, "i_fx_length_ironpetrel"));
    expect(finding.resolvedAt).toBeInstanceOf(Date);
  });

  it("saves nothing, not even the supplied length, when the booking is refused", async () => {
    const failed = expectFail(
      await createReservation(db, { kind: "vessel", berthId: "inner-channel", vesselId: "v_long-ketch", vesselLengthFt: 64, startDate: "2019-09-02", endDate: "2019-09-04" }),
    );
    expect(failed.code).toBe("TOO_LONG");
    expect(failed.fit).toEqual({ vesselFt: 64, berthFt: 55, overByFt: 9 });
    expect(await vesselById("v_long-ketch")).toMatchObject({ lengthFt: null, lengthStatus: "unknown", version: 1 });
  });

  it("requires a title for events and closures, and a vessel for vessel bookings", async () => {
    const noTitle = expectFail(await createReservation(db, { kind: "event", berthId: "north-pier-face", startDate: "2019-09-02", endDate: "2019-09-02", title: "   " }));
    expect(noTitle.code).toBe("VALIDATION");
    expect(noTitle.fieldErrors?.title).toBeDefined();

    const noVessel = expectFail(await createReservation(db, { kind: "vessel", berthId: "north-pier-face", startDate: "2019-09-02", endDate: "2019-09-02" }));
    expect(noVessel.code).toBe("VALIDATION");
    expect(noVessel.fieldErrors?.vesselId).toBeDefined();

    const { data } = expectOk(await createReservation(db, { kind: "event", berthId: "north-pier-face", startDate: "2019-09-02", endDate: "2019-09-02", title: " Dive training " }));
    expect(await reservationById(data.id)).toMatchObject({ kind: "event", title: "Dive training", vesselId: null });
  });

  it("registers a new vessel on the fly, and reuses it by name the next time", async () => {
    const first = expectOk(
      await createReservation(db, { kind: "vessel", berthId: "north-pier-east", newVessel: { name: "r/v SEA FOX", lengthFt: 95 }, startDate: "2019-09-02", endDate: "2019-09-04" }),
    );
    const vessel = await vesselById("v_sea-fox");
    expect(vessel).toMatchObject({ name: "Sea Fox", nameKey: "SEA FOX", prefix: "R/V", lengthFt: 95, lengthStatus: "verified", origin: "app" });
    expect((await reservationById(first.data.id)).vesselId).toBe("v_sea-fox");

    const again = expectOk(
      await createReservation(db, { kind: "vessel", berthId: "north-pier-east", newVessel: { name: "Sea  fox", prefix: "M/V", lengthFt: 99 }, startDate: "2019-09-10", endDate: "2019-09-12" }),
    );
    expect((await reservationById(again.data.id)).vesselId).toBe("v_sea-fox");
    expect(again.warning).toContain("R/V Sea Fox already has 95 ft on file");
    expect(await db.select().from(vessels).where(eq(vessels.nameKey, "SEA FOX"))).toHaveLength(1);
    expect((await vesselById("v_sea-fox")).lengthFt).toBe(95);
  });

  it("lets a typed length fill the gap when the reused vessel has none", async () => {
    expectOk(await createReservation(db, { kind: "vessel", berthId: "south-float-west", newVessel: { name: "S/V Long Ketch", lengthFt: 45 }, startDate: "2019-09-02", endDate: "2019-09-04" }));
    expect(await vesselById("v_long-ketch")).toMatchObject({ lengthFt: 45, lengthStatus: "verified" });
  });

  it("does not leave a new vessel behind when its booking is refused", async () => {
    const failed = expectFail(
      await createReservation(db, { kind: "vessel", berthId: "inner-channel", newVessel: { name: "Barge Goliath", lengthFt: 200 }, startDate: "2019-09-02", endDate: "2019-09-04" }),
    );
    expect(failed.code).toBe("TOO_LONG");
    expect(await db.select().from(vessels).where(eq(vessels.nameKey, "GOLIATH"))).toHaveLength(0);
  });

  it("allows backdated bookings, but not before the schedule began", async () => {
    expectOk(await createReservation(db, { kind: "vessel", berthId: "north-pier-west", vesselId: "v_tidewater", startDate: "1997-01-01", endDate: "1997-01-05" }));
    const tooEarly = expectFail(await createReservation(db, { kind: "vessel", berthId: "north-pier-west", vesselId: "v_tidewater", startDate: "1996-12-31", endDate: "1997-01-05" }));
    expect(tooEarly.code).toBe("VALIDATION");
    expect(tooEarly.fieldErrors?.startDate).toBeDefined();
  });

  it("validates dates in order: real dates, start before end, then the 731 day limit", async () => {
    const base = { kind: "vessel", berthId: "north-pier-west", vesselId: "v_tidewater" } as const;
    const notReal = expectFail(await createReservation(db, { ...base, startDate: "2019-02-29", endDate: "2019-03-02" }));
    expect(notReal).toMatchObject({ code: "VALIDATION", fieldErrors: { startDate: ["Start date must be a real calendar date."] } });

    const backwards = expectFail(await createReservation(db, { ...base, startDate: "2020-03-02", endDate: "2020-03-01" }));
    expect(backwards).toMatchObject({ code: "VALIDATION", message: "The end date is before the start date." });

    // 2020-01-01..2021-12-31 is exactly 731 days (2020 is a leap year); one more day is too many.
    expectOk(await createReservation(db, { ...base, startDate: "2020-01-01", endDate: "2021-12-31" }));
    const tooLong = expectFail(await createReservation(db, { ...base, berthId: "north-pier-east", startDate: "2020-01-01", endDate: "2022-01-01" }));
    expect(tooLong.code).toBe("VALIDATION");
    expect(tooLong.fieldErrors?.endDate?.[0]).toContain("731 days");
  });

  it("reports an unknown berth or vessel as NOT_FOUND", async () => {
    expect(expectFail(await createReservation(db, { kind: "event", berthId: "nowhere", title: "X", startDate: "2019-09-02", endDate: "2019-09-02" })).code).toBe("NOT_FOUND");
    expect(expectFail(await createReservation(db, { kind: "vessel", berthId: "north-pier-west", vesselId: "v_ghost", startDate: "2019-09-02", endDate: "2019-09-02" })).code).toBe("NOT_FOUND");
  });

  it("maps a lost race (23P01 from the exclusion constraint) to the same CONFLICT, naming the winner", async () => {
    const failed = expectFail(
      await createReservation(
        db,
        { kind: "vessel", berthId: "north-pier-west", vesselId: "v_long-ketch", vesselLengthFt: 45, startDate: "2019-09-02", endDate: "2019-09-06" },
        { afterPreCheck: rivalBooks("a_rival", "north-pier-west", "2019-09-05", "2019-09-09") },
      ),
    );
    expect(failed.code).toBe("CONFLICT");
    expect(failed.message).toBe("North Pier West is taken Sep 5 to Sep 9, 2019 by R/V Golden Compass.");
    expect(failed.conflicts).toEqual([{ id: "a_rival", label: "R/V Golden Compass", startDate: "2019-09-05", endDate: "2019-09-09", status: "confirmed" }]);
    // The whole transaction rolled back: no booking, and the length supplied with it was not kept either.
    expect(await db.select().from(reservations).where(eq(reservations.berthId, "north-pier-west"))).toHaveLength(5);
    expect((await vesselById("v_long-ketch")).lengthStatus).toBe("unknown");
    expect(await mutations()).toBe(0);
  });
});

describe("updateReservation", () => {
  it("fails with STALE when the row changed since the form was loaded", async () => {
    const edit = { id: "r_fx_tidewater_npf_1", berthId: "north-pier-face", startDate: "2019-07-02", endDate: "2019-07-07" };
    const first = expectOk(await updateReservation(db, { ...edit, version: 1 }));
    expect(first.data).toEqual({ id: "r_fx_tidewater_npf_1", version: 2 });

    const stale = expectFail(await updateReservation(db, { ...edit, endDate: "2019-07-08", version: 1 }));
    expect(stale.code).toBe("STALE");
    expect((await reservationById("r_fx_tidewater_npf_1")).endDate).toBe("2019-07-07");

    expectOk(await updateReservation(db, { ...edit, endDate: "2019-07-08", version: 2 }));
    expect(await reservationById("r_fx_tidewater_npf_1")).toMatchObject({ endDate: "2019-07-08", version: 3 });
  });

  it("refuses a move onto an occupied berth, naming the occupant", async () => {
    const failed = expectFail(
      await updateReservation(db, { id: "r_fx_tidewater_npf_1", version: 1, berthId: "south-float-east", startDate: "2019-07-02", endDate: "2019-07-06" }),
    );
    expect(failed.code).toBe("CONFLICT");
    expect(failed.message).toBe("South Float East is taken Jul 3 to Jul 9, 2019 by M/Y Far Horizon.");
    expect(await reservationById("r_fx_tidewater_npf_1")).toMatchObject({ berthId: "north-pier-face", version: 1 });
  });

  it("does not collide with itself when only the dates shift", async () => {
    expectOk(await updateReservation(db, { id: "r_fx_amberreef_sfe", version: 1, berthId: "south-float-east", startDate: "2017-07-10", endDate: "2017-07-19" }));
  });

  it("lets a legacy misfit change its dates, with a note, but not move to another berth that is too short", async () => {
    const { warning } = expectOk(
      await updateReservation(db, { id: "r_fx_farhorizon_sfe_1", version: 1, berthId: "south-float-east", startDate: "2019-07-03", endDate: "2019-07-10" }),
    );
    expect(warning).toContain("80 ft too long");
    expect(await reservationById("r_fx_farhorizon_sfe_1")).toMatchObject({ endDate: "2019-07-10", version: 2 });

    const moved = expectFail(
      await updateReservation(db, { id: "r_fx_farhorizon_sfe_1", version: 2, berthId: "south-float-west", startDate: "2019-07-12", endDate: "2019-07-14" }),
    );
    expect(moved.code).toBe("TOO_LONG");
    expect(moved.fit).toEqual({ vesselFt: 170, berthFt: 90, overByFt: 80 });
  });

  it("enforces fit on rows created in the app even when nothing but the dates change", async () => {
    const { data } = expectOk(await createReservation(db, { kind: "vessel", berthId: "north-pier-east", vesselId: "v_amber-reef", startDate: "2019-09-02", endDate: "2019-09-04" }));
    await db.update(vessels).set({ lengthFt: 300 }).where(eq(vessels.id, "v_amber-reef"));
    const failed = expectFail(await updateReservation(db, { id: data.id, version: 1, berthId: "north-pier-east", startDate: "2019-09-02", endDate: "2019-09-05" }));
    expect(failed.code).toBe("TOO_LONG");
  });

  it("lets a legacy row with an unknown length change dates without asking for the length", async () => {
    expectOk(await updateReservation(db, { id: "r_fx_longketch_sfw", version: 1, berthId: "south-float-west", startDate: "2019-06-10", endDate: "2019-06-15" }));
    const moved = expectFail(await updateReservation(db, { id: "r_fx_longketch_sfw", version: 2, berthId: "north-pier-west", startDate: "2019-06-10", endDate: "2019-06-15" }));
    expect(moved.code).toBe("LENGTH_REQUIRED");
  });

  it("records a length supplied while fixing a legacy row's dates, and notes the misfit it reveals instead of blocking", async () => {
    const { warning } = expectOk(
      await updateReservation(db, { id: "r_fx_longketch_ic_1", version: 1, berthId: "inner-channel", startDate: "2019-08-05", endDate: "2019-08-10", vesselLengthFt: 60 }),
    );
    expect(warning).toContain("S/V Long Ketch is 60 ft; Inner Channel is 55 ft. It is 5 ft too long for this berth.");
    expect(await vesselById("v_long-ketch")).toMatchObject({ lengthFt: 60, lengthStatus: "verified" });
    expect((await reservationById("r_fx_longketch_ic_1")).endDate).toBe("2019-08-10");
  });

  it("saving a needs_review row confirms it and resolves its issues as edited", async () => {
    // Move pair_b clear of pair_a (Jul 10-16) so the save can confirm it.
    const { data } = expectOk(
      await updateReservation(db, { id: "r_fx_pair_b", version: 1, berthId: "north-pier-east", startDate: "2019-07-17", endDate: "2019-07-20", notes: "Dates corrected" }),
    );
    expect(data.version).toBe(2);
    expect(await reservationById("r_fx_pair_b")).toMatchObject({ status: "confirmed", startDate: "2019-07-17", notes: "Dates corrected", source: "legacy" });
    expect(await openIssuesOf("r_fx_pair_b")).toHaveLength(0);
    const [finding] = await db.select().from(issues).where(eq(issues.id, "i_fx_overlap_b"));
    expect(finding).toMatchObject({ resolution: "edited" });
    expect(finding.resolvedAt).toBeInstanceOf(Date);
    // The other half of the pair is untouched and still waiting for its own review.
    expect(await openIssuesOf("r_fx_pair_a")).toHaveLength(1);
    expect(await mutations()).toBe(1);
  });

  it("cautions, but saves, when the new dates still overlap an unresolved legacy row", async () => {
    const { warning } = expectOk(await updateReservation(db, { id: "r_fx_pair_b", version: 1, berthId: "north-pier-east", startDate: "2019-07-14", endDate: "2019-07-20" }));
    expect(warning).toContain("R/V Tidewater");
    expect((await reservationById("r_fx_pair_b")).status).toBe("confirmed");
  });

  it("keeps fields that were not sent, and can change the vessel or the title", async () => {
    expectOk(await updateReservation(db, { id: "r_fx_goldencompass_npf", version: 1, berthId: "north-pier-face", startDate: "2019-07-16", endDate: "2019-07-22", vesselId: "v_tidewater" }));
    expect(await reservationById("r_fx_goldencompass_npf")).toMatchObject({ vesselId: "v_tidewater", notes: "Fueling @0800" });

    expectOk(await updateReservation(db, { id: "r_fx_sailday_npf", version: 1, berthId: "north-pier-face", startDate: "2019-07-13", endDate: "2019-07-13", title: "Community sail weekend" }));
    expect(await reservationById("r_fx_sailday_npf")).toMatchObject({ title: "Community sail weekend", vesselId: null });
  });

  it("rejects edits to missing and cancelled rows", async () => {
    const edit = { berthId: "north-pier-face", startDate: "2019-07-02", endDate: "2019-07-06" };
    const missing = expectFail(await updateReservation(db, { ...edit, id: "r_nope", version: 1 }));
    expect(missing).toMatchObject({ code: "NOT_FOUND", message: "This reservation no longer exists. The demo data may have been reset." });

    expectOk(await cancelReservation(db, { id: "r_fx_tidewater_npf_1", version: 1 }));
    expect(expectFail(await updateReservation(db, { ...edit, id: "r_fx_tidewater_npf_1", version: 2 })).code).toBe("INVALID_STATE");
  });

  it("maps a lost race on update to CONFLICT", async () => {
    const failed = expectFail(
      await updateReservation(
        db,
        { id: "r_fx_tidewater_npf_1", version: 1, berthId: "north-pier-face", startDate: "2019-09-02", endDate: "2019-09-06" },
        { afterPreCheck: rivalBooks("a_rival", "north-pier-face", "2019-09-06", "2019-09-08") },
      ),
    );
    expect(failed.code).toBe("CONFLICT");
    expect(failed.conflicts?.[0]).toMatchObject({ id: "a_rival", label: "R/V Golden Compass" });
    expect(await reservationById("r_fx_tidewater_npf_1")).toMatchObject({ startDate: "2019-07-02", version: 1 });
  });
});

describe("cancelReservation", () => {
  it("soft-cancels, resolves open issues, frees the slot, and is idempotent", async () => {
    const first = expectOk(await cancelReservation(db, { id: "r_fx_pair_a", version: 1 }));
    expect(first.data).toEqual({ id: "r_fx_pair_a", version: 2 });
    const row = await reservationById("r_fx_pair_a");
    expect(row.status).toBe("cancelled");
    expect(row.cancelledAt).toBeInstanceOf(Date);
    const [finding] = await db.select().from(issues).where(eq(issues.id, "i_fx_overlap_a"));
    expect(finding.resolution).toBe("cancelled");

    // Same request again (double click, or a stale tab): still a success, nothing changes.
    const again = expectOk(await cancelReservation(db, { id: "r_fx_pair_a", version: 1 }));
    expect(again.data).toEqual({ id: "r_fx_pair_a", version: 2 });
    expect(await mutations()).toBe(1);
  });

  it("frees the berth for a new confirmed booking", async () => {
    const slot = { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2017-07-09", endDate: "2017-07-18" } as const;
    expect(expectFail(await createReservation(db, slot)).code).toBe("CONFLICT");
    expectOk(await cancelReservation(db, { id: "r_fx_amberreef_sfe", version: 1 }));
    expectOk(await createReservation(db, slot));
  });

  it("checks the version and the id", async () => {
    expect(expectFail(await cancelReservation(db, { id: "r_fx_pair_a", version: 7 })).code).toBe("STALE");
    expect(expectFail(await cancelReservation(db, { id: "r_nope", version: 1 })).code).toBe("NOT_FOUND");
  });
});

describe("confirmReservation", () => {
  it("confirms the first of a colliding pair; the second then fails naming the first", async () => {
    const first = expectOk(await confirmReservation(db, { id: "r_fx_pair_a", version: 1 }));
    expect(first.data).toEqual({ id: "r_fx_pair_a", version: 2 });
    expect(first.warning).toContain("OSV Amber Reef"); // the other half still overlaps, as a caution
    expect((await reservationById("r_fx_pair_a")).status).toBe("confirmed");
    const [finding] = await db.select().from(issues).where(eq(issues.id, "i_fx_overlap_a"));
    expect(finding.resolution).toBe("confirmed");

    const second = expectFail(await confirmReservation(db, { id: "r_fx_pair_b", version: 1 }));
    expect(second.code).toBe("CONFLICT");
    expect(second.message).toBe("North Pier East is taken Jul 10 to Jul 16, 2019 by R/V Tidewater.");
    expect(second.conflicts).toEqual([{ id: "r_fx_pair_a", label: "R/V Tidewater", startDate: "2019-07-10", endDate: "2019-07-16", status: "confirmed" }]);
    expect((await reservationById("r_fx_pair_b")).status).toBe("needs_review");
    expect(await openIssuesOf("r_fx_pair_b")).toHaveLength(1);
  });

  it("restores a cancelled booking while its slot is still free, and refuses once it is taken", async () => {
    expectOk(await cancelReservation(db, { id: "r_fx_amberreef_sfe", version: 1 }));
    const restored = expectOk(await confirmReservation(db, { id: "r_fx_amberreef_sfe", version: 2 }));
    expect(restored.data.version).toBe(3);
    expect(await reservationById("r_fx_amberreef_sfe")).toMatchObject({ status: "confirmed", cancelledAt: null });

    expectOk(await cancelReservation(db, { id: "r_fx_amberreef_sfe", version: 3 }));
    expectOk(await createReservation(db, { kind: "vessel", berthId: "south-float-east", vesselId: "v_tidewater", startDate: "2017-07-12", endDate: "2017-07-13" }));
    const blocked = expectFail(await confirmReservation(db, { id: "r_fx_amberreef_sfe", version: 4 }));
    expect(blocked.code).toBe("CONFLICT");
    expect(blocked.conflicts?.[0].label).toBe("R/V Tidewater");
  });

  it("confirms a misfit with a warning instead of blocking", async () => {
    await db.update(reservations).set({ status: "needs_review" }).where(eq(reservations.id, "r_fx_farhorizon_sfe_1"));
    const { warning } = expectOk(await confirmReservation(db, { id: "r_fx_farhorizon_sfe_1", version: 1 }));
    expect(warning).toContain("M/Y Far Horizon is 170 ft; South Float East is 90 ft. It is 80 ft too long for this berth.");
    expect((await reservationById("r_fx_farhorizon_sfe_1")).status).toBe("confirmed");
  });

  it("is idempotent on a confirmed row and checks the version otherwise", async () => {
    expect(expectOk(await confirmReservation(db, { id: "r_fx_amberreef_sfe", version: 99 })).data.version).toBe(1);
    expect(expectFail(await confirmReservation(db, { id: "r_fx_pair_a", version: 99 })).code).toBe("STALE");
    expect(await mutations()).toBe(0);
  });

  it("closes the open warnings on a row that was imported as confirmed", async () => {
    // Most import findings are warnings on rows that are already confirmed; "looks right" has to clear them too.
    expect(await openIssuesOf("r_fx_crossmonth_npw")).toHaveLength(1);

    expect(expectFail(await confirmReservation(db, { id: "r_fx_crossmonth_npw", version: 99 })).code).toBe("STALE");
    expect(await openIssuesOf("r_fx_crossmonth_npw")).toHaveLength(1);
    expect(await mutations()).toBe(0);

    const confirmed = expectOk(await confirmReservation(db, { id: "r_fx_crossmonth_npw", version: 1 }));
    expect(confirmed.data).toEqual({ id: "r_fx_crossmonth_npw", version: 2 });
    expect(await reservationById("r_fx_crossmonth_npw")).toMatchObject({ status: "confirmed", version: 2, startDate: "2019-07-28", endDate: "2019-08-06" });
    expect(await openIssuesOf("r_fx_crossmonth_npw")).toHaveLength(0);
    const [finding] = await db.select().from(issues).where(eq(issues.id, "i_fx_extent_month_end"));
    expect(finding.resolution).toBe("confirmed");
    expect(finding.resolvedAt).toBeInstanceOf(Date);
    expect(await mutations()).toBe(1);

    // With nothing left to close, the same click again is the plain no-op, stale version and all.
    const again = expectOk(await confirmReservation(db, { id: "r_fx_crossmonth_npw", version: 1 }));
    expect(again.data).toEqual({ id: "r_fx_crossmonth_npw", version: 2 });
    expect(await mutations()).toBe(1);
  });

  it("maps a lost race on confirm to CONFLICT", async () => {
    const failed = expectFail(
      await confirmReservation(db, { id: "r_fx_unlabelled_sfw", version: 1 }, { afterPreCheck: rivalBooks("a_rival", "south-float-west", "2019-07-11", "2019-07-12") }),
    );
    expect(failed.code).toBe("CONFLICT");
    expect(failed.message).toBe("South Float West is taken Jul 11 to Jul 12, 2019 by R/V Golden Compass.");
    expect((await reservationById("r_fx_unlabelled_sfw")).status).toBe("needs_review");
  });
});
