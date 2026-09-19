import { compareDates, toEpochDay, type ISODate } from "./dates";

/**
 * A stay: both ends INCLUSIVE. The legacy grid is one cell per berth-day, so a
 * vessel leaving and another arriving on the same day at the same berth was
 * never representable. We keep that rule: a berth-day has one occupant.
 * This is the same semantics as Postgres `daterange(start, end, '[]')`.
 */
export type DateRange = { start: ISODate; end: ISODate };

export const isValidRange = (r: DateRange): boolean => compareDates(r.start, r.end) <= 0;

export const lengthInDays = (r: DateRange): number => toEpochDay(r.end) - toEpochDay(r.start) + 1;

/** Inclusive overlap: ranges that merely touch (a ends the day b starts) DO collide. */
export const overlaps = (a: DateRange, b: DateRange): boolean =>
  compareDates(a.start, b.end) <= 0 && compareDates(b.start, a.end) <= 0;

export const contains = (r: DateRange, date: ISODate): boolean =>
  compareDates(r.start, date) <= 0 && compareDates(date, r.end) <= 0;

/** The part of `r` inside `window`, or null when they don't meet. */
export function clip(r: DateRange, window: DateRange): DateRange | null {
  if (!overlaps(r, window)) return null;
  return {
    start: compareDates(r.start, window.start) >= 0 ? r.start : window.start,
    end: compareDates(r.end, window.end) <= 0 ? r.end : window.end,
  };
}

/**
 * All colliding pairs among items that share a key (the berth). O(n log n) per
 * key via a sweep over start-sorted items; used by the import audit and by the
 * seed validator that mirrors the database exclusion constraint.
 */
export function findOverlappingPairs<T extends DateRange>(items: readonly T[], keyOf: (item: T) => string): [T, T][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  const pairs: [T, T][] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => compareDates(a.start, b.start) || compareDates(a.end, b.end));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length && compareDates(sorted[j].start, sorted[i].end) <= 0; j++) {
        pairs.push([sorted[i], sorted[j]]);
      }
    }
  }
  return pairs;
}
