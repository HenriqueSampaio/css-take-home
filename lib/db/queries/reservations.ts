/**
 * Reservation reads. The fit verdict is COMPUTED here on every read, from the
 * vessel's and the berth's current lengths, never stored, so there is no
 * bookkeeping to go stale. For a confirmed stay that has not ended it always
 * says "fits" (every write path keeps that true); for history and for cancelled
 * rows it reports honestly against today's lengths.
 */
import { and, asc, eq, gt, gte, isNull, lte, ne, sql } from "drizzle-orm";
import type { Occupancy } from "../../domain/availability";
import { isISODate, monthBounds, yearMonthOf, type ISODate, type YearMonth } from "../../domain/dates";
import { fitVerdict, type FitVerdict } from "../../domain/fit";
import { berths, reservations, vessels } from "../schema";
import type { Db } from "../types";
import { isoTimestamp, reservationLabel, vesselLabel, type ReservationKind, type ReservationStatus, type StayRef } from "./shared";

export type { ReservationKind, ReservationStatus, StayRef };

export type VesselRef = {
  id: string;
  /** Without prefix: `Golden Compass`. */
  name: string;
  prefix: string | null;
  /** With prefix: `R/V Golden Compass`. */
  displayName: string;
  lengthFt: number;
};

export type MonthReservation = {
  id: string;
  berthId: string;
  berthName: string;
  berthLengthFt: number;
  kind: ReservationKind;
  status: ReservationStatus;
  startDate: ISODate;
  /** Inclusive. */
  endDate: ISODate;
  /** Same as startDate/endDate, so rows can be handed to buildTimeline() unchanged. */
  start: ISODate;
  end: ISODate;
  /** Vessel display name, or the title of an event or closure. */
  label: string;
  title: string | null;
  notes: string;
  /** Pass back to updateReservation, cancelReservation or restoreReservation. */
  version: number;
  vessel: VesselRef | null;
  /** null for events and closures, which have no length to check. */
  fit: FitVerdict | null;
};

export type ReservationDetail = Omit<MonthReservation, "berthName" | "berthLengthFt"> & {
  berth: { id: string; name: string; lengthFt: number; retiredAt: string | null };
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
};

export type DockToday = {
  today: ISODate;
  /** Berths in use (not retired). */
  berthsTotal: number;
  /** Of those, the ones with a confirmed stay covering today. */
  berthsOccupied: number;
  arrivingToday: StayRef[];
  departingToday: StayRef[];
  /** The earliest confirmed stay starting after today. */
  nextArrival: (StayRef & { berthName: string }) | null;
};

const vesselRefColumns = { id: vessels.id, name: vessels.name, prefix: vessels.prefix, lengthFt: vessels.lengthFt };

type VesselColumns = { id: string; name: string; prefix: string | null; lengthFt: number };

const toVesselRef = (v: VesselColumns): VesselRef => ({ ...v, displayName: vesselLabel(v) });

const labelOf = (row: { kind: ReservationKind; title: string | null }, vessel: VesselColumns | null): string =>
  reservationLabel({ kind: row.kind, title: row.title, vesselName: vessel?.name ?? null, vesselPrefix: vessel?.prefix ?? null });

const fitOf = (kind: ReservationKind, vessel: VesselColumns | null, berthLengthFt: number): FitVerdict | null =>
  kind === "vessel" && vessel ? fitVerdict(vessel.lengthFt, berthLengthFt) : null;

/**
 * Reservations that touch the month, including stays that began earlier or run
 * past its end. Only berths in use: a retired berth has no row on the schedule
 * to draw them in. Throws RangeError on a malformed `ym`.
 */
export async function getMonthReservations(db: Db, ym: YearMonth, opts: { includeCancelled?: boolean } = {}): Promise<MonthReservation[]> {
  const month = monthBounds(ym);
  const rows = await db
    .select({
      id: reservations.id,
      berthId: reservations.berthId,
      berthName: berths.name,
      berthLengthFt: berths.lengthFt,
      kind: reservations.kind,
      status: reservations.status,
      startDate: reservations.startDate,
      endDate: reservations.endDate,
      title: reservations.title,
      notes: reservations.notes,
      version: reservations.version,
      vessel: vesselRefColumns,
    })
    .from(reservations)
    .innerJoin(berths, eq(berths.id, reservations.berthId))
    .leftJoin(vessels, eq(vessels.id, reservations.vesselId))
    .where(
      and(
        isNull(berths.retiredAt),
        lte(reservations.startDate, month.end),
        gte(reservations.endDate, month.start),
        opts.includeCancelled ? undefined : ne(reservations.status, "cancelled"),
      ),
    )
    .orderBy(asc(berths.sortOrder), asc(reservations.startDate), asc(reservations.id));

  return rows.map(({ vessel, ...row }) => ({
    ...row,
    start: row.startDate,
    end: row.endDate,
    label: labelOf(row, vessel),
    vessel: vessel ? toVesselRef(vessel) : null,
    fit: fitOf(row.kind, vessel, row.berthLengthFt),
  }));
}

/** One reservation, whatever its status and whether or not its berth has since been retired. */
export async function getReservationDetail(db: Db, id: string): Promise<ReservationDetail | null> {
  const [found] = await db
    .select({
      row: reservations,
      berth: { id: berths.id, name: berths.name, lengthFt: berths.lengthFt, retiredAt: berths.retiredAt },
      vessel: vesselRefColumns,
    })
    .from(reservations)
    .innerJoin(berths, eq(berths.id, reservations.berthId))
    .leftJoin(vessels, eq(vessels.id, reservations.vesselId))
    .where(eq(reservations.id, id))
    .limit(1);
  if (!found) return null;
  const { row, berth, vessel } = found;

  return {
    id: row.id,
    berthId: row.berthId,
    kind: row.kind,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    start: row.startDate,
    end: row.endDate,
    label: labelOf(row, vessel),
    title: row.title,
    notes: row.notes,
    version: row.version,
    vessel: vessel ? toVesselRef(vessel) : null,
    fit: fitOf(row.kind, vessel, berth.lengthFt),
    berth: { ...berth, retiredAt: isoTimestamp(berth.retiredAt) },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cancelledAt: isoTimestamp(row.cancelledAt),
  };
}

/** Every confirmed stay occupying any berth during the range, shaped for classifyBerths(). Throws RangeError on malformed dates. */
export async function getOccupancy(db: Db, range: { start: ISODate; end: ISODate }): Promise<Occupancy[]> {
  if (!isISODate(range.start) || !isISODate(range.end)) throw new RangeError(`Invalid date range: ${range.start}..${range.end}`);
  const rows = await db
    .select({
      id: reservations.id,
      berthId: reservations.berthId,
      kind: reservations.kind,
      title: reservations.title,
      start: reservations.startDate,
      end: reservations.endDate,
      vesselName: vessels.name,
      vesselPrefix: vessels.prefix,
    })
    .from(reservations)
    .leftJoin(vessels, eq(vessels.id, reservations.vesselId))
    .where(and(eq(reservations.status, "confirmed"), lte(reservations.startDate, range.end), gte(reservations.endDate, range.start)))
    .orderBy(asc(reservations.startDate), asc(reservations.id));

  return rows.map((row) => ({ id: row.id, berthId: row.berthId, label: reservationLabel(row), start: row.start, end: row.end }));
}

/** The dock at a glance: how full it is today, who arrives and leaves today, and who is next. Berths in use only. */
export async function getDockToday(db: Db, today: ISODate): Promise<DockToday> {
  if (!isISODate(today)) throw new RangeError(`Invalid date: ${today}`);
  const stayColumns = {
    id: reservations.id,
    berthId: reservations.berthId,
    berthName: berths.name,
    kind: reservations.kind,
    title: reservations.title,
    startDate: reservations.startDate,
    endDate: reservations.endDate,
    vesselName: vessels.name,
    vesselPrefix: vessels.prefix,
  };
  const confirmedOnActiveBerths = () =>
    db
      .select(stayColumns)
      .from(reservations)
      .innerJoin(berths, eq(berths.id, reservations.berthId))
      .leftJoin(vessels, eq(vessels.id, reservations.vesselId));

  const [[active], here, [upcoming]] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(berths).where(isNull(berths.retiredAt)),
    confirmedOnActiveBerths()
      .where(and(isNull(berths.retiredAt), eq(reservations.status, "confirmed"), lte(reservations.startDate, today), gte(reservations.endDate, today)))
      .orderBy(asc(berths.sortOrder), asc(reservations.id)),
    confirmedOnActiveBerths()
      .where(and(isNull(berths.retiredAt), eq(reservations.status, "confirmed"), gt(reservations.startDate, today)))
      .orderBy(asc(reservations.startDate), asc(berths.sortOrder), asc(reservations.id))
      .limit(1),
  ]);

  const toStayRef = (r: (typeof here)[number]): StayRef => ({ id: r.id, label: reservationLabel(r), kind: r.kind, startDate: r.startDate, endDate: r.endDate });
  return {
    today,
    berthsTotal: active?.n ?? 0,
    // One confirmed stay per berth-day is the database's rule, so the stays covering today ARE the occupied berths.
    berthsOccupied: new Set(here.map((r) => r.berthId)).size,
    arrivingToday: here.filter((r) => r.startDate === today).map(toStayRef),
    departingToday: here.filter((r) => r.endDate === today).map(toStayRef),
    nextArrival: upcoming ? { ...toStayRef(upcoming), berthName: upcoming.berthName } : null,
  };
}

/**
 * How far back the schedule can be browsed: the month of the earliest
 * reservation of any status, or today's month when that is earlier (or when
 * nothing has been booked yet). Bookings only start today or later, so this
 * only moves into the past as time passes.
 */
export async function getFirstMonth(db: Db, today: ISODate): Promise<YearMonth> {
  // Cast to text in SQL: an aggregate has no column type for Drizzle to apply its string date mode to.
  const [row] = await db.select({ earliest: sql<ISODate | null>`min(${reservations.startDate})::text` }).from(reservations);
  const thisMonth = yearMonthOf(today);
  const earliest = row?.earliest ? yearMonthOf(row.earliest) : thisMonth;
  return earliest < thisMonth ? earliest : thisMonth;
}
