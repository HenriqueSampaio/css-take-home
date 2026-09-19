import { and, asc, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import type { ISODate } from "../../domain/dates";
import { fitVerdict, type FitVerdict, type LengthStatus } from "../../domain/fit";
import { berths, issues, reservations, vessels } from "../schema";
import type { Db } from "../types";
import { escapeLike, isoTimestamp, vesselLabel, type ReservationStatus } from "./shared";

export type VesselOption = {
  id: string;
  /** With prefix: `R/V Golden Compass`. */
  displayName: string;
  name: string;
  prefix: string | null;
  lengthFt: number | null;
  lengthStatus: LengthStatus;
};

export type VesselListItem = VesselOption & {
  lengthCandidates: number[];
  lengthEvidence: string | null;
  origin: "grid" | "registry" | "app";
  /** Pass back to setVesselLength. */
  version: number;
  /** Non-cancelled reservations. */
  bookingCount: number;
  /** Of those, the ones on a berth shorter than the vessel's current length. Computed, never stored. */
  misfitCount: number;
};

export type VesselBooking = {
  id: string;
  berthId: string;
  berthName: string;
  berthLengthFt: number;
  startDate: ISODate;
  endDate: ISODate;
  status: ReservationStatus;
  fit: FitVerdict;
};

export type VesselDetail = VesselListItem & {
  createdAt: string;
  updatedAt: string;
  /** Every reservation, newest first, cancelled included. */
  bookings: VesselBooking[];
  openIssues: { id: string; type: string; reason: string | null; detail: string; sourceRef: string | null }[];
};

/** Every vessel, small enough (a few hundred rows) to ship whole to a client-side searchable picker. */
export async function getVesselOptions(db: Db): Promise<VesselOption[]> {
  const rows = await db
    .select({ id: vessels.id, name: vessels.name, prefix: vessels.prefix, lengthFt: vessels.lengthFt, lengthStatus: vessels.lengthStatus })
    .from(vessels)
    .orderBy(asc(vessels.nameKey));
  return rows.map((v) => ({ ...v, displayName: vesselLabel(v) }));
}

const bookingCount = sql<number>`count(${reservations.id})`.mapWith(Number);
const misfitCount = sql<number>`count(${reservations.id}) filter (where ${berths.lengthFt} < ${vessels.lengthFt})`.mapWith(Number);

function listColumns() {
  return {
    id: vessels.id,
    name: vessels.name,
    prefix: vessels.prefix,
    lengthFt: vessels.lengthFt,
    lengthStatus: vessels.lengthStatus,
    lengthCandidates: vessels.lengthCandidates,
    lengthEvidence: vessels.lengthEvidence,
    origin: vessels.origin,
    version: vessels.version,
    bookingCount,
    misfitCount,
  };
}

/** `q` matches anywhere in the name, with or without its prefix, ignoring case. */
export async function getVessels(db: Db, opts: { q?: string; status?: LengthStatus } = {}): Promise<VesselListItem[]> {
  const q = opts.q?.trim();
  const pattern = q ? `%${escapeLike(q)}%` : null;
  const rows = await db
    .select(listColumns())
    .from(vessels)
    // Cancelled stays are filtered in the join, not in WHERE, so a vessel with only cancelled bookings still lists (with 0).
    .leftJoin(reservations, and(eq(reservations.vesselId, vessels.id), ne(reservations.status, "cancelled")))
    .leftJoin(berths, eq(berths.id, reservations.berthId))
    .where(
      and(
        opts.status ? eq(vessels.lengthStatus, opts.status) : undefined,
        pattern ? or(ilike(vessels.name, pattern), ilike(sql`coalesce(${vessels.prefix} || ' ', '') || ${vessels.name}`, pattern)) : undefined,
      ),
    )
    .groupBy(vessels.id)
    .orderBy(asc(vessels.nameKey));
  return rows.map((v) => ({ ...v, displayName: vesselLabel(v) }));
}

export async function getVesselDetail(db: Db, vesselId: string): Promise<VesselDetail | null> {
  const [vessel] = await db
    .select({ ...listColumns(), createdAt: vessels.createdAt, updatedAt: vessels.updatedAt })
    .from(vessels)
    .leftJoin(reservations, and(eq(reservations.vesselId, vessels.id), ne(reservations.status, "cancelled")))
    .leftJoin(berths, eq(berths.id, reservations.berthId))
    .where(eq(vessels.id, vesselId))
    .groupBy(vessels.id)
    .limit(1);
  if (!vessel) return null;

  const [bookings, openIssues] = await Promise.all([
    db
      .select({
        id: reservations.id,
        berthId: reservations.berthId,
        berthName: berths.name,
        berthLengthFt: berths.lengthFt,
        startDate: reservations.startDate,
        endDate: reservations.endDate,
        status: reservations.status,
      })
      .from(reservations)
      .innerJoin(berths, eq(berths.id, reservations.berthId))
      .where(eq(reservations.vesselId, vesselId))
      .orderBy(desc(reservations.startDate), asc(reservations.id)),
    db
      .select({ id: issues.id, type: issues.type, reason: issues.reason, detail: issues.detail, sourceRef: issues.sourceRef })
      .from(issues)
      .where(and(eq(issues.vesselId, vesselId), isNull(issues.resolvedAt)))
      .orderBy(asc(issues.id)),
  ]);

  return {
    ...vessel,
    displayName: vesselLabel(vessel),
    createdAt: isoTimestamp(vessel.createdAt)!,
    updatedAt: isoTimestamp(vessel.updatedAt)!,
    bookings: bookings.map((b) => ({ ...b, fit: fitVerdict(vessel.lengthFt, b.berthLengthFt) })),
    openIssues,
  };
}
