/**
 * Test database: PGlite (real Postgres compiled to WASM, with btree_gist) plus
 * the same migration files that run against Neon, so the exclusion constraint,
 * the CHECKs and SELECT ... FOR UPDATE under test are the production ones.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../db/schema";
import type { Db } from "../../db/types";
import { fixtureSeed } from "../../seed/fixture";
import { resetFromSeed } from "../reset";
import type { ServiceFailure, ServiceResult, ServiceSuccess } from "../result";

export type TestDb = { db: Db; pg: PGlite };

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite({ extensions: { btree_gist } });
  const handle = drizzle(pg, { schema });
  await migrate(handle, { migrationsFolder: "./drizzle" });
  return { db: handle as unknown as Db, pg };
}

/** Back to the pristine fixture. Goes through the real reset service, cooldown off. */
export async function seedFixture(db: Db): Promise<void> {
  const result = await resetFromSeed(db, fixtureSeed, { cooldownSeconds: 0 });
  if (!result.ok) throw new Error(`Fixture seed failed: ${result.code} ${result.message}`);
}

/** Narrowing helpers so a wrong result fails with the service's own message instead of an undefined property. */
export function expectOk<T>(result: ServiceResult<T>): ServiceSuccess<T> {
  if (!result.ok) throw new Error(`Expected success, got ${result.code}: ${result.message}`);
  return result;
}

export function expectFail<T>(result: ServiceResult<T>): ServiceFailure {
  if (result.ok) throw new Error(`Expected a failure, got success: ${JSON.stringify(result.data)}`);
  return result;
}
