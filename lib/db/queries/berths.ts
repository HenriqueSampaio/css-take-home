/**
 * Berth reads. A retired berth is still a row (its history hangs off it), so
 * every list here leaves retired berths out unless asked for them.
 */
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import type { ISODate } from "../../domain/dates";
import { berths, reservations, vessels } from "../schema";
import type { Db } from "../types";
import { isoTimestamp, reservationLabel, type StayRef } from "./shared";

export type { StayRef };

export type BerthRow = {
  id: string;
  name: string;
  lengthFt: number;
  sortOrder: number;
  /** Pass back to updateBerth, retireBerth or restoreBerth. */
  version: number;
  /** ISO timestamp; null while the berth is in use. */
  retiredAt: string | null;
};

export type BerthStatus = BerthRow & {
  /** The confirmed stay covering today. The database allows at most one. */
  current: StayRef | null;
  /** The earliest confirmed stay starting after today. */
  next: StayRef | null;
  /** Confirmed stays that have not ended, `current` included: what stands in the way of retiring the berth. */
  upcomingCount: number;
};

/** Berths in dock order. */
export async function getBerths(db: Db, opts: { includeRetired?: boolean } = {}): Promise<BerthRow[]> {
  const rows = await db
    .select({ id: berths.id, name: berths.name, lengthFt: berths.lengthFt, sortOrder: berths.sortOrder, version: berths.version, retiredAt: berths.retiredAt })
    .from(berths)
    .where(opts.includeRetired ? undefined : isNull(berths.retiredAt))
    .orderBy(asc(berths.sortOrder), asc(berths.name));
  return rows.map((b) => ({ ...b, retiredAt: isoTimestamp(b.retiredAt) }));
}

/** Each berth with who is on it today and who is next. Two queries however many berths there are. */
export async function getBerthStatuses(db: Db, today: ISODate, opts: { includeRetired?: boolean } = {}): Promise<BerthStatus[]> {
  const [rows, open] = await Promise.all([
    getBerths(db, opts),
    db
      .select({
        id: reservations.id,
        berthId: reservations.berthId,
        kind: reservations.kind,
        title: reservations.title,
        startDate: reservations.startDate,
        endDate: reservations.endDate,
        vesselName: vessels.name,
        vesselPrefix: vessels.prefix,
      })
      .from(reservations)
      .leftJoin(vessels, eq(vessels.id, reservations.vesselId))
      .where(and(eq(reservations.status, "confirmed"), gte(reservations.endDate, today)))
      .orderBy(asc(reservations.startDate), asc(reservations.id)),
  ]);

  const byBerth = new Map<string, StayRef[]>();
  for (const r of open) {
    const stay: StayRef = { id: r.id, label: reservationLabel(r), kind: r.kind, startDate: r.startDate, endDate: r.endDate };
    const list = byBerth.get(r.berthId);
    if (list) list.push(stay);
    else byBerth.set(r.berthId, [stay]);
  }

  return rows.map((berth) => {
    const stays = byBerth.get(berth.id) ?? [];
    return {
      ...berth,
      // Every stay here ends today or later, so "started by today" is all it takes to cover today.
      current: stays.find((s) => s.startDate <= today) ?? null,
      next: stays.find((s) => s.startDate > today) ?? null,
      upcomingCount: stays.length,
    };
  });
}
