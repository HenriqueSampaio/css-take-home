/**
 * Reservation reads. Fit verdicts and overlaps are COMPUTED here on every read
 * (from the vessel's current length and the berth's current neighbours), never
 * stored, so correcting a length or cancelling a stay updates every screen with
 * no bookkeeping to go stale.
 */
import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import type { Occupancy } from "../../domain/availability";
import { isISODate, monthBounds, yearMonthOf, type ISODate, type YearMonth } from "../../domain/dates";
import { fitVerdict, type FitVerdict, type LengthStatus } from "../../domain/fit";
import type { ConflictInfo } from "../../services/result";
import { berths, issues, reservations, vessels } from "../schema";
import type { Db } from "../types";
import { findOverlapping } from "./overlaps";
import { isoTimestamp, reservationLabel, vesselLabel, type ReservationStatus } from "./shared";

export type VesselRef = {
  id: string;
  /** Without prefix: `Golden Compass`. */
  name: string;
  prefix: string | null;
  /** With prefix: `R/V Golden Compass`. */
  displayName: string;
  lengthFt: number | null;
  lengthStatus: LengthStatus;
};

export type MonthReservation = {
  id: string;
  berthId: string;
  berthName: string;
  berthLengthFt: number;
  kind: "vessel" | "event" | "closure";
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
  source: "legacy" | "app";
  version: number;
  vessel: VesselRef | null;
  openIssueCount: number;
  /** null for events and closures, which have no length to check. */
  fit: FitVerdict | null;
};

export type IssueRow = {
  id: string;
  type: string;
  severity: string;
  reason: string | null;
  detail: string;
  relatedReservationIds: string[];
  sourceRef: string | null;
  /** ISO timestamp; null while the issue is open. */
  resolvedAt: string | null;
  resolution: string | null;
};

export type ReservationDetail = Omit<MonthReservation, "berthName" | "berthLengthFt" | "openIssueCount" | "vessel"> & {
  berth: { id: string; name: string; lengthFt: number };
  vessel: (VesselRef & { version: number; lengthCandidates: number[]; lengthEvidence: string | null }) | null;
  /** Legacy rows: the workbook cells this came from, and the label as written there. */
  sourceRef: string | null;
  rawLabel: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  /** Import findings for this row, open first. */
  issues: IssueRow[];
  /** Other live reservations on the same berth whose dates meet this one's, computed now. `confirmed` ones would block a confirm. */
  overlaps: ConflictInfo[];
};

const openIssueCount = sql<number>`(select count(*) from ${issues} where ${issues.reservationId} = ${reservations.id} and ${issues.resolvedAt} is null)`.mapWith(Number);

const vesselRefColumns = { id: vessels.id, name: vessels.name, prefix: vessels.prefix, lengthFt: vessels.lengthFt, lengthStatus: vessels.lengthStatus };

const toVesselRef = (v: { id: string; name: string; prefix: string | null; lengthFt: number | null; lengthStatus: LengthStatus }): VesselRef => ({
  id: v.id,
  name: v.name,
  prefix: v.prefix,
  displayName: vesselLabel(v),
  lengthFt: v.lengthFt,
  lengthStatus: v.lengthStatus,
});

/** Reservations that touch the month, including stays that began earlier or run past its end. Throws RangeError on a malformed `ym`. */
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
      rawLabel: reservations.rawLabel,
      notes: reservations.notes,
      source: reservations.source,
      version: reservations.version,
      vessel: vesselRefColumns,
      openIssueCount,
    })
    .from(reservations)
    .innerJoin(berths, eq(berths.id, reservations.berthId))
    .leftJoin(vessels, eq(vessels.id, reservations.vesselId))
    .where(
      and(
        lte(reservations.startDate, month.end),
        gte(reservations.endDate, month.start),
        opts.includeCancelled ? undefined : ne(reservations.status, "cancelled"),
      ),
    )
    .orderBy(asc(berths.sortOrder), asc(reservations.startDate), asc(reservations.id));

  return rows.map(({ rawLabel, vessel, ...row }) => ({
    ...row,
    start: row.startDate,
    end: row.endDate,
    label: reservationLabel({ kind: row.kind, title: row.title, rawLabel, vesselName: vessel?.name ?? null, vesselPrefix: vessel?.prefix ?? null }),
    vessel: vessel ? toVesselRef(vessel) : null,
    fit: row.kind === "vessel" ? fitVerdict(vessel?.lengthFt, row.berthLengthFt) : null,
  }));
}

export async function getReservationDetail(db: Db, id: string): Promise<ReservationDetail | null> {
  const [found] = await db
    .select({
      row: reservations,
      berth: { id: berths.id, name: berths.name, lengthFt: berths.lengthFt },
      vessel: { ...vesselRefColumns, version: vessels.version, lengthCandidates: vessels.lengthCandidates, lengthEvidence: vessels.lengthEvidence },
    })
    .from(reservations)
    .innerJoin(berths, eq(berths.id, reservations.berthId))
    .leftJoin(vessels, eq(vessels.id, reservations.vesselId))
    .where(eq(reservations.id, id))
    .limit(1);
  if (!found) return null;
  const { row, berth, vessel } = found;

  const [issueRows, overlaps] = await Promise.all([
    db
      .select()
      .from(issues)
      .where(eq(issues.reservationId, id))
      // Open first (NULLS FIRST is the default for DESC), then the most recently resolved.
      .orderBy(desc(issues.resolvedAt), asc(issues.type), asc(issues.id)),
    // A cancelled row occupies nothing, so nothing overlaps it; what WOULD block restoring it is still worth showing.
    findOverlapping(db, { berthId: row.berthId, startDate: row.startDate, endDate: row.endDate, excludeId: row.id }),
  ]);

  return {
    id: row.id,
    berthId: row.berthId,
    kind: row.kind,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    start: row.startDate,
    end: row.endDate,
    label: reservationLabel({ kind: row.kind, title: row.title, rawLabel: row.rawLabel, vesselName: vessel?.name ?? null, vesselPrefix: vessel?.prefix ?? null }),
    title: row.title,
    notes: row.notes,
    source: row.source,
    sourceRef: row.sourceRef,
    rawLabel: row.rawLabel,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cancelledAt: isoTimestamp(row.cancelledAt),
    berth,
    vessel: vessel ? { ...toVesselRef(vessel), version: vessel.version, lengthCandidates: vessel.lengthCandidates, lengthEvidence: vessel.lengthEvidence } : null,
    issues: issueRows.map((i) => ({
      id: i.id,
      type: i.type,
      severity: i.severity,
      reason: i.reason,
      detail: i.detail,
      relatedReservationIds: i.relatedReservationIds,
      sourceRef: i.sourceRef,
      resolvedAt: isoTimestamp(i.resolvedAt),
      resolution: i.resolution,
    })),
    overlaps,
    fit: row.kind === "vessel" ? fitVerdict(vessel?.lengthFt, berth.lengthFt) : null,
  };
}

/** Everything occupying any berth during the range, shaped for classifyBerths(). Throws RangeError on malformed dates. */
export async function getOccupancy(db: Db, range: { start: ISODate; end: ISODate }): Promise<Occupancy[]> {
  if (!isISODate(range.start) || !isISODate(range.end)) throw new RangeError(`Invalid date range: ${range.start}..${range.end}`);
  const rows = await db
    .select({
      id: reservations.id,
      berthId: reservations.berthId,
      kind: reservations.kind,
      title: reservations.title,
      rawLabel: reservations.rawLabel,
      status: reservations.status,
      start: reservations.startDate,
      end: reservations.endDate,
      vesselName: vessels.name,
      vesselPrefix: vessels.prefix,
    })
    .from(reservations)
    .leftJoin(vessels, eq(vessels.id, reservations.vesselId))
    .where(and(ne(reservations.status, "cancelled"), lte(reservations.startDate, range.end), gte(reservations.endDate, range.start)))
    .orderBy(asc(reservations.startDate), asc(reservations.id));

  return rows.map((row) => ({
    id: row.id,
    berthId: row.berthId,
    status: row.status as Occupancy["status"],
    label: reservationLabel(row),
    start: row.start,
    end: row.end,
  }));
}

/**
 * Where the schedule opens. The legacy data stops years before today, and an
 * empty current month would make the app look broken, so: the latest month, not
 * after today's, in which something is booked. A stay that started earlier but
 * is still running counts for every month it covers.
 */
export async function getDefaultMonth(db: Db, today: ISODate): Promise<YearMonth> {
  const thisMonth = monthBounds(yearMonthOf(today));
  const [row] = await db
    .select({ latest: sql<ISODate | null>`max(least(${reservations.endDate}, ${thisMonth.end}::date))::text` })
    .from(reservations)
    .where(and(ne(reservations.status, "cancelled"), lte(reservations.startDate, thisMonth.end)));
  return row?.latest ? yearMonthOf(row.latest) : yearMonthOf(today);
}
