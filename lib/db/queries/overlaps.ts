/**
 * The two definitions of "in the way", each written once.
 *
 * findOverlapping: another CONFIRMED reservation on the same berth whose
 * inclusive date range meets ours. Services run it inside their transaction as
 * the friendly pre-check, and again to name the winner of a race. Cancelled
 * rows are never in the way.
 *
 * findOpenStays: the confirmed stays that have not ended yet. These are what a
 * change to a vessel or a berth has to keep true, and what stops a berth from
 * being retired. Stays that have ended are history and bind nothing.
 */
import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import type { ISODate } from "../../domain/dates";
import type { ConflictInfo } from "../../services/result";
import { berths, reservations, vessels } from "../schema";
import type { DbOrTx } from "../types";
import { reservationLabel } from "./shared";

export type OverlapQuery = {
  berthId: string;
  startDate: ISODate;
  endDate: ISODate;
  /** When editing or restoring, a reservation must not collide with itself. */
  excludeId?: string;
};

export async function findOverlapping(db: DbOrTx, query: OverlapQuery): Promise<ConflictInfo[]> {
  const rows = await db
    .select({
      id: reservations.id,
      kind: reservations.kind,
      title: reservations.title,
      berthName: berths.name,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      vesselName: vessels.name,
      vesselPrefix: vessels.prefix,
    })
    .from(reservations)
    .innerJoin(berths, eq(berths.id, reservations.berthId))
    .leftJoin(vessels, eq(vessels.id, reservations.vesselId))
    .where(
      and(
        eq(reservations.berthId, query.berthId),
        eq(reservations.status, "confirmed"),
        // Inclusive at both ends, like daterange(start, end, '[]') in the exclusion constraint.
        lte(reservations.startDate, query.endDate),
        gte(reservations.endDate, query.startDate),
        query.excludeId ? ne(reservations.id, query.excludeId) : undefined,
      ),
    )
    .orderBy(asc(reservations.startDate), asc(reservations.id));

  return rows.map((row) => ({ id: row.id, label: reservationLabel(row), berthName: row.berthName, startDate: row.startDate, endDate: row.endDate }));
}

/** A stay that has not ended, with the two lengths a fit check needs. `vesselFt` is null for events and closures. */
export type OpenStay = ConflictInfo & { vesselFt: number | null; berthFt: number };

/** Drops the lengths again, for the `conflicts` list of a refusal. */
export const toConflict = ({ id, label, berthName, startDate, endDate }: OpenStay): ConflictInfo => ({ id, label, berthName, startDate, endDate });

/** Confirmed stays with endDate >= today, for one berth or one vessel, earliest first. */
export async function findOpenStays(db: DbOrTx, query: { today: ISODate } & ({ berthId: string } | { vesselId: string })): Promise<OpenStay[]> {
  const rows = await db
    .select({
      id: reservations.id,
      kind: reservations.kind,
      title: reservations.title,
      berthName: berths.name,
      berthFt: berths.lengthFt,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      vesselName: vessels.name,
      vesselPrefix: vessels.prefix,
      vesselFt: vessels.lengthFt,
    })
    .from(reservations)
    .innerJoin(berths, eq(berths.id, reservations.berthId))
    .leftJoin(vessels, eq(vessels.id, reservations.vesselId))
    .where(
      and(
        "berthId" in query ? eq(reservations.berthId, query.berthId) : eq(reservations.vesselId, query.vesselId),
        eq(reservations.status, "confirmed"),
        gte(reservations.endDate, query.today),
      ),
    )
    .orderBy(asc(reservations.startDate), asc(reservations.id));

  return rows.map((row) => ({
    id: row.id,
    label: reservationLabel(row),
    berthName: row.berthName,
    startDate: row.startDate,
    endDate: row.endDate,
    vesselFt: row.vesselFt,
    berthFt: row.berthFt,
  }));
}
