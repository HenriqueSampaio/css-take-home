import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appMeta, vessels } from "../../db/schema";
import type { Db } from "../../db/types";
import { cancelReservation } from "../reservations";
import { createVessel, resolveVesselIdentity, updateVessel, type CreateVesselInput } from "../vessels";
import { AT, book, createTestDb, expectFail, expectOk, seedFixture, stay } from "./helpers";

let db: Db;

beforeAll(async () => {
  ({ db } = await createTestDb());
}, 60_000);

beforeEach(() => seedFixture(db));

const vesselById = async (id: string) => (await db.select().from(vessels).where(eq(vessels.id, id)))[0];
const mutations = async () => (await db.select().from(appMeta))[0].mutationsSinceReset;

describe("createVessel", () => {
  it("registers a vessel with its length", async () => {
    const created = expectOk(await createVessel(db, { name: "OS/V NORTHERN LIGHT", lengthFt: 140 }));
    expect(created.data.id).toBe("v_northern-light");
    expect(await vesselById("v_northern-light")).toMatchObject({ name: "Northern Light", nameKey: "NORTHERN LIGHT", prefix: "OSV", lengthFt: 140, version: 1 });
    expect(await mutations()).toBe(1);
  });

  it("requires the length: a vessel without one could never be checked against a berth", async () => {
    const missing = expectFail(await createVessel(db, { name: "Petrel II", prefix: "S/V" } as CreateVesselInput));
    expect(missing.code).toBe("VALIDATION");
    expect(missing.fieldErrors).toEqual({ lengthFt: ["Enter the length in whole feet."] });
    for (const lengthFt of [0, -4, 61.5, 1501, Number.NaN]) {
      expect(expectFail(await createVessel(db, { name: "Petrel II", lengthFt })).fieldErrors?.lengthFt).toBeDefined();
    }
    expect(await db.select().from(vessels).where(eq(vessels.nameKey, "PETREL II"))).toHaveLength(0);
  });

  it("refuses a second vessel with the same name, whatever the prefix or casing, and says what is on file", async () => {
    const failed = expectFail(await createVessel(db, { name: "r/v far horizon", lengthFt: 70 }));
    expect(failed.code).toBe("VALIDATION");
    expect(failed.message).toBe("A vessel named Far Horizon is already registered (M/Y Far Horizon, 170 ft).");
    expect(failed.fieldErrors?.name).toEqual([failed.message]);
    expect(await mutations()).toBe(0);
  });

  it("still finds a unique id when two names reduce to the same slug", async () => {
    const first = expectOk(await createVessel(db, { name: "Sea-Fox", lengthFt: 30 }));
    const second = expectOk(await createVessel(db, { name: "Sea Fox", lengthFt: 31 }));
    expect(first.data.id).toBe("v_sea-fox");
    expect(second.data.id).toMatch(/^v_sea-fox-[0-9a-f]{6}$/);
  });

  it("rejects an empty name", async () => {
    expect(expectFail(await createVessel(db, { name: "  ", lengthFt: 30 })).fieldErrors?.name).toBeDefined();
    expect(expectFail(await createVessel(db, { name: "---", lengthFt: 30 })).code).toBe("VALIDATION");
  });
});

describe("updateVessel", () => {
  it("refuses a length that an upcoming stay would stop fitting, naming the stay", async () => {
    // Tidewater is 60 ft. North Pier Face is 75 ft, South Float East 90 ft, North Pier West 410 ft.
    const onFace = await stay(db, "north-pier-face", "v_tidewater", "2026-10-05", "2026-10-09");
    await stay(db, "north-pier-west", "v_tidewater", "2026-09-21", "2026-09-25");

    const failed = expectFail(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 80 }, AT));
    expect(failed.code).toBe("TOO_LONG");
    expect(failed.message).toBe(
      "R/V Tidewater cannot be recorded as 80 ft. It is booked on North Pier Face (75 ft) Oct 5 to Oct 9, 2026, where it would be 5 ft too long. Move or cancel that stay first.",
    );
    expect(failed.conflicts).toEqual([{ id: onFace, label: "R/V Tidewater", berthName: "North Pier Face", startDate: "2026-10-05", endDate: "2026-10-09" }]);
    expect(failed.fit).toEqual({ vesselFt: 80, berthFt: 75, overByFt: 5 });
    expect(failed.fieldErrors?.lengthFt).toEqual([failed.message]);
    expect(await vesselById("v_tidewater")).toMatchObject({ lengthFt: 60, version: 1 });

    // Up to the shortest berth it is booked on is fine.
    expectOk(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 75 }, AT));
  });

  it("names every stay in the way, in date order, and leads with the worst", async () => {
    const onFloat = await stay(db, "south-float-east", "v_tidewater", "2026-09-21", "2026-09-25");
    const onFace = await stay(db, "north-pier-face", "v_tidewater", "2026-10-05", "2026-10-09");
    const failed = expectFail(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 100 }, AT));
    expect(failed.conflicts?.map((c) => [c.id, c.berthName])).toEqual([[onFloat, "South Float East"], [onFace, "North Pier Face"]]);
    expect(failed.fit).toEqual({ vesselFt: 100, berthFt: 75, overByFt: 25 });
    expect(failed.message).toContain("booked on North Pier Face (75 ft) Oct 5 to Oct 9, 2026, where it would be 25 ft too long, and 1 other stay would no longer fit either. Move or cancel them first.");
  });

  it("is held only by stays that have not ended: history and cancelled stays do not count", async () => {
    await stay(db, "north-pier-face", "v_tidewater", "2026-09-08", "2026-09-12", "2026-09-01"); // ended by TODAY
    const cancelled = await stay(db, "north-pier-face", "v_tidewater", "2026-10-05", "2026-10-09");
    expectOk(await cancelReservation(db, { id: cancelled, version: 1 }, AT));

    const updated = expectOk(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 80 }, AT));
    expect(updated.data).toEqual({ id: "v_tidewater", version: 2 });
    expect(await vesselById("v_tidewater")).toMatchObject({ lengthFt: 80, version: 2 });
  });

  it("counts a stay that ends today as not ended", async () => {
    await stay(db, "north-pier-face", "v_tidewater", "2026-09-15", "2026-09-19", "2026-09-10");
    expect(expectFail(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 80 }, AT)).code).toBe("TOO_LONG");
    expectOk(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 80 }, { today: "2026-09-20" }));
  });

  it("ignores events and closures on a short berth", async () => {
    await book(db, { kind: "closure", berthId: "inner-channel", title: "Dredging", startDate: "2026-09-21", endDate: "2026-09-25" });
    expectOk(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 300 }, AT));
  });

  it("always allows a shorter length", async () => {
    await stay(db, "south-float-east", "v_amber-reef", "2026-09-21", "2026-09-25");
    expectOk(await updateVessel(db, { vesselId: "v_amber-reef", version: 1, lengthFt: 60 }, AT));
    expect((await vesselById("v_amber-reef")).lengthFt).toBe(60);
  });

  it("renames without changing the id, keeps what was not sent, and clears a prefix on request", async () => {
    expectOk(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 60, name: "tidewater north" }, AT));
    expect(await vesselById("v_tidewater")).toMatchObject({ id: "v_tidewater", name: "Tidewater North", nameKey: "TIDEWATER NORTH", prefix: "R/V", version: 2 });

    expectOk(await updateVessel(db, { vesselId: "v_tidewater", version: 2, lengthFt: 60, name: "M/V Tidewater North" }, AT));
    expect(await vesselById("v_tidewater")).toMatchObject({ name: "Tidewater North", prefix: "M/V" });

    expectOk(await updateVessel(db, { vesselId: "v_tidewater", version: 3, lengthFt: 61, prefix: null }, AT));
    expect(await vesselById("v_tidewater")).toMatchObject({ name: "Tidewater North", prefix: null, lengthFt: 61, version: 4 });
    expect(await mutations()).toBe(3);
  });

  it("refuses a rename onto another vessel's name", async () => {
    const failed = expectFail(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 60, name: "S/V far horizon" }, AT));
    expect(failed.code).toBe("VALIDATION");
    expect(failed.message).toBe("A vessel named Far Horizon is already registered (M/Y Far Horizon, 170 ft).");
    expect(failed.fieldErrors?.name).toBeDefined();
    // Re-spelling its own name is not a clash.
    expectOk(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt: 60, name: "TIDEWATER" }, AT));
  });

  it("checks the version, the id and the value", async () => {
    expect(expectFail(await updateVessel(db, { vesselId: "v_tidewater", version: 5, lengthFt: 61 }, AT)).code).toBe("STALE");
    expect(expectFail(await updateVessel(db, { vesselId: "v_ghost", version: 1, lengthFt: 61 }, AT)).code).toBe("NOT_FOUND");
    for (const lengthFt of [0, -4, 61.5, 1501]) {
      const failed = expectFail(await updateVessel(db, { vesselId: "v_tidewater", version: 1, lengthFt }, AT));
      expect(failed.code).toBe("VALIDATION");
      expect(failed.fieldErrors?.lengthFt).toBeDefined();
    }
    expect(await vesselById("v_tidewater")).toMatchObject({ lengthFt: 60, version: 1 });
  });
});

describe("resolveVesselIdentity", () => {
  it("lets an explicit prefix win and canonicalises known spellings", () => {
    expect(resolveVesselIdentity({ name: "R/V Tidewater", prefix: "os/v" })).toEqual({ name: "Tidewater", nameKey: "TIDEWATER", prefix: "OSV" });
    expect(resolveVesselIdentity({ name: "tug harbor mule" })).toEqual({ name: "Harbor Mule", nameKey: "HARBOR MULE", prefix: "Tug" });
    expect(resolveVesselIdentity({ name: "Tidewater", prefix: "USCGC" })).toMatchObject({ prefix: "USCGC" });
    expect(resolveVesselIdentity({ name: "McKinley's Pride" }).name).toBe("McKinley's Pride");
  });
});
