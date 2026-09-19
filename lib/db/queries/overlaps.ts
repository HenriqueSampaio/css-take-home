/**
 * The single definition of "in the way": another non-cancelled reservation on
 * the same berth whose inclusive date range meets ours. Services run it inside
 * their transaction as the friendly pre-check (and again to name the winner of a
 * race); the detail page runs it to show live overlaps. Same SQL, same answer.
 */
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import type { ISODate } from "../../domain/dates";
import type { ConflictInfo } from "../../services/result";
import { berths, reservations, vessels } from "../schema";
import type { DbOrTx } from "../types";
import { reservationLabel } from "./shared";

export type OverlapQuery = {
  berthId: string;
  startDate: ISODate;
  endDate: ISODate;
  /** When editing or confirming, a reservation must not collide with itself. */
  excludeId?: string;
  /** Defaults to both live statuses. Cancelled rows are never in the way. */
  statuses?: readonly ("confirmed" | "needs_review")[];
};

export async function findOverlapping(db: DbOrTx, query: OverlapQuery): Promise<ConflictInfo[]> {
  const statuses = query.statuses ?? (["confirmed", "needs_review"] as const);
  const rows = await db
    .select({
      id: reservations.id,
      kind: reservations.kind,
      title: reservations.title,
      rawLabel: reservations.rawLabel,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      status: reservations.status,
      vesselName: vessels.name,
      vesselPrefix: vessels.prefix,
    })
    .from(reservations)
    .leftJoin(vessels, eq(vessels.id, reservations.vesselId))
    .where(
      and(
        eq(reservations.berthId, query.berthId),
        inArray(reservations.status, [...statuses]),
        // Inclusive at both ends, like daterange(start, end, '[]') in the exclusion constraint.
        lte(reservations.startDate, query.endDate),
        gte(reservations.endDate, query.startDate),
        query.excludeId ? ne(reservations.id, query.excludeId) : undefined,
      ),
    )
    .orderBy(asc(reservations.startDate), asc(reservations.id));

  return rows.map((row) => ({
    id: row.id,
    label: reservationLabel(row),
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status as ConflictInfo["status"],
  }));
}

/** Berth lookup used by every write path; kept here so services never hand-roll it. */
export async function findBerth(db: DbOrTx, berthId: string): Promise<{ id: string; name: string; lengthFt: number } | null> {
  const [row] = await db.select({ id: berths.id, name: berths.name, lengthFt: berths.lengthFt }).from(berths).where(eq(berths.id, berthId)).limit(1);
  return row ?? null;
}
