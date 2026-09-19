import { toEpochDay, type ISODate } from "./dates";
import type { DateRange } from "./ranges";

/**
 * Where a stay sits relative to today. The system only books from today onwards, so
 * this is also what decides whether a stay can still be changed: a completed stay is history.
 */
export type StayPhase =
  | { kind: "upcoming"; startsInDays: number }
  | { kind: "in_port"; day: number; of: number; endsInDays: number }
  | { kind: "completed"; endedDaysAgo: number };

export function stayPhase(range: DateRange, today: ISODate): StayPhase {
  const start = toEpochDay(range.start);
  const end = toEpochDay(range.end);
  const now = toEpochDay(today);
  if (now < start) return { kind: "upcoming", startsInDays: start - now };
  if (now > end) return { kind: "completed", endedDaysAgo: now - end };
  return { kind: "in_port", day: now - start + 1, of: end - start + 1, endsInDays: end - now };
}

export const isCompleted = (range: DateRange, today: ISODate): boolean => range.end < today;

export function describePhase(phase: StayPhase): string {
  switch (phase.kind) {
    case "upcoming":
      return phase.startsInDays === 1 ? "Starts tomorrow" : `Starts in ${phase.startsInDays} days`;
    case "in_port":
      return phase.of === 1 ? "Here today" : `Here now, day ${phase.day} of ${phase.of}`;
    case "completed":
      return phase.endedDaysAgo === 1 ? "Ended yesterday" : `Ended ${phase.endedDaysAgo} days ago`;
  }
}
