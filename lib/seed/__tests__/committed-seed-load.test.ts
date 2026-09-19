/**
 * The committed seed must actually LOAD: validateSeed() mirrors the database
 * rules in TypeScript, and this proves the mirror is faithful by pushing the real
 * files through resetFromSeed() into a real Postgres (PGlite) with the production
 * migrations. It then books against them, since that is what the data is for.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getBerthStatuses, getDockToday, getFirstMonth, getHealth, getMonthReservations, getVesselOptions, getVessels } from "../../db/queries";
import type { Db } from "../../db/types";
import { AT, book, createTestDb, expectFail, expectOk, TODAY } from "../../services/__tests__/helpers";
import { createReservation } from "../../services/reservations";
import { resetFromSeed } from "../../services/reset";
import { loadSeed } from "../load";

const seed = loadSeed();
let db: Db;

describe("committed seed in a real database", () => {
  beforeAll(async () => {
    ({ db } = await createTestDb());
    expectOk(await resetFromSeed(db, seed, { cooldownSeconds: 0 }));
  }, 120_000);

  it("loads every row and starts with an empty schedule", async () => {
    const health = await getHealth(db);
    expect(health.counts).toEqual({ berths: seed.berths.length, vessels: seed.vessels.length, reservations: 0 });
    expect(health.constraint).toBe(true);
    expect(await getFirstMonth(db, TODAY)).toBe("2026-09");
    expect(await getDockToday(db, TODAY)).toMatchObject({ berthsTotal: 6, berthsOccupied: 0, nextArrival: null });
  });

  it("can be booked against, and resets back to empty", async () => {
    const options = await getVesselOptions(db);
    expect(options).toHaveLength(seed.vessels.length);
    const longest = options.reduce((a, b) => (b.lengthFt > a.lengthFt ? b : a));
    const shortest = options.reduce((a, b) => (b.lengthFt < a.lengthFt ? b : a));

    // Every vessel in the registry fits somewhere, and the longest does not fit the shortest berth.
    expect(longest.lengthFt).toBeLessThanOrEqual(Math.max(...seed.berths.map((b) => b.lengthFt)));
    const refused = expectFail(await createReservation(db, { kind: "vessel", berthId: "inner-channel", vesselId: longest.id, startDate: TODAY, endDate: "2026-09-22" }, AT));
    expect(refused.code).toBe("TOO_LONG");

    const id = await book(db, { kind: "vessel", berthId: "inner-channel", vesselId: shortest.id, startDate: TODAY, endDate: "2026-09-22" });
    expect((await getMonthReservations(db, "2026-09")).map((r) => r.id)).toEqual([id]);
    expect((await getBerthStatuses(db, TODAY)).find((b) => b.id === "inner-channel")?.current?.id).toBe(id);
    expect((await getVessels(db, TODAY)).find((v) => v.id === shortest.id)).toMatchObject({ upcomingCount: 1, totalCount: 1 });

    expectOk(await resetFromSeed(db, seed, { cooldownSeconds: 0 }));
    expect((await getHealth(db)).counts.reservations).toBe(0);
  });
});
