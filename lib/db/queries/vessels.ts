/** Vessel reads: the picker on the booking form, and the registry list with how busy each vessel is. */
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { isISODate, type ISODate } from "../../domain/dates";
import { reservations, vessels } from "../schema";
import type { Db } from "../types";
import { escapeLike, vesselLabel } from "./shared";

export type VesselOption = {
  id: string;
  /** With prefix: `R/V Golden Compass`. */
  displayName: string;
  name: string;
  prefix: string | null;
  lengthFt: number;
};

export type VesselListItem = VesselOption & {
  /** Pass back to updateVessel. */
  version: number;
  /** Confirmed stays that have not ended. These are what hold the vessel's length in place. */
  upcomingCount: number;
  /** Every stay that was not cancelled, history included. */
  totalCount: number;
};

/** Every vessel, small enough (a few hundred rows) to ship whole to a client-side searchable picker. */
export async function getVesselOptions(db: Db): Promise<VesselOption[]> {
  const rows = await db
    .select({ id: vessels.id, name: vessels.name, prefix: vessels.prefix, lengthFt: vessels.lengthFt })
    .from(vessels)
    .orderBy(asc(vessels.nameKey));
  return rows.map((v) => ({ ...v, displayName: vesselLabel(v) }));
}

/** `q` matches anywhere in the name, with or without its prefix, ignoring case. */
export async function getVessels(db: Db, today: ISODate, opts: { q?: string } = {}): Promise<VesselListItem[]> {
  if (!isISODate(today)) throw new RangeError(`Invalid date: ${today}`);
  const q = opts.q?.trim();
  const pattern = q ? `%${escapeLike(q)}%` : null;
  const rows = await db
    .select({
      id: vessels.id,
      name: vessels.name,
      prefix: vessels.prefix,
      lengthFt: vessels.lengthFt,
      version: vessels.version,
      upcomingCount: sql<number>`count(${reservations.id}) filter (where ${reservations.endDate} >= ${today}::date)`.mapWith(Number),
      totalCount: sql<number>`count(${reservations.id})`.mapWith(Number),
    })
    .from(vessels)
    // Cancelled stays are filtered in the join, not in WHERE, so a vessel with only cancelled bookings still lists (with 0).
    .leftJoin(reservations, and(eq(reservations.vesselId, vessels.id), eq(reservations.status, "confirmed")))
    .where(pattern ? or(ilike(vessels.name, pattern), ilike(sql`coalesce(${vessels.prefix} || ' ', '') || ${vessels.name}`, pattern)) : undefined)
    .groupBy(vessels.id)
    .orderBy(asc(vessels.nameKey));
  return rows.map((v) => ({ ...v, displayName: vesselLabel(v) }));
}
