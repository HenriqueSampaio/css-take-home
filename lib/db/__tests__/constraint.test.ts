/**
 * Proves the exclusion constraint on a real Postgres engine (PGlite = Postgres compiled
 * to WASM, with the btree_gist contrib extension), using the same migration files that
 * run against Neon.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite({ extensions: { btree_gist } });
  await migrate(drizzle(pg, { schema }), { migrationsFolder: "./drizzle" });
  await pg.exec(`
    INSERT INTO berths (id, name, length_ft, sort_order) VALUES ('sfe', 'South Float East', 90, 1), ('npw', 'North Pier West', 410, 2);
    INSERT INTO vessels (id, name, name_key, prefix, length_ft, length_status) VALUES ('v_a', 'Alpha', 'ALPHA', 'R/V', 60, 'verified'), ('v_b', 'Bravo', 'BRAVO', 'M/V', NULL, 'unknown');
  `);
}, 60_000);

const book = (id: string, berth: string, start: string, end: string, status = "confirmed") =>
  pg.query(`INSERT INTO reservations (id, berth_id, kind, vessel_id, start_date, end_date, status) VALUES ($1, $2, 'vessel', 'v_a', $3, $4, $5::reservation_status)`, [id, berth, start, end, status]);

const codeOf = async (p: Promise<unknown>): Promise<string | null> => p.then(() => null, (e: { code?: string }) => e.code ?? "no-code");

describe("reservations_no_double_booking", () => {
  it("accepts a first confirmed stay", async () => {
    expect(await codeOf(book("r1", "sfe", "2019-07-01", "2019-07-05"))).toBeNull();
  });

  it("rejects an overlapping confirmed stay on the same berth with 23P01", async () => {
    expect(await codeOf(book("r2", "sfe", "2019-07-03", "2019-07-08"))).toBe("23P01");
  });

  it("rejects a stay that merely touches: both ends are inclusive", async () => {
    expect(await codeOf(book("r3", "sfe", "2019-07-05", "2019-07-09"))).toBe("23P01");
    expect(await codeOf(book("r4", "sfe", "2019-07-06", "2019-07-09"))).toBeNull();
  });

  it("allows the same dates on a different berth", async () => {
    expect(await codeOf(book("r5", "npw", "2019-07-01", "2019-07-05"))).toBeNull();
  });

  it("lets unresolved legacy rows overlap, but not be confirmed while they collide", async () => {
    expect(await codeOf(book("legacy1", "sfe", "2019-07-02", "2019-07-04", "needs_review"))).toBeNull();
    expect(await codeOf(pg.query(`UPDATE reservations SET status = 'confirmed' WHERE id = 'legacy1'`))).toBe("23P01");
  });

  it("frees the slot when a stay is cancelled", async () => {
    await pg.query(`UPDATE reservations SET status = 'cancelled' WHERE id = 'r1'`);
    expect(await codeOf(pg.query(`UPDATE reservations SET status = 'confirmed' WHERE id = 'legacy1'`))).toBeNull();
  });

  it("enforces the supporting CHECKs", async () => {
    expect(await codeOf(book("bad-dates", "npw", "2019-08-10", "2019-08-01"))).toBe("23514");
    expect(await codeOf(pg.query(`INSERT INTO reservations (id, berth_id, kind, start_date, end_date) VALUES ('no-subject', 'npw', 'event', '2019-09-01', '2019-09-02')`))).toBe("23514");
    expect(await codeOf(pg.query(`UPDATE vessels SET length_ft = 80 WHERE id = 'v_b'`))).toBe("23514"); // a length needs a status that vouches for it
  });

  it("returns dates as plain strings", async () => {
    const rows = await drizzle(pg, { schema }).select({ start: schema.reservations.startDate }).from(schema.reservations).limit(1);
    expect(rows[0].start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
