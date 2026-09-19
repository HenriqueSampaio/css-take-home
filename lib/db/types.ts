import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

type Schema = typeof schema;

/**
 * Driver-agnostic database handle. Production uses node-postgres against Neon;
 * tests use PGlite (real Postgres compiled to WASM, including `btree_gist`), so
 * services are written against this common supertype and take it as a parameter.
 */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type DbOrTx = Db | Tx;
