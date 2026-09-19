import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appMeta, issues, vessels } from "../../db/schema";
import type { Db } from "../../db/types";
import { createVessel, resolveVesselIdentity, setVesselLength } from "../vessels";
import { createTestDb, expectFail, expectOk, seedFixture } from "./helpers";

let db: Db;

beforeAll(async () => {
  ({ db } = await createTestDb());
}, 60_000);

beforeEach(() => seedFixture(db));

const vesselById = async (id: string) => (await db.select().from(vessels).where(eq(vessels.id, id)))[0];

describe("setVesselLength", () => {
  it("reports misfits before and after, and never blocks on them", async () => {
    // Far Horizon (170 ft, probable) is twice on South Float East (90 ft) and once on North Pier West (410 ft).
    const shorter = expectOk(await setVesselLength(db, { vesselId: "v_far-horizon", version: 1, lengthFt: 88 }));
    expect(shorter.data).toEqual({ misfitsBefore: 2, misfitsAfter: 0 });
    expect(shorter.warning).toBeUndefined();
    expect(await vesselById("v_far-horizon")).toMatchObject({ lengthFt: 88, lengthStatus: "verified", version: 2 });

    const longer = expectOk(await setVesselLength(db, { vesselId: "v_far-horizon", version: 2, lengthFt: 420 }));
    expect(longer.data).toEqual({ misfitsBefore: 0, misfitsAfter: 3 });
    expect(longer.warning).toContain("too long for the berth in 3 of its bookings");
    expect((await db.select().from(appMeta))[0].mutationsSinceReset).toBe(2);
  });

  it("counts from zero for a vessel that had no length, and leaves cancelled stays out", async () => {
    // Long Ketch: Inner Channel (55 ft) twice, South Float West and East (90 ft) once each.
    const result = expectOk(await setVesselLength(db, { vesselId: "v_long-ketch", version: 1, lengthFt: 60 }));
    expect(result.data).toEqual({ misfitsBefore: 0, misfitsAfter: 2 });
  });

  it("resolves the vessel's open length_conflict issue and keeps a trace of the old value", async () => {
    expectOk(await setVesselLength(db, { vesselId: "v_iron-petrel", version: 1, lengthFt: 135 }));
    const vessel = await vesselById("v_iron-petrel");
    expect(vessel).toMatchObject({ lengthFt: 135, lengthStatus: "verified", lengthCandidates: [120, 135] });
    expect(vessel.lengthEvidence).toContain("was: no length, conflict");
    const [finding] = await db.select().from(issues).where(eq(issues.id, "i_fx_length_ironpetrel"));
    expect(finding.resolution).toBe("edited");
    expect(finding.resolvedAt).toBeInstanceOf(Date);
  });

  it("checks the version, the id and the value", async () => {
    expect(expectFail(await setVesselLength(db, { vesselId: "v_tidewater", version: 5, lengthFt: 61 })).code).toBe("STALE");
    expect(expectFail(await setVesselLength(db, { vesselId: "v_ghost", version: 1, lengthFt: 61 })).code).toBe("NOT_FOUND");
    for (const lengthFt of [0, -4, 61.5, 1501]) {
      const failed = expectFail(await setVesselLength(db, { vesselId: "v_tidewater", version: 1, lengthFt }));
      expect(failed.code).toBe("VALIDATION");
      expect(failed.fieldErrors?.lengthFt).toBeDefined();
    }
    expect((await vesselById("v_tidewater")).lengthFt).toBe(60);
  });
});

describe("createVessel", () => {
  it("creates a verified vessel when a length is given and an unknown one otherwise", async () => {
    const withLength = expectOk(await createVessel(db, { name: "OS/V NORTHERN LIGHT", lengthFt: 140 }));
    expect(withLength.data.id).toBe("v_northern-light");
    expect(await vesselById("v_northern-light")).toMatchObject({ name: "Northern Light", nameKey: "NORTHERN LIGHT", prefix: "OSV", lengthFt: 140, lengthStatus: "verified", origin: "app" });

    const without = expectOk(await createVessel(db, { name: "Petrel II", prefix: "S/V" }));
    expect(await vesselById(without.data.id)).toMatchObject({ name: "Petrel II", prefix: "S/V", lengthFt: null, lengthStatus: "unknown" });
  });

  it("refuses a second vessel with the same name, whatever the prefix or casing", async () => {
    const failed = expectFail(await createVessel(db, { name: "m/y golden compass", lengthFt: 70 }));
    expect(failed.code).toBe("VALIDATION");
    expect(failed.message).toBe("A vessel named R/V Golden Compass already exists.");
    expect(failed.fieldErrors?.name).toEqual([failed.message]);
  });

  it("still finds a unique id when two names reduce to the same slug", async () => {
    const first = expectOk(await createVessel(db, { name: "Sea-Fox" }));
    const second = expectOk(await createVessel(db, { name: "Sea Fox" }));
    expect(first.data.id).toBe("v_sea-fox");
    expect(second.data.id).toMatch(/^v_sea-fox-[0-9a-f]{6}$/);
  });

  it("rejects an empty name", async () => {
    expect(expectFail(await createVessel(db, { name: "  " })).fieldErrors?.name).toBeDefined();
    expect(expectFail(await createVessel(db, { name: "---" })).code).toBe("VALIDATION");
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
