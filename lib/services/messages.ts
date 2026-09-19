/**
 * Every sentence a service can say, in one place, written for a dock
 * coordinator: name the berth, the vessel, the dates and the feet; no codes, no jargon.
 */
import { formatDate, parseISODate, type ISODate } from "../domain/dates";
import type { ConflictInfo, FitFailure } from "./result";

/** `Jul 9 to Jul 18, 2027`, `Dec 28, 2026 to Jan 3, 2027`, or `Jul 9, 2027` for a single day. */
export function formatRange(start: ISODate, end: ISODate): string {
  if (start === end) return formatDate(start);
  const sameYear = parseISODate(start).year === parseISODate(end).year;
  return `${formatDate(start, sameYear ? "short" : "medium")} to ${formatDate(end)}`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function conflictMessage(berthName: string, conflicts: readonly ConflictInfo[]): string {
  const [first, ...rest] = conflicts;
  if (!first) return `${berthName} was just booked for overlapping dates by someone else. Pick different dates or another berth.`;
  const others = rest.length > 0 ? ` and ${plural(rest.length, "other booking", "other bookings")}` : "";
  return `${berthName} is taken ${formatRange(first.startDate, first.endDate)} by ${first.label}${others}.`;
}

export const tooLongMessage = (vesselName: string, berthName: string, fit: FitFailure): string =>
  `${vesselName} is ${fit.vesselFt} ft; ${berthName} is ${fit.berthFt} ft. It is ${fit.overByFt} ft too long for this berth.`;

export const lengthOnFileMessage = (vesselName: string, onFileFt: number): string =>
  `${vesselName} is already registered at ${onFileFt} ft, so that length was used. To correct it, edit the vessel.`;

const moveOrCancel = (stays: number): string => (stays === 1 ? "Move or cancel that stay first." : "Move or cancel them first.");

/** A vessel cannot be recorded as longer than a berth it is still booked on. `worst` is the stay that would be over by the most. */
export function vesselLengthBlockedMessage(vesselName: string, worst: ConflictInfo, fit: FitFailure, stays: number): string {
  const others = stays > 1 ? `, and ${plural(stays - 1, "other stay", "other stays")} would no longer fit either` : "";
  return `${vesselName} cannot be recorded as ${fit.vesselFt} ft. It is booked on ${worst.berthName} (${fit.berthFt} ft) ${formatRange(worst.startDate, worst.endDate)}, where it would be ${fit.overByFt} ft too long${others}. ${moveOrCancel(stays)}`;
}

/** The same guarantee from the other side: a berth cannot be shortened under a vessel that is still booked on it. */
export function berthShrinkBlockedMessage(berthName: string, worst: ConflictInfo, fit: FitFailure, stays: number): string {
  const others = stays > 1 ? `, and ${plural(stays - 1, "other stay", "other stays")} would no longer fit either` : "";
  return `${berthName} cannot be shortened to ${fit.berthFt} ft. ${worst.label} (${fit.vesselFt} ft) is booked there ${formatRange(worst.startDate, worst.endDate)} and would be ${fit.overByFt} ft too long${others}. ${moveOrCancel(stays)}`;
}

export function berthRetireBlockedMessage(berthName: string, stays: readonly ConflictInfo[]): string {
  const [first] = stays;
  const named = `${first.label}, ${formatRange(first.startDate, first.endDate)}`;
  return stays.length === 1
    ? `${berthName} still has a stay that has not ended: ${named}. Move or cancel it first.`
    : `${berthName} still has ${stays.length} stays that have not ended, starting with ${named}. Move or cancel them first.`;
}

export const MESSAGES = {
  reservationGone: "This reservation no longer exists. The demo data may have been reset.",
  vesselGone: "This vessel no longer exists. The demo data may have been reset.",
  berthGone: "That berth does not exist. Pick one of the berths in the list.",
  reservationStale: "Someone else changed this reservation while you had it open. Reload to see the latest version, then make your change again.",
  vesselStale: "Someone else changed this vessel while you had it open. Reload to see the latest version, then make your change again.",
  berthStale: "Someone else changed this berth while you had it open. Reload to see the latest version, then make your change again.",
  editCancelled: "This reservation is cancelled, so it cannot be edited. Restore it first, then make your change.",
  startInPast: (today: ISODate): string => `Reservations start today (${formatDate(today)}) or later.`,
  startLocked: (startedOn: ISODate, today: ISODate): string =>
    `This stay began on ${formatDate(startedOn)}. Keep that start date, or move it to today (${formatDate(today)}) or later.`,
  endInPast: (today: ISODate): string => `The end date must be today (${formatDate(today)}) or later.`,
  stayEnded: (endedOn: ISODate): string => `This stay ended on ${formatDate(endedOn)} and can no longer be changed.`,
  berthRetired: (berthName: string): string => `${berthName} has been retired and cannot be booked.`,
  restoreOnRetiredBerth: (berthName: string): string => `${berthName} has been retired, so this stay cannot be restored there. Restore the berth first, or make a new booking on another berth.`,
  lastActiveBerth: (berthName: string): string => `${berthName} is the only berth still in use, so it cannot be retired. Add another berth first.`,
  cooldown: (seconds: number): string => `The demo data was reset a moment ago. Please wait ${plural(seconds, "second", "seconds")} before resetting again.`,
  vesselExists: (name: string, displayName: string, lengthFt: number): string => `A vessel named ${name} is already registered (${displayName}, ${lengthFt} ft).`,
  berthExists: (berthName: string, retired: boolean): string =>
    retired ? `A berth named ${berthName} already exists (retired). Restore it instead of adding it again.` : `A berth named ${berthName} already exists.`,
} as const;
