/**
 * `npm run db:seed`: loads data/seed/*.json (the berths and the vessel registry;
 * the schedule starts empty) into the database named by DATABASE_URL_UNPOOLED
 * (falling back to DATABASE_URL). `--fixture` loads the small hand-written
 * fixture instead: the same six berths and a handful of vessels.
 *
 * Goes through the same resetFromSeed() as the in-app "Reset demo data" button,
 * so the CLI and the app cannot drift apart. Builds its own connection instead
 * of importing lib/db/client.ts: that module is wired for Vercel functions
 * (pooled endpoint, Fluid compute hooks), and a bulk load belongs on the direct
 * endpoint, like the migrations.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";
import * as schema from "../lib/db/schema";
import type { Db } from "../lib/db/types";
import { fixtureSeed } from "../lib/seed/fixture";
import { loadSeed } from "../lib/seed/load";
import { validateSeed } from "../lib/seed/validate";
import { resetFromSeed } from "../lib/services/reset";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment (CI, or variables exported in the shell).
}

// Postgres `date` stays a 'YYYY-MM-DD' string, exactly as in lib/db/client.ts.
types.setTypeParser(1082, (value) => value);

async function main(): Promise<number> {
  const useFixture = process.argv.includes("--fixture");
  const seed = useFixture ? fixtureSeed : loadSeed();
  const source = useFixture ? "lib/seed/fixture.ts" : "data/seed/*.json";

  const problems = validateSeed(seed);
  if (problems.length > 0) {
    console.error(`Seed from ${source} failed validation (${problems.length} problem${problems.length === 1 ? "" : "s"}):`);
    for (const problem of problems.slice(0, 25)) console.error(`  ${problem}`);
    if (problems.length > 25) console.error("  ...");
    return 1;
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set. Run `npx vercel env pull .env.local`.");
    return 1;
  }

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 30_000 });
  try {
    const db = drizzle(pool, { schema }) as unknown as Db;
    const started = Date.now();
    const result = await resetFromSeed(db, seed, { cooldownSeconds: 0 });
    if (!result.ok) {
      console.error(`Seeding failed (${result.code}): ${result.message}`);
      return 1;
    }
    const { berths, vessels } = result.data;
    console.log(`Seeded from ${source} in ${Date.now() - started} ms. The schedule is empty.`);
    console.log(`  berths   ${berths}`);
    console.log(`  vessels  ${vessels}`);
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
