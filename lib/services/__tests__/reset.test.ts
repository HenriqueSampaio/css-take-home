import { count, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { appMeta, berths, issues, reservations, vessels } from "../../db/schema";
import type { Db } from "../../db/types";
import type { BerthId } from "../../seed/contract";
import { cloneFixtureSeed, fixtureSeed } from "../../seed/fixture";
import { createReservation } from "../reservations";
import { resetFromSeed, seedFingerprint } from "../reset";
import { createTestDb, expectFail, expectOk } from "./helpers";

let db: Db;

beforeAll(async () => {
  ({ db } = await createTestDb());
}, 60_000);

afterEach(() => vi.restoreAllMocks());

async function counts() {
  const [[b], [v], [r], [i]] = await Promise.all([
    db.select({ n: count() }).from(berths),
    db.select({ n: count() }).from(vessels),
    db.select({ n: count() }).from(reservations),
    db.select({ n: count() }).from(issues),
  ]);
  return { berths: b.n, vessels: v.n, reservations: r.n, issues: i.n };
}

const fixtureCounts = {
  berths: fixtureSeed.berths.length,
  vessels: fixtureSeed.vessels.length,
  reservations: fixtureSeed.reservations.length,
  issues: fixtureSeed.issues.length,
};

describe("resetFromSeed", () => {
  it("loads the fixture into an empty database and records the seed version", async () => {
    const { data } = expectOk(await resetFromSeed(db, fixtureSeed, { cooldownSeconds: 0 }));
    expect(data).toEqual({ ...fixtureCounts, seedVersion: seedFingerprint(fixtureSeed) });
    expect(await counts()).toEqual(fixtureCounts);

    const [meta] = await db.select().from(appMeta);
    expect(meta.seedVersion).toBe(seedFingerprint(fixtureSeed));
    expect(meta.lastResetAt).toBeInstanceOf(Date);
    expect(meta.mutationsSinceReset).toBe(0);

    const [legacy] = await db.select().from(reservations).where(eq(reservations.id, "r_fx_pair_a"));
    expect(legacy).toMatchObject({ source: "legacy", status: "needs_review", startDate: "2019-07-10", version: 1 });
  });

  it("is idempotent, discards app changes and zeroes the mutation counter", async () => {
    expectOk(await createReservation(db, { kind: "event", berthId: "north-pier-west", startDate: "2020-01-01", endDate: "2020-01-02", title: "Test" }));
    expect((await db.select().from(appMeta))[0].mutationsSinceReset).toBe(1);

    expectOk(await resetFromSeed(db, fixtureSeed, { cooldownSeconds: 0, seedVersion: "custom-version" }));
    expect(await counts()).toEqual(fixtureCounts);
    const [meta] = await db.select().from(appMeta);
    expect(meta).toMatchObject({ seedVersion: "custom-version", mutationsSinceReset: 0 });
  });

  it("refuses a second reset inside the cooldown and says how long to wait", async () => {
    expectOk(await resetFromSeed(db, fixtureSeed, { cooldownSeconds: 0 }));
    const blocked = expectFail(await resetFromSeed(db, fixtureSeed));
    expect(blocked.code).toBe("COOLDOWN");
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(30);
    expect(blocked.message).toMatch(/wait \d+ seconds? before resetting again/);
    expect(await counts()).toEqual(fixtureCounts);
  });

  it("does not mistake a never-reset app_meta row for a recent reset", async () => {
    await db.update(appMeta).set({ lastResetAt: null });
    expectOk(await resetFromSeed(db, fixtureSeed));
  });

  it("rolls back completely when a row is rejected, leaving the previous data intact", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expectOk(await resetFromSeed(db, fixtureSeed, { cooldownSeconds: 0, seedVersion: "before" }));
    const { data: booked } = expectOk(
      await createReservation(db, { kind: "event", berthId: "north-pier-west", startDate: "2020-01-01", endDate: "2020-01-02", title: "Survivor" }),
    );

    const broken = cloneFixtureSeed();
    // The LAST row points at a berth that does not exist, so the failure lands after the truncate and ~30 good inserts.
    broken.reservations[broken.reservations.length - 1].berthId = "no-such-berth" as BerthId;
    const failed = expectFail(await resetFromSeed(db, broken, { cooldownSeconds: 0, skipValidation: true }));
    expect(failed.code).toBe("NOT_FOUND"); // 23503 foreign key violation

    expect(await counts()).toEqual({ ...fixtureCounts, reservations: fixtureCounts.reservations + 1 });
    expect(await db.select().from(reservations).where(eq(reservations.id, booked.id))).toHaveLength(1);
    const [meta] = await db.select().from(appMeta);
    expect(meta).toMatchObject({ seedVersion: "before", mutationsSinceReset: 1 });
  });

  it("rejects an invalid seed before touching the database", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expectOk(await resetFromSeed(db, fixtureSeed, { cooldownSeconds: 0 }));
    const broken = cloneFixtureSeed();
    broken.reservations[0].berthId = "no-such-berth" as BerthId;
    const failed = expectFail(await resetFromSeed(db, broken, { cooldownSeconds: 0 }));
    expect(failed.code).toBe("INTERNAL");
    expect(await counts()).toEqual(fixtureCounts);
  });
});
