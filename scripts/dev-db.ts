/**
 * Zero-setup local database:  npm run db:local
 *
 * Starts PGlite (real Postgres compiled to WASM, with btree_gist) in memory, applies the
 * same migrations that run against Neon, loads data/seed (`--fixture` loads the small test
 * fixture instead), and serves it over the Postgres wire protocol. The app then connects with its normal `pg` driver:
 *
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres npm run dev
 *
 * Nothing is persisted; restarting the script brings back the seeded berths and vessels and an empty schedule.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../lib/db/schema";
import type { Db } from "../lib/db/types";
import { fixtureSeed } from "../lib/seed/fixture";
import { loadSeed } from "../lib/seed/load";
import { resetFromSeed } from "../lib/services/reset";

const PORT = Number(process.env.DEV_DB_PORT ?? 5433);

async function main() {
  const pg = new PGlite({ extensions: { btree_gist } });
  const db = drizzle(pg, { schema }) as unknown as Db;
  await migrate(drizzle(pg, { schema }), { migrationsFolder: "./drizzle" });

  const useFixture = process.argv.includes("--fixture");
  const seed = useFixture ? fixtureSeed : loadSeed();
  const result = await resetFromSeed(db, seed, { cooldownSeconds: 0 });
  if (!result.ok) throw new Error(`Seeding failed: ${result.message}`);
  console.log(`seeded ${result.data.berths} berths and ${result.data.vessels} vessels from ${useFixture ? "the fixture" : "data/seed"}; the schedule is empty`);

  const server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  console.log(`local Postgres (PGlite) listening on postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);

  const stop = async () => { await server.stop(); await pg.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => { console.error(error); process.exit(1); });
