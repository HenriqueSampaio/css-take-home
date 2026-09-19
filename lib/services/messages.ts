/**
 * Every sentence a service can say, in one place, written for a dock
 * coordinator: name the berth, the vessel and the dates; no codes, no jargon.
 */
import { formatDate, parseISODate, type ISODate } from "../domain/dates";
import type { ConflictInfo, FitFailure } from "./result";

/** `Jul 9 to Jul 18, 2017`, `Dec 28, 2016 to Jan 3, 2017`, or `Jul 9, 2017` for a single day. */
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

export function cautionMessage(berthName: string, cautions: readonly ConflictInfo[]): string {
  const [first, ...rest] = cautions;
  const others = rest.length > 0 ? ` and ${rest.length} more` : "";
  return `Note: ${berthName} also has an unresolved entry from the old schedule for ${formatRange(first.startDate, first.endDate)} (${first.label}${others}). Review it so the berth is not double-booked.`;
}

export const tooLongMessage = (vesselName: string, berthName: string, fit: FitFailure): string =>
  `${vesselName} is ${fit.vesselFt} ft; ${berthName} is ${fit.berthFt} ft. It is ${fit.overByFt} ft too long for this berth.`;

export function lengthRequiredMessage(vesselName: string, candidates: readonly number[]): string {
  const distinct = [...new Set(candidates)].sort((a, b) => a - b);
  return distinct.length > 1
    ? `The old records disagree about the length of ${vesselName} (${distinct.map((ft) => `${ft} ft`).join(" or ")}). Enter the correct length so we can check it fits the berth.`
    : `There is no length on file for ${vesselName}. Enter its length in feet so we can check it fits the berth.`;
}

export const lengthOnFileMessage = (vesselName: string, onFileFt: number): string =>
  `${vesselName} already has ${onFileFt} ft on file, so that length was used. To correct it, update the vessel's length.`;

export const MESSAGES = {
  reservationGone: "This reservation no longer exists. The demo data may have been reset.",
  vesselGone: "This vessel no longer exists. The demo data may have been reset.",
  berthGone: "That berth does not exist. Pick one of the berths in the list.",
  reservationStale: "Someone else changed this reservation while you had it open. Reload to see the latest version, then make your change again.",
  vesselStale: "Someone else changed this vessel while you had it open. Reload to see the latest version, then make your change again.",
  editCancelled: "This reservation is cancelled, so it cannot be edited. Restore it first, then make your change.",
  fitUnknown: (vesselName: string): string => `There is no length on file for ${vesselName}, so we could not check that it fits this berth.`,
  cooldown: (seconds: number): string => `The demo data was reset a moment ago. Please wait ${plural(seconds, "second", "seconds")} before resetting again.`,
  vesselExists: (vesselName: string): string => `A vessel named ${vesselName} already exists.`,
} as const;
