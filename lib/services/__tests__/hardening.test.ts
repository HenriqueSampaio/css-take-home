/**
 * Closes three low-severity findings from the independent review of this layer:
 * a simultaneous race can surface as a deadlock rather than 23P01, a NUL byte must be a
 * validation error rather than a server fault, and lostRace() must treat a deadlock as lost.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { resultFromError } from "../errors";
import { lostRace } from "../internal";
import { createBerth } from "../berths";
import { createReservation } from "../reservations";
import { createVessel } from "../vessels";
import type { Tx } from "@/lib/db/types";
import { AT, createTestDb, expectFail, seedFixture, type TestDb } from "./helpers";

const wrapped = (code: string) => Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("driver"), { code }) });

describe("race outcomes other than 23P01", () => {
  it("maps a deadlock and a serialization failure to the same CONFLICT a coordinator would see", () => {
    for (const code of ["40P01", "40001"]) {
      const result = resultFromError(wrapped(code), "test");
      expect(result.code).toBe("CONFLICT");
      expect(result.message).toMatch(/just booked/);
    }
  });

  it("lostRace() reports a deadlock or a serialization failure as a lost race instead of rethrowing", async () => {
    for (const code of ["23P01", "40P01", "40001"]) {
      const tx = { transaction: async () => { throw wrapped(code); } } as unknown as Tx;
      await expect(lostRace(tx, async () => {})).resolves.toBe(true);
    }
    const other = { transaction: async () => { throw wrapped("23503"); } } as unknown as Tx;
    await expect(lostRace(other, async () => {})).rejects.toThrow();
  });
});

describe("NUL bytes", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await seedFixture(t.db);
  }, 60_000);

  it("are refused as VALIDATION with a sentence, never INTERNAL", async () => {
    const base = { kind: "event" as const, berthId: "inner-channel", startDate: "2026-10-01", endDate: "2026-10-02" };
    const inNotes = expectFail(await createReservation(t.db, { ...base, title: "Open house", notes: "a\u0000b" }, AT));
    expect(inNotes.code).toBe("VALIDATION");
    const inTitle = expectFail(await createReservation(t.db, { ...base, title: "Open\u0000house" }, AT));
    expect(inTitle.code).toBe("VALIDATION");
    const inId = expectFail(await createReservation(t.db, { ...base, kind: "vessel", vesselId: "v_\u0000" }, AT));
    expect(inId.code).toBe("VALIDATION");
    const inVessel = expectFail(await createVessel(t.db, { name: "Sea\u0000Fox", lengthFt: 30 }));
    expect(inVessel.fieldErrors?.name).toBeDefined();
    const inBerth = expectFail(await createBerth(t.db, { name: "Fuel\u0000Dock", lengthFt: 30 }));
    expect(inBerth.fieldErrors?.name).toBeDefined();
  });

  it("maps a Postgres data exception to VALIDATION as the backstop", () => {
    expect(resultFromError(wrapped("22021"), "test").code).toBe("VALIDATION");
  });
});
