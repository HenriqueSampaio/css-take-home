import Link from "next/link";
import type { MonthReservation } from "@/lib/db/queries/reservations";
import { addDays, formatDate, monthBounds, weekdayIndex, type ISODate, type YearMonth } from "@/lib/domain/dates";
import { describeFit } from "@/lib/domain/fit";
import { buildTimeline, type TimelineBar } from "@/lib/domain/timeline";
import { newReservationHref, scheduleHref } from "@/lib/ui/params";
import { BerthScale } from "./berth-scale";
import { ChevronLeft, ChevronRight, NoteDot, Overrun, Plus, TriangleMark } from "./icons";

type Berth = { id: string; name: string; lengthFt: number };

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * The month as a drawing sheet: days along the top border, berths down the side with
 * their lengths drawn to scale, stays as inked bars. Rendered entirely on the server;
 * every bar and every empty day is a plain link, so the view is its URL.
 */
export function ScheduleGrid({ month, berths, reservations, selectedId, today, showCancelled }: { month: YearMonth; berths: Berth[]; reservations: MonthReservation[]; selectedId: string | null; today: ISODate; showCancelled: boolean }) {
  const { start, days } = monthBounds(month);
  const rows = buildTimeline(month, berths.map((b) => b.id), reservations);
  const maxFt = Math.max(...berths.map((b) => b.lengthFt));
  const dayList = Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    const weekday = weekdayIndex(date);
    return { day: i + 1, date, weekday, isWeekend: weekday >= 5, isToday: date === today };
  });

  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Berth schedule, scrolls horizontally on narrow screens">
      <div className="schedule" style={{ ["--days" as string]: days }}>
        {/* Top border of the sheet: day references */}
        <div className="schedule-row border-b-[1.5px] border-ink">
          <div className="schedule-berth flex items-end px-3 pb-1.5 pt-2">
            <span className="t-caption">Berth and length</span>
          </div>
          <div className="schedule-days bg-sheet-sunk" aria-hidden>
            {dayList.map((d) => (
              <div key={d.day} className={`border-l border-line py-1 text-center first:border-l-0 ${d.isWeekend ? "bg-line/50" : ""}`}>
                <div className="t-caption !tracking-normal">{WEEKDAY_LETTERS[d.weekday]}</div>
                <div className={`t-data ${d.isToday ? "font-bold text-prussian" : "text-ink"}`}>{d.day}</div>
              </div>
            ))}
          </div>
        </div>

        {rows.map((row, index) => {
          const berth = berths[index];
          return (
            <div key={berth.id} role="group" className="schedule-row border-b border-line-strong last:border-b-0" aria-label={`${berth.name}, ${berth.lengthFt} feet`}>
              <div className="schedule-berth flex flex-col justify-center gap-1 px-3 py-2">
                <BerthScale name={berth.name} lengthFt={berth.lengthFt} maxFt={maxFt} />
                <Link href={newReservationHref({ berthId: berth.id })} className="berth-extra t-data inline-flex w-fit items-center gap-1 text-ink-2 transition-colors duration-150 hover:text-prussian hover:underline">
                  <Plus size={11} />Reserve this berth
                </Link>
              </div>

              <div className="schedule-lanes" style={{ gridTemplateRows: `repeat(${row.laneCount}, var(--lane-h))` }}>
                {dayList.map((d) => (
                  <Link
                    key={d.day}
                    href={newReservationHref({ berthId: berth.id, start: d.date, end: d.date })}
                    // A month view has ~200 links; prefetching each would mean ~200 database-backed renders.
                    prefetch={false}
                    tabIndex={-1}
                    aria-hidden
                    title={`Reserve ${berth.name} from ${formatDate(d.date)}`}
                    className={`day-cell ${d.isWeekend ? "is-weekend" : ""} ${d.isToday ? "is-today" : ""}`}
                    style={{ ["--d" as string]: d.day }}
                  />
                ))}
                {row.bars.length === 0 && <span className="sr-only">No reservations this month.</span>}
                <ol className="contents">
                  {[...row.bars].sort((a, b) => a.startDay - b.startDay || a.lane - b.lane).map((bar) => (
                    <StayBar key={bar.item.id} bar={bar} month={month} selected={bar.item.id === selectedId} showCancelled={showCancelled} />
                  ))}
                </ol>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StayBar({ bar, month, selected, showCancelled }: { bar: TimelineBar<MonthReservation>; month: YearMonth; selected: boolean; showCancelled: boolean }) {
  const r = bar.item;
  const fill = r.status === "cancelled" ? "fill-cancelled" : r.status === "needs_review" ? "fill-review" : r.kind === "vessel" ? "fill-vessel" : r.kind === "event" ? "fill-event" : "fill-closure";
  const tooLong = r.fit?.kind === "too_long";
  const onDark = fill === "fill-vessel";

  const spoken = [
    r.label,
    r.kind === "vessel" ? null : r.kind,
    `${formatDate(r.startDate)} to ${formatDate(r.endDate)}`,
    r.status === "needs_review" ? "needs review" : r.status,
    tooLong && r.fit ? describeFit(r.fit) : null,
    r.openIssueCount > 0 ? `${r.openIssueCount} open review ${r.openIssueCount === 1 ? "finding" : "findings"}` : null,
  ].filter(Boolean).join(", ");

  return (
    <li className="contents">
      <Link
        id={`stay-${r.id}`}
        href={scheduleHref(month, r.id, { showCancelled })}
        prefetch={false}
        scroll={false}
        aria-label={spoken}
        aria-current={selected ? "true" : undefined}
        title={`${r.label} · ${formatDate(r.startDate)} to ${formatDate(r.endDate)}`}
        className={`stay ${fill} ${selected ? "is-selected" : ""} ${bar.continuesBefore ? "continues-before" : ""} ${bar.continuesAfter ? "continues-after" : ""}`}
        style={{ gridColumn: `${bar.startDay} / span ${bar.span}`, gridRow: bar.lane + 1 }}
      >
        {bar.continuesBefore && <ChevronLeft size={11} className="shrink-0 opacity-80" />}
        {r.openIssueCount > 0 && <TriangleMark size={12} className={`shrink-0 ${fill === "fill-vessel" ? "text-sheet-raised" : "text-caution"}`} />}
        <span className="stay-label">{r.label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {r.notes !== "" && bar.span > 2 && <NoteDot size={7} className={onDark ? "text-sheet-raised/80" : "text-ink-2"} />}
          {tooLong && (
            <span className="flex h-4 w-4 items-center justify-center bg-sheet-raised text-revision" title="Vessel too long for this berth">
              <Overrun size={12} />
            </span>
          )}
          {bar.continuesAfter && <ChevronRight size={11} className="opacity-80" />}
        </span>
      </Link>
    </li>
  );
}
