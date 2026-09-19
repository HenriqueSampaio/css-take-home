/**
 * State of the shared demo (what is loaded, when it was last reset, how much it
 * has been changed since) and the deployment health probe.
 */
import { count, eq, sql } from "drizzle-orm";
import type { ISODate } from "../../domain/dates";
import { appMeta, berths, issues, reservations, vessels } from "../schema";
import type { Db } from "../types";
import { isoTimestamp, rowsOf } from "./shared";

export type AppMetaInfo = {
  /** null until the first seed. */
  seedVersion: string | null;
  /** ISO timestamp; null until the first seed. */
  lastResetAt: string | null;
  mutationsSinceReset: number;
};

export type LiveStats = {
  berths: number;
  vessels: number;
  reservations: { total: number; confirmed: number; needsReview: number; cancelled: number };
  openIssues: number;
  /** Earliest start and latest end among non-cancelled reservations; null when there are none. */
  firstReservationDate: ISODate | null;
  lastReservationDate: ISODate | null;
};

export type Health = {
  counts: { berths: number; vessels: number; reservations: number; issues: number };
  /** The extension the exclusion constraint depends on is installed. */
  btreeGist: boolean;
  /** `reservations_no_double_booking` exists, i.e. the hand-written migration ran. */
  constraint: boolean;
  seedVersion: string | null;
  lastResetAt: string | null;
};

/** The singleton row may not exist yet (fresh database, never seeded); callers get defaults instead of null. */
export async function getAppMeta(db: Db): Promise<AppMetaInfo> {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.id, true)).limit(1);
  return {
    seedVersion: row?.seedVersion ?? null,
    lastResetAt: isoTimestamp(row?.lastResetAt),
    mutationsSinceReset: row?.mutationsSinceReset ?? 0,
  };
}

export async function getLiveStats(db: Db): Promise<LiveStats> {
  const [[berthCount], [vesselCount], [issueCount], [r]] = await Promise.all([
    db.select({ n: count() }).from(berths),
    db.select({ n: count() }).from(vessels),
    db.select({ n: count() }).from(issues).where(sql`${issues.resolvedAt} is null`),
    db
      .select({
        total: count(),
        confirmed: sql<number>`count(*) filter (where ${reservations.status} = 'confirmed')`.mapWith(Number),
        needsReview: sql<number>`count(*) filter (where ${reservations.status} = 'needs_review')`.mapWith(Number),
        cancelled: sql<number>`count(*) filter (where ${reservations.status} = 'cancelled')`.mapWith(Number),
        // Cast to text in SQL: an aggregate has no column type for Drizzle to apply its string date mode to.
        first: sql<ISODate | null>`(min(${reservations.startDate}) filter (where ${reservations.status} <> 'cancelled'))::text`,
        last: sql<ISODate | null>`(max(${reservations.endDate}) filter (where ${reservations.status} <> 'cancelled'))::text`,
      })
      .from(reservations),
  ]);

  return {
    berths: berthCount?.n ?? 0,
    vessels: vesselCount?.n ?? 0,
    reservations: { total: r?.total ?? 0, confirmed: r?.confirmed ?? 0, needsReview: r?.needsReview ?? 0, cancelled: r?.cancelled ?? 0 },
    openIssues: issueCount?.n ?? 0,
    firstReservationDate: r?.first ?? null,
    lastReservationDate: r?.last ?? null,
  };
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
      (select count(*) from issues)::int as issues,
      exists(select 1 from pg_extension where extname = 'btree_gist') as btree_gist,
      exists(select 1 from pg_constraint where conname = 'reservations_no_double_booking') as double_booking_constraint
  `);
  const [row] = rowsOf<{ berths: number; vessels: number; reservations: number; issues: number; btree_gist: boolean; double_booking_constraint: boolean }>(result);
  const meta = await getAppMeta(db);
  return {
    counts: { berths: Number(row?.berths ?? 0), vessels: Number(row?.vessels ?? 0), reservations: Number(row?.reservations ?? 0), issues: Number(row?.issues ?? 0) },
    btreeGist: row?.btree_gist === true,
    constraint: row?.double_booking_constraint === true,
    seedVersion: meta.seedVersion,
    lastResetAt: meta.lastResetAt,
  };
}
