/**
 * State of the shared demo (when it was last reset, how much it has been
 * changed since) and the deployment health probe.
 */
import { eq, sql } from "drizzle-orm";
import { appMeta } from "../schema";
import type { Db } from "../types";
import { isoTimestamp, rowsOf } from "./shared";

export type AppMetaInfo = {
  /** ISO timestamp; null until the first seed. */
  lastResetAt: string | null;
  mutationsSinceReset: number;
};

export type Health = {
  counts: { berths: number; vessels: number; reservations: number };
  /** The extension the exclusion constraint depends on is installed. */
  btreeGist: boolean;
  /** `reservations_no_double_booking` exists, i.e. the hand-written migration ran. */
  constraint: boolean;
  lastResetAt: string | null;
};

/** The singleton row may not exist yet (fresh database, never seeded); callers get defaults instead of null. */
export async function getAppMeta(db: Db): Promise<AppMetaInfo> {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.id, true)).limit(1);
  return { lastResetAt: isoTimestamp(row?.lastResetAt), mutationsSinceReset: row?.mutationsSinceReset ?? 0 };
}

/**
 * One round trip that proves the things a deploy can get wrong: the database
 * answers, the tables exist, btree_gist is installed and the double-booking
 * constraint is really there. Throws when the database does not answer.
 */
export async function getHealth(db: Db): Promise<Health> {
  const result = await db.execute(sql`
    select
      (select count(*) from berths)::int as berths,
      (select count(*) from vessels)::int as vessels,
      (select count(*) from reservations)::int as reservations,
      exists(select 1 from pg_extension where extname = 'btree_gist') as btree_gist,
      exists(select 1 from pg_constraint where conname = 'reservations_no_double_booking') as double_booking_constraint
  `);
  const [row] = rowsOf<{ berths: number; vessels: number; reservations: number; btree_gist: boolean; double_booking_constraint: boolean }>(result);
  const meta = await getAppMeta(db);
  return {
    counts: { berths: Number(row?.berths ?? 0), vessels: Number(row?.vessels ?? 0), reservations: Number(row?.reservations ?? 0) },
    btreeGist: row?.btree_gist === true,
    constraint: row?.double_booking_constraint === true,
    lastResetAt: meta.lastResetAt,
  };
}
