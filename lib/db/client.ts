/**
 * The production database handle: node-postgres over TCP to Neon's pooled
 * endpoint. Not the Neon HTTP driver, because bookings, edits and demo resets
 * need real multi-statement transactions.
 *
 * Server-only. Scripts and tests build their own handle and pass it to services.
 */
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";
import * as schema from "./schema";
import type { Db } from "./types";

// Postgres `date` (OID 1082) stays a 'YYYY-MM-DD' string everywhere, including raw
// `db.execute()` results. pg's default would build a JS Date at local midnight.
types.setTypeParser(1082, (value) => value);

const globalForDb = globalThis as unknown as { __dockPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. Run `npx vercel env pull .env.local`.");
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 15_000 });
  // Neon suspends idle computes and drops their connections; without a handler that is an uncaught exception.
  pool.on("error", () => {});
  // Lets Vercel's Fluid compute close idle clients before a function instance is frozen.
  attachDatabasePool(pool);
  return pool;
}

/** Lazy so that `next build` never needs a database, and cached so dev hot-reload doesn't leak pools. */
export function getDb(): Db {
  const pool = (globalForDb.__dockPool ??= createPool());
  return drizzle(pool, { schema }) as unknown as Db;
}
