import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appMeta, berths } from "../../db/schema";
import type { Db } from "../../db/types";
import { createBerth, restoreBerth, retireBerth, updateBerth } from "../berths";
import { cancelReservation } from "../reservations";
import { AT, book, createTestDb, expectFail, expectOk, seedFixture, stay } from "./helpers";

let db: Db;

beforeAll(async () => {
  ({ db } = await createTestDb());
}, 60_000);

beforeEach(() => seedFixture(db));

const berthById = async (id: string) => (await db.select().from(berths).where(eq(berths.id, id)))[0];
const mutations = async () => (await db.select().from(appMeta))[0].mutationsSinceReset;

describe("createBerth", () => {
  it("adds a berth at the end of the dock order, with the slug of its name as its id", async () => {
    const created = expectOk(await createBerth(db, { name: "  Fuel   Dock ", lengthFt: 120 }));
    expect(created.data.id).toBe("fuel-dock");
    expect(await berthById("fuel-dock")).toMatchObject({ name: "Fuel Dock", lengthFt: 120, sortOrder: 7, version: 1, retiredAt: null });
    expect((await berthById(expectOk(await createBerth(db, { name: "Work Float", lengthFt: 40 })).data.id)).sortOrder).toBe(8);
    expect(await mutations()).toBe(2);
  });

  it("refuses a name that is already in use, whatever the casing", async () => {
    const failed = expectFail(await createBerth(db, { name: "north pier WEST", lengthFt: 100 }));
    expect(failed.code).toBe("VALIDATION");
    expect(failed.message).toBe("A berth named North Pier West already exists.");
    expect(failed.fieldErrors?.name).toEqual([failed.message]);
  });

  it("refuses the name of a retired berth too, and points at restoring it", async () => {
    expectOk(await retireBerth(db, { berthId: "inner-channel", version: 1 }, AT));
    const failed = expectFail(await createBerth(db, { name: "Inner Channel", lengthFt: 55 }));
    expect(failed.message).toBe("A berth named Inner Channel already exists (retired). Restore it instead of adding it again.");
  });

  it("finds a free id when the slug belongs to a berth that now goes by another name", async () => {
    expectOk(await updateBerth(db, { berthId: "inner-channel", version: 1, name: "Old Channel", lengthFt: 55 }, AT));
    expectOk(await retireBerth(db, { berthId: "inner-channel", version: 2 }, AT));
    expect(expectOk(await createBerth(db, { name: "Inner Channel", lengthFt: 60 })).data.id).toBe("inner-channel-2");
    // "Inner-Channel" is a different name with the same slug.
    expect(expectOk(await createBerth(db, { name: "Inner-Channel", lengthFt: 60 })).data.id).toBe("inner-channel-3");
  });

  it("validates the name and the length", async () => {
    expect(expectFail(await createBerth(db, { name: " A ", lengthFt: 100 })).fieldErrors?.name).toEqual(["The berth's name needs at least 2 characters."]);
    expect(expectFail(await createBerth(db, { name: "x".repeat(61), lengthFt: 100 })).fieldErrors?.name).toBeDefined();
    expect(expectFail(await createBerth(db, { name: "--", lengthFt: 100 })).fieldErrors?.name).toBeDefined();
    for (const lengthFt of [0, 12.5, 2001, Number.NaN]) {
      const failed = expectFail(await createBerth(db, { name: "Fuel Dock", lengthFt }));
      expect(failed.code).toBe("VALIDATION");
      expect(failed.fieldErrors?.lengthFt).toBeDefined();
    }
    expectOk(await createBerth(db, { name: "Fuel Dock", lengthFt: 2000 }));
  });
});

describe("updateBerth", () => {
  it("renames and resizes without changing the id", async () => {
    const updated = expectOk(await updateBerth(db, { berthId: "north-pier-face", version: 1, name: "Visitor Dock", lengthFt: 80 }, AT));
    expect(updated.data).toEqual({ id: "north-pier-face", version: 2 });
    expect(await berthById("north-pier-face")).toMatchObject({ id: "north-pier-face", name: "Visitor Dock", lengthFt: 80, sortOrder: 2, version: 2 });
    expect(await mutations()).toBe(1);
  });

  it("refuses to shorten a berth under a vessel that is still booked on it, naming the stay", async () => {
    // South Float East is 90 ft. Amber Reef is 85 ft, Tidewater 60 ft.
    const amberReef = await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-25");
    await stay(db, "south-float-east", "v_tidewater", "2026-10-05", "2026-10-09");

    const failed = expectFail(await updateBerth(db, { berthId: "south-float-east", version: 1, name: "South Float East", lengthFt: 70 }, AT));
    expect(failed.code).toBe("TOO_LONG");
    expect(failed.message).toBe(
      "South Float East cannot be shortened to 70 ft. OSV Amber Reef (85 ft) is booked there Sep 21 to Sep 25, 2026 and would be 15 ft too long. Move or cancel that stay first.",
    );
    expect(failed.conflicts).toEqual([{ id: amberReef, label: "OSV Amber Reef", berthName: "South Float East", startDate: "2026-09-21", endDate: "2026-09-25" }]);
    expect(failed.fit).toEqual({ vesselFt: 85, berthFt: 70, overByFt: 15 });
    expect(failed.fieldErrors?.lengthFt).toEqual([failed.message]);
    expect(await berthById("south-float-east")).toMatchObject({ lengthFt: 90, version: 1 });

    const both = expectFail(await updateBerth(db, { berthId: "south-float-east", version: 1, name: "South Float East", lengthFt: 50 }, AT));
    expect(both.conflicts).toHaveLength(2);
    expect(both.message).toContain("and 1 other stay would no longer fit either. Move or cancel them first.");

    // Down to the longest vessel still booked there is fine.
    expectOk(await updateBerth(db, { berthId: "south-float-east", version: 1, name: "South Float East", lengthFt: 85 }, AT));
  });

  it("is held only by stays that have not ended: history, cancelled stays, events and closures do not count", async () => {
    await stay(db, "south-float-east", "v_amber-reef", "2026-09-08", "2026-09-12", "2026-09-01"); // ended by TODAY
    const cancelled = await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-25");
    expectOk(await cancelReservation(db, { id: cancelled, version: 1 }, AT));
    await book(db, { kind: "closure", berthId: "south-float-east", title: "Decking repair", startDate: "2026-10-01", endDate: "2026-10-10" });

    expectOk(await updateBerth(db, { berthId: "south-float-east", version: 1, name: "South Float East", lengthFt: 30 }, AT));
    expect((await berthById("south-float-east")).lengthFt).toBe(30);
  });

  it("refuses a rename onto another berth's name, but not a re-spelling of its own", async () => {
    const failed = expectFail(await updateBerth(db, { berthId: "north-pier-face", version: 1, name: "inner channel", lengthFt: 75 }, AT));
    expect(failed.code).toBe("VALIDATION");
    expect(failed.message).toBe("A berth named Inner Channel already exists.");
    expectOk(await updateBerth(db, { berthId: "north-pier-face", version: 1, name: "NORTH PIER FACE", lengthFt: 75 }, AT));
  });

  it("checks the version and the id", async () => {
    expect(expectFail(await updateBerth(db, { berthId: "north-pier-face", version: 9, name: "North Pier Face", lengthFt: 75 }, AT)).code).toBe("STALE");
    expect(expectFail(await updateBerth(db, { berthId: "nowhere", version: 1, name: "Nowhere", lengthFt: 75 }, AT)).code).toBe("NOT_FOUND");
  });
});

describe("retireBerth and restoreBerth", () => {
  it("refuses while a confirmed stay on the berth has not ended, and allows it once they are cancelled or over", async () => {
    await stay(db, "north-pier-face", "v_tidewater", "2026-09-08", "2026-09-12", "2026-09-01"); // ended by TODAY: never in the way
    const inPort = await stay(db, "north-pier-face", "v_tidewater", "2026-09-15", "2026-09-22", "2026-09-10");
    const event = await book(db, { kind: "event", berthId: "north-pier-face", title: "Community sail day", startDate: "2026-10-03", endDate: "2026-10-03" });

    const failed = expectFail(await retireBerth(db, { berthId: "north-pier-face", version: 1 }, AT));
    expect(failed.code).toBe("CONFLICT");
    expect(failed.message).toBe("North Pier Face still has 2 stays that have not ended, starting with R/V Tidewater, Sep 15 to Sep 22, 2026. Move or cancel them first.");
    expect(failed.conflicts).toEqual([
      { id: inPort, label: "R/V Tidewater", berthName: "North Pier Face", startDate: "2026-09-15", endDate: "2026-09-22" },
      { id: event, label: "Community sail day", berthName: "North Pier Face", startDate: "2026-10-03", endDate: "2026-10-03" },
    ]);
    expect((await berthById("north-pier-face")).retiredAt).toBeNull();

    expectOk(await cancelReservation(db, { id: event, version: 1 }, AT));
    const one = expectFail(await retireBerth(db, { berthId: "north-pier-face", version: 1 }, AT));
    expect(one.message).toBe("North Pier Face still has a stay that has not ended: R/V Tidewater, Sep 15 to Sep 22, 2026. Move or cancel it first.");

    // The day after the last stay ends, nothing is in the way any more.
    const retired = expectOk(await retireBerth(db, { berthId: "north-pier-face", version: 1 }, { today: "2026-09-23" }));
    expect(retired.data).toEqual({ id: "north-pier-face", version: 2 });
    expect((await berthById("north-pier-face")).retiredAt).toBeInstanceOf(Date);
  });

  it("is idempotent, checks the version, and restores", async () => {
    expect(expectFail(await retireBerth(db, { berthId: "inner-channel", version: 4 }, AT)).code).toBe("STALE");
    expect(expectFail(await retireBerth(db, { berthId: "nowhere", version: 1 }, AT)).code).toBe("NOT_FOUND");
    expectOk(await retireBerth(db, { berthId: "inner-channel", version: 1 }, AT));
    expect(expectOk(await retireBerth(db, { berthId: "inner-channel", version: 1 }, AT)).data.version).toBe(2);

    expect(expectFail(await restoreBerth(db, { berthId: "inner-channel", version: 1 })).code).toBe("STALE");
    const restored = expectOk(await restoreBerth(db, { berthId: "inner-channel", version: 2 }));
    expect(restored.data).toEqual({ id: "inner-channel", version: 3 });
    expect(await berthById("inner-channel")).toMatchObject({ retiredAt: null, sortOrder: 4, version: 3 });
    expect(expectOk(await restoreBerth(db, { berthId: "inner-channel", version: 1 })).data.version).toBe(3);
    expect(await mutations()).toBe(2);

    // Back in use means bookable again.
    await stay(db, "inner-channel", "v_silver-gull", "2026-09-21", "2026-09-22");
  });

  it("never retires the last berth in use", async () => {
    for (const berthId of ["north-pier-west", "north-pier-face", "north-pier-east", "inner-channel", "south-float-west"]) {
      expectOk(await retireBerth(db, { berthId, version: 1 }, AT));
    }
    const failed = expectFail(await retireBerth(db, { berthId: "south-float-east", version: 1 }, AT));
    expect(failed.code).toBe("INVALID_STATE");
    expect(failed.message).toBe("South Float East is the only berth still in use, so it cannot be retired. Add another berth first.");

    expectOk(await createBerth(db, { name: "Fuel Dock", lengthFt: 120 }));
    expectOk(await retireBerth(db, { berthId: "south-float-east", version: 1 }, AT));
  });
});
