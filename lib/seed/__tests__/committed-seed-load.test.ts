/**
 * The committed seed must actually LOAD: validateSeed() mirrors the database
 * rules in TypeScript, and this proves the mirror is faithful by pushing the real
 * files through resetFromSeed() into a real Postgres (PGlite) with the production
 * migrations, exclusion constraint included. Skipped while the files are still
 * the empty placeholders.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getDefaultMonth, getFitViolations, getHealth, getIssueSummary, getLiveStats, getMonthReservations, getVessels } from "../../db/queries";
import type { Db } from "../../db/types";
import { createTestDb, expectOk } from "../../services/__tests__/helpers";
import { resetFromSeed } from "../../services/reset";
import { loadSeed } from "../load";

const seed = loadSeed();
let db: Db;

describe.skipIf(seed.reservations.length === 0)("committed seed in a real database", () => {
  beforeAll(async () => {
    ({ db } = await createTestDb());
    expectOk(await resetFromSeed(db, seed, { cooldownSeconds: 0 }));
  }, 120_000);

  it("loads every row", async () => {
    const health = await getHealth(db);
    expect(health.counts).toEqual({ berths: seed.berths.length, vessels: seed.vessels.length, reservations: seed.reservations.length, issues: seed.issues.length });
    expect(health.constraint).toBe(true);
  });

  it("agrees with the seed about what needs review, and resets idempotently", async () => {
    const stats = await getLiveStats(db);
    expect(stats.reservations.needsReview).toBe(seed.reservations.filter((r) => r.status === "needs_review").length);
    expect(stats.reservations.cancelled).toBe(0);
    expect((await getIssueSummary(db)).openTotal).toBe(seed.issues.length);

    expectOk(await resetFromSeed(db, seed, { cooldownSeconds: 0 }));
    expect((await getLiveStats(db)).reservations.total).toBe(seed.reservations.length);
  });

  it("answers the main screens' queries", async () => {
    const month = await getDefaultMonth(db, "2026-09-19");
    expect(month).toMatch(/^\d{4}-\d{2}$/);
    expect((await getMonthReservations(db, month)).length).toBeGreaterThan(0);
    expect((await getVessels(db)).length).toBe(seed.vessels.length);
    const misfits = await getFitViolations(db);
    expect(misfits.totalReservations).toBe((await getIssueSummary(db)).misfitReservations);
  });
});
