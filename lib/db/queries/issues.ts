/**
 * The "needs attention" reads. Two different sources, kept apart on purpose:
 *
 * - STORED import findings (the `issues` table): what the importer could not
 *   settle on its own. They close when a person confirms, edits or cancels.
 * - COMPUTED problems: fit violations and unknown lengths, derived on every
 *   read from current lengths, so they can never disagree with the data.
 */
import { and, asc, count, desc, eq, exists, gt, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { ISODate } from "../../domain/dates";
import type { LengthStatus } from "../../domain/fit";
import { ISSUE_TYPES, type IssueType } from "../../seed/contract";
import { berths, issues, reservations, vessels } from "../schema";
import type { Db } from "../types";
import { pageOf, reservationLabel, vesselLabel, type Page, type ReservationStatus } from "./shared";

export type IssueSummary = {
  /** Open import findings, all types. */
  openTotal: number;
  byType: Record<IssueType, number>;
  /** Open ambiguous_extent findings split by cause (`merge_past_month_end`, ...); findings without a reason count under `unspecified`. */
  ambiguousExtentByReason: Record<string, number>;
  /** Computed: live vessel reservations on a berth shorter than the vessel. */
  misfitReservations: number;
  /** Computed: vessels with status `unknown` and at least one live reservation. */
  vesselsWithUnknownLength: number;
  /** Computed: vessels with status `conflict` (the registry disagrees with itself) and at least one live reservation. */
  vesselsWithConflictingLength: number;
  needsReviewReservations: number;
};

export type OpenIssue = {
  id: string;
  type: IssueType;
  severity: "blocking" | "warning";
  reason: string | null;
  detail: string;
  sourceRef: string | null;
  relatedReservationIds: string[];
  reservation: { id: string; label: string; berthId: string; berthName: string; startDate: ISODate; endDate: ISODate; status: ReservationStatus; version: number } | null;
  vessel: { id: string; displayName: string; lengthFt: number | null; lengthStatus: LengthStatus; lengthCandidates: number[]; version: number } | null;
};

export type FitViolationGroup = {
  vesselId: string;
  vesselName: string;
  vesselLengthFt: number;
  lengthStatus: LengthStatus;
  berthId: string;
  berthName: string;
  berthLengthFt: number;
  overByFt: number;
  /** Live reservations of this vessel on this berth. */
  count: number;
  firstDate: ISODate;
  lastDate: ISODate;
  /** The most recent one, as a way in. */
  sampleReservationId: string;
};

export type FitViolationRow = {
  reservationId: string;
  status: ReservationStatus;
  startDate: ISODate;
  endDate: ISODate;
  vesselId: string;
  vesselName: string;
  vesselLengthFt: number;
  lengthStatus: LengthStatus;
  berthId: string;
  berthName: string;
  berthLengthFt: number;
  overByFt: number;
};

const liveReservation = ne(reservations.status, "cancelled");
/** The misfit predicate. A NULL length (unknown, conflict) compares as NULL, so those rows are correctly left out. */
const tooLong = gt(vessels.lengthFt, berths.lengthFt);

const misfit = and(liveReservation, isNotNull(vessels.lengthFt), tooLong);

const hasLiveReservation = (db: Db) =>
  exists(db.select({ one: sql`1` }).from(reservations).where(and(eq(reservations.vesselId, vessels.id), liveReservation)));

export async function getIssueSummary(db: Db): Promise<IssueSummary> {
  const [typeRows, reasonRows, [misfits], lengthRows, [review]] = await Promise.all([
    db.select({ type: issues.type, n: count() }).from(issues).where(isNull(issues.resolvedAt)).groupBy(issues.type),
    db
      .select({ reason: issues.reason, n: count() })
      .from(issues)
      .where(and(isNull(issues.resolvedAt), eq(issues.type, "ambiguous_extent")))
      .groupBy(issues.reason),
    db
      .select({ n: count() })
      .from(reservations)
      .innerJoin(vessels, eq(vessels.id, reservations.vesselId))
      .innerJoin(berths, eq(berths.id, reservations.berthId))
      .where(misfit),
    db
      .select({ status: vessels.lengthStatus, n: count() })
      .from(vessels)
      .where(and(sql`${vessels.lengthStatus} in ('unknown', 'conflict')`, hasLiveReservation(db)))
      .groupBy(vessels.lengthStatus),
    db.select({ n: count() }).from(reservations).where(eq(reservations.status, "needs_review")),
  ]);

  const byType = Object.fromEntries(ISSUE_TYPES.map((type) => [type, 0])) as Record<IssueType, number>;
  let openTotal = 0;
  for (const row of typeRows) {
    openTotal += row.n;
    if (row.type in byType) byType[row.type as IssueType] = row.n;
  }

  return {
    openTotal,
    byType,
    ambiguousExtentByReason: Object.fromEntries(reasonRows.map((row) => [row.reason ?? "unspecified", row.n])),
    misfitReservations: misfits?.n ?? 0,
    vesselsWithUnknownLength: lengthRows.find((row) => row.status === "unknown")?.n ?? 0,
    vesselsWithConflictingLength: lengthRows.find((row) => row.status === "conflict")?.n ?? 0,
    needsReviewReservations: review?.n ?? 0,
  };
}

/** Open import findings with enough of their subject to render a worklist row and link to the fix. Oldest stays first. */
export async function getOpenIssues(db: Db, opts: { type?: IssueType } & Page = {}): Promise<{ total: number; rows: OpenIssue[] }> {
  const { limit, offset } = pageOf(opts, 50);
  const filter = and(isNull(issues.resolvedAt), opts.type ? eq(issues.type, opts.type) : undefined);

  const [[total], rows] = await Promise.all([
    db.select({ n: count() }).from(issues).where(filter),
    db
      .select({
        issue: issues,
        reservation: {
          id: reservations.id,
          kind: reservations.kind,
          title: reservations.title,
          rawLabel: reservations.rawLabel,
          berthId: reservations.berthId,
          startDate: reservations.startDate,
          endDate: reservations.endDate,
          status: reservations.status,
          version: reservations.version,
          vesselId: reservations.vesselId,
        },
        berthName: berths.name,
      })
      .from(issues)
      .leftJoin(reservations, eq(reservations.id, issues.reservationId))
      .leftJoin(berths, eq(berths.id, reservations.berthId))
      .where(filter)
      .orderBy(asc(sql`coalesce(${reservations.startDate}, '9999-12-31'::date)`), asc(issues.id))
      .limit(limit)
      .offset(offset),
  ]);

  // One lookup covers both roles a vessel can play here: the issue's own subject, or the occupant of its reservation.
  const vesselIds = [...new Set(rows.flatMap((r) => [r.issue.vesselId, r.reservation?.vesselId]).filter((id): id is string => !!id))];
  const vesselRows = vesselIds.length > 0 ? await db.select().from(vessels).where(inArray(vessels.id, vesselIds)) : [];
  const vesselById = new Map(vesselRows.map((v) => [v.id, v]));

  return {
    total: total?.n ?? 0,
    rows: rows.map(({ issue, reservation, berthName }) => {
      const occupant = reservation?.vesselId ? vesselById.get(reservation.vesselId) : undefined;
      const subject = issue.vesselId ? vesselById.get(issue.vesselId) : undefined;
      return {
        id: issue.id,
        type: issue.type as IssueType,
        severity: issue.severity as OpenIssue["severity"],
        reason: issue.reason,
        detail: issue.detail,
        sourceRef: issue.sourceRef,
        relatedReservationIds: issue.relatedReservationIds,
        reservation: reservation
          ? {
              id: reservation.id,
              label: reservationLabel({ ...reservation, vesselName: occupant?.name ?? null, vesselPrefix: occupant?.prefix ?? null }),
              berthId: reservation.berthId,
              berthName: berthName ?? reservation.berthId,
              startDate: reservation.startDate,
              endDate: reservation.endDate,
              status: reservation.status,
              version: reservation.version,
            }
          : null,
        vessel: subject
          ? {
              id: subject.id,
              displayName: vesselLabel(subject),
              lengthFt: subject.lengthFt,
              lengthStatus: subject.lengthStatus,
              lengthCandidates: subject.lengthCandidates,
              version: subject.version,
            }
          : null,
      };
    }),
  };
}

/**
 * Misfits grouped by vessel and berth: 23 years of one yacht on one short float
 * is ONE thing to look at (usually a wrong length on file), not forty. Worst
 * overage first.
 */
export async function getFitViolations(db: Db, opts: Page = {}): Promise<{ totalGroups: number; totalReservations: number; groups: FitViolationGroup[] }> {
  const { limit, offset } = pageOf(opts, 50);
  const grouped = db
      .select({
        vesselId: vessels.id,
        vesselName: vessels.name,
        vesselPrefix: vessels.prefix,
        vesselLengthFt: vessels.lengthFt,
        lengthStatus: vessels.lengthStatus,
        berthId: berths.id,
        berthName: berths.name,
        berthLengthFt: berths.lengthFt,
        count: count(),
        firstDate: sql<ISODate>`min(${reservations.startDate})::text`,
        lastDate: sql<ISODate>`max(${reservations.endDate})::text`,
        sampleReservationId: sql<string>`(array_agg(${reservations.id} order by ${reservations.startDate} desc, ${reservations.id}))[1]`,
      })
      .from(reservations)
      .innerJoin(vessels, eq(vessels.id, reservations.vesselId))
      .innerJoin(berths, eq(berths.id, reservations.berthId))
      .where(misfit)
      .groupBy(vessels.id, berths.id);

  const [[totals], page] = await Promise.all([
    db
      .select({ reservations: count(), groups: sql<number>`count(distinct (${reservations.vesselId}, ${reservations.berthId}))`.mapWith(Number) })
      .from(reservations)
      .innerJoin(vessels, eq(vessels.id, reservations.vesselId))
      .innerJoin(berths, eq(berths.id, reservations.berthId))
      .where(misfit),
    grouped
      .orderBy(desc(sql`${vessels.lengthFt} - ${berths.lengthFt}`), asc(vessels.nameKey), asc(berths.sortOrder))
      .limit(limit)
      .offset(offset),
  ]);

  return {
    totalGroups: totals?.groups ?? 0,
    totalReservations: totals?.reservations ?? 0,
    groups: page.map(({ vesselPrefix, vesselLengthFt, ...g }) => ({
      ...g,
      vesselName: vesselLabel({ prefix: vesselPrefix, name: g.vesselName }),
      vesselLengthFt: vesselLengthFt!,
      overByFt: vesselLengthFt! - g.berthLengthFt,
    })),
  };
}

/** The same misfits one reservation per row, newest first, for drilling into a group or exporting. */
export async function getFitViolationList(db: Db, opts: Page & { vesselId?: string; berthId?: string } = {}): Promise<{ total: number; rows: FitViolationRow[] }> {
  const { limit, offset } = pageOf(opts, 100);
  const filter = and(
    misfit,
    opts.vesselId ? eq(reservations.vesselId, opts.vesselId) : undefined,
    opts.berthId ? eq(reservations.berthId, opts.berthId) : undefined,
  );

  const [[total], rows] = await Promise.all([
    db
      .select({ n: count() })
      .from(reservations)
      .innerJoin(vessels, eq(vessels.id, reservations.vesselId))
      .innerJoin(berths, eq(berths.id, reservations.berthId))
      .where(filter),
    db
      .select({
        reservationId: reservations.id,
        status: reservations.status,
        startDate: reservations.startDate,
        endDate: reservations.endDate,
        vesselId: vessels.id,
        vesselName: vessels.name,
        vesselPrefix: vessels.prefix,
        vesselLengthFt: vessels.lengthFt,
        lengthStatus: vessels.lengthStatus,
        berthId: berths.id,
        berthName: berths.name,
        berthLengthFt: berths.lengthFt,
      })
      .from(reservations)
      .innerJoin(vessels, eq(vessels.id, reservations.vesselId))
      .innerJoin(berths, eq(berths.id, reservations.berthId))
      .where(filter)
      .orderBy(desc(reservations.startDate), asc(reservations.id))
      .limit(limit)
      .offset(offset),
  ]);

  return {
    total: total?.n ?? 0,
    rows: rows.map(({ vesselPrefix, vesselLengthFt, ...r }) => ({
      ...r,
      vesselName: vesselLabel({ prefix: vesselPrefix, name: r.vesselName }),
      vesselLengthFt: vesselLengthFt!,
      overByFt: vesselLengthFt! - r.berthLengthFt,
    })),
  };
}
