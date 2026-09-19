import { count, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { appMeta, berths, reservations, vessels } from "../../db/schema";
import type { Db } from "../../db/types";
import { cloneFixtureSeed, fixtureSeed } from "../../seed/fixture";
import { createBerth, retireBerth } from "../berths";
import { resetFromSeed } from "../reset";
import { createVessel } from "../vessels";
import { AT, book, createTestDb, expectFail, expectOk } from "./helpers";

let db: Db;

beforeAll(async () => {
  ({ db } = await createTestDb());
}, 60_000);

afterEach(() => vi.restoreAllMocks());

async function counts() {
  const [[b], [v], [r]] = await Promise.all([
    db.select({ n: count() }).from(berths),
    db.select({ n: count() }).from(vessels),
    db.select({ n: count() }).from(reservations),
  ]);
  return { berths: b.n, vessels: v.n, reservations: r.n };
}

const pristine = { berths: fixtureSeed.berths.length, vessels: fixtureSeed.vessels.length, reservations: 0 };
const sailDay = { kind: "event", berthId: "north-pier-west", startDate: "2026-09-21", endDate: "2026-09-22", title: "Sail day" } as const;

describe("resetFromSeed", () => {
  it("loads the seed into an empty database: berths, vessels and an empty schedule", async () => {
    const { data } = expectOk(await resetFromSeed(db, fixtureSeed, { cooldownSeconds: 0 }));
    expect(data).toEqual({ berths: 6, vessels: 8 });
    expect(await counts()).toEqual(pristine);

    const [meta] = await db.select().from(appMeta);
    expect(meta.lastResetAt).toBeInstanceOf(Date);
    expect(meta.mutationsSinceReset).toBe(0);
    const [berth] = await db.select().from(berths).where(eq(berths.id, "inner-channel"));
    expect(berth).toMatchObject({ name: "Inner Channel", lengthFt: 55, sortOrder: 4, version: 1, retiredAt: null });
  });

  it("is idempotent, discards everything done in the app and zeroes the mutation counter", async () => {
    await book(db, sailDay);
    expectOk(await createVessel(db, { name: "R/V Kittiwake", lengthFt: 52 }));
    expectOk(await createBerth(db, { name: "Fuel Dock", lengthFt: 120 }));
    expectOk(await retireBerth(db, { berthId: "inner-channel", version: 1 }, AT));
    expect((await db.select().from(appMeta))[0].mutationsSinceReset).toBe(4);
    expect(await counts()).toEqual({ berths: 7, vessels: 9, reservations: 1 });

    expectOk(await resetFromSeed(db, fixtureSeed, { cooldownSeconds: 0 }));
    expect(await counts()).toEqual(pristine);
    expect((await db.select().from(berths).where(eq(berths.id, "inner-channel")))[0]).toMatchObject({ retiredAt: null, version: 1 });
    expect((await db.select().from(appMeta))[0].mutationsSinceReset).toBe(0);
  });

  it("refuses a second reset inside the cooldown and says how long to wait", async () => {
    expectOk(await resetFromSeed(db, fixtureSeed, { cooldownSeconds: 0 }));
    await book(db, sailDay);
    const blocked = expectFail(await resetFromSeed(db, fixtureSeed));
    expect(blocked.code).toBe("COOLDOWN");
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(30);
    expect(blocked.message).toMatch(/wait \d+ seconds? before resetting again/);
    expect(await counts()).toEqual({ ...pristine, reservations: 1 });
  });

  it("does not mistake a never-reset app_meta row for a recent reset", async () => {
    await db.update(appMeta).set({ lastResetAt: null });
    expectOk(await resetFromSeed(db, fixtureSeed));
  });

  it("rolls back completely when the database rejects a row, leaving the previous data intact", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expectOk(await resetFromSeed(db, fixtureSeed, { cooldownSeconds: 0 }));
    const booked = await book(db, sailDay);
    const [before] = await db.select().from(appMeta);

    // A NUL byte passes the seed validator but not Postgres, and it sits in the LAST vessel, so the
    // failure lands after the truncate and after every berth has been inserted.
    const broken = cloneFixtureSeed();
    broken.vessels.push({ id: "v_bad-name", name: "Bad\u0000Name", nameKey: "BAD\u0000NAME", prefix: null, lengthFt: 30 });
    const failed = expectFail(await resetFromSeed(db, broken, { cooldownSeconds: 0 }));
    expect(failed.code).toBe("VALIDATION"); // SQLSTATE 22021

    expect(await counts()).toEqual({ ...pristine, reservations: 1 });
    expect(await db.select().from(reservations).where(eq(reservations.id, booked))).toHaveLength(1);
    const [after] = await db.select().from(appMeta);
    expect(after).toEqual(before);
    expect(after.mutationsSinceReset).toBe(1);
  });

  it("rejects an invalid seed before touching the database", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expectOk(await resetFromSeed(db, fixtureSeed, { cooldownSeconds: 0 }));
    await book(db, sailDay);
    const broken = cloneFixtureSeed();
    broken.vessels[0].lengthFt = 0;
    const failed = expectFail(await resetFromSeed(db, broken, { cooldownSeconds: 0 }));
    expect(failed.code).toBe("INTERNAL");
    expect(failed.message).toBe("The demo data files did not pass their checks, so nothing was changed.");
    expect(await counts()).toEqual({ ...pristine, reservations: 1 });
  });
});
