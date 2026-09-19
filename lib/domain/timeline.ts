import { monthBounds, toEpochDay, type YearMonth } from "./dates";
import { clip, overlaps, type DateRange } from "./ranges";

/**
 * Lays reservations out on a month grid: one row per berth, one column per day.
 *
 * Confirmed reservations can never overlap (the database forbids it), so they
 * always share lane 0. Unresolved legacy reservations CAN collide; those are
 * pushed into extra lanes beneath, which makes a double-booking visible as a
 * stack instead of one bar hiding another.
 */
export type TimelineItem = DateRange & { id: string; berthId: string; status: "confirmed" | "needs_review" | "cancelled" };

export type TimelineBar<T> = {
  item: T;
  lane: number;
  /** 1-based day of month where the visible part starts. */
  startDay: number;
  /** Number of day columns covered within this month. */
  span: number;
  /** The stay began before / continues after this month. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export type TimelineRow<T> = { berthId: string; laneCount: number; bars: TimelineBar<T>[] };

const STATUS_ORDER: Record<TimelineItem["status"], number> = { confirmed: 0, needs_review: 1, cancelled: 2 };

export function buildTimeline<T extends TimelineItem>(month: YearMonth, berthIds: readonly string[], items: readonly T[]): TimelineRow<T>[] {
  const bounds = monthBounds(month);
  const window: DateRange = { start: bounds.start, end: bounds.end };
  const firstDay = toEpochDay(bounds.start);

  return berthIds.map((berthId) => {
    const ordered = items
      .filter((item) => item.berthId === berthId && overlaps(item, window))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.start.localeCompare(b.start) || a.id.localeCompare(b.id));

    const lanes: DateRange[][] = [];
    const bars: TimelineBar<T>[] = [];
    for (const item of ordered) {
      const visible = clip(item, window)!;
      let lane = lanes.findIndex((taken) => taken.every((other) => !overlaps(other, visible)));
      if (lane === -1) lane = lanes.push([]) - 1;
      lanes[lane].push(visible);
      bars.push({
        item,
        lane,
        startDay: toEpochDay(visible.start) - firstDay + 1,
        span: toEpochDay(visible.end) - toEpochDay(visible.start) + 1,
        continuesBefore: item.start < bounds.start,
        continuesAfter: item.end > bounds.end,
      });
    }
    return { berthId, laneCount: Math.max(1, lanes.length), bars };
  });
}
