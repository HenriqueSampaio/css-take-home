import Link from "next/link";
import type { MonthReservation } from "@/lib/db/queries/reservations";
import { addDays, formatDate, monthBounds, weekdayIndex, type ISODate, type YearMonth } from "@/lib/domain/dates";
import { buildTimeline, type TimelineBar } from "@/lib/domain/timeline";
import { newReservationHref, scheduleHref } from "@/lib/ui/params";
import { ChevronLeft, ChevronRight, KIND_ICON, KIND_LABEL, NoteLines } from "./icons";
import { NowLineClock } from "./now-line";

type Berth = { id: string; name: string; lengthFt: number };

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const GRID_ID = "schedule-grid";

/**
 * The month: berths down the side, days across the top, stays as coloured chips. Rendered
 * on the server; every chip and every free day is a plain link, so the view is its URL.
 * Days before today are dimmed and cannot be booked; today carries the live now-line.
 */
export function ScheduleGrid({ month, berths, reservations, selectedId, newId, today, showCancelled }: { month: YearMonth; berths: Berth[]; reservations: MonthReservation[]; selectedId: string | null; newId: string | null; today: ISODate; showCancelled: boolean }) {
  const { start, days } = monthBounds(month);
  const rows = buildTimeline(month, berths.map((b) => b.id), reservations);
  const dayList = Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    const weekday = weekdayIndex(date);
    return { day: i + 1, date, weekday, isWeekend: weekday >= 5, isToday: date === today, isPast: date < today };
  });
  const todayDay = dayList.find((d) => d.isToday)?.day ?? null;

  return (
    <div className="overflow-x-auto rounded-[inherit]" tabIndex={0} role="region" aria-label="Berth schedule. Scrolls sideways on narrow screens.">
      {todayDay !== null && <NowLineClock targetId={GRID_ID} />}
      <div id={GRID_ID} className="schedule" style={{ ["--days" as string]: days, ["--today-d" as string]: todayDay ?? 0 }}>
        <div className="schedule-row border-b border-line">
          <div className="schedule-berth flex items-end px-4 pb-2.5 pt-3">
            <span className="t-small text-ink-3">Berth</span>
          </div>
          <div className="schedule-days" aria-hidden>
            {dayList.map((d) => (
              <div key={d.day} className={`flex flex-col items-center gap-0.5 pb-2 pt-2.5 ${d.isPast ? "opacity-50" : ""}`}>
                <span className={`t-micro ${d.isWeekend ? "text-ink-3" : "text-ink-2"}`}>{WEEKDAY_LETTERS[d.weekday]}</span>
                <span className={`t-num grid h-6 w-6 place-items-center rounded-full text-[0.8125rem] ${d.isToday ? "bg-brand font-bold text-surface" : "font-semibold text-ink"}`}>{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        {rows.map((row, rowIndex) => {
          const berth = berths[rowIndex];
          return (
            <div key={berth.id} role="group" aria-label={`${berth.name}, ${berth.lengthFt} feet`} className="schedule-row border-b border-line last:border-b-0">
              <div className="schedule-berth flex flex-col justify-center px-4 py-2.5">
                <span className="text-[0.9375rem] font-bold leading-tight [overflow-wrap:anywhere]">{berth.name}</span>
                <span className="t-small t-num text-ink-3">{berth.lengthFt} ft</span>
                <Link href={newReservationHref({ berthId: berth.id })} prefetch={false} className="sr-only focus:not-sr-only focus:mt-1 focus:text-[0.8125rem] focus:font-semibold focus:text-brand">
                  Reserve {berth.name}
                </Link>
              </div>

              <div className="schedule-lanes" style={{ gridTemplateRows: `repeat(${row.laneCount}, var(--lane-h))` }}>
                {dayList.map((d) =>
                  d.isPast ? (
                    <span key={d.day} aria-hidden className="day-cell is-past" style={{ ["--d" as string]: d.day }} />
                  ) : (
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
                  ),
                )}
                {todayDay !== null && <span aria-hidden className="now-line">{rowIndex === 0 && <span className="now-dot" />}</span>}
                {row.bars.length === 0 && <span className="sr-only">Nothing booked this month.</span>}
                <ol className="contents">
                  {[...row.bars].sort((a, b) => a.startDay - b.startDay || a.lane - b.lane).map((bar) => (
                    <StayChip key={bar.item.id} bar={bar} month={month} order={rowIndex * 2 + Math.floor(bar.startDay / 4)} selected={bar.item.id === selectedId} isNew={bar.item.id === newId} today={today} showCancelled={showCancelled} />
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

function StayChip({ bar, month, order, selected, isNew, today, showCancelled }: { bar: TimelineBar<MonthReservation>; month: YearMonth; order: number; selected: boolean; isNew: boolean; today: ISODate; showCancelled: boolean }) {
  const r = bar.item;
  const KindIcon = KIND_ICON[r.kind];
  const fill = r.status === "cancelled" ? "chip-cancelled" : r.kind === "vessel" ? "chip-vessel" : r.kind === "event" ? "chip-event" : "chip-closure";
  const ended = r.endDate < today;
  const spoken = [r.label, KIND_LABEL[r.kind].toLowerCase(), `${formatDate(r.startDate)} to ${formatDate(r.endDate)}`, r.status === "cancelled" ? "cancelled" : ended ? "ended" : null].filter(Boolean).join(", ");

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
        className={`stay ${fill} ${ended && r.status !== "cancelled" ? "chip-past" : ""} ${selected ? "is-selected" : ""} ${isNew ? "is-new" : ""} ${bar.continuesBefore ? "continues-before" : ""} ${bar.continuesAfter ? "continues-after" : ""}`}
        style={{ gridColumn: `${bar.startDay} / span ${bar.span}`, gridRow: bar.lane + 1, ["--i" as string]: Math.min(order, 12) }}
      >
        {bar.continuesBefore && <ChevronLeft size={12} className="-ml-1 shrink-0 opacity-80" />}
        {bar.span > 2 && <KindIcon size={14} className="shrink-0 opacity-90" />}
        <span className="stay-label">{r.label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {r.notes !== "" && bar.span > 3 && <NoteLines size={13} className="opacity-80" />}
          {bar.continuesAfter && <ChevronRight size={12} className="-mr-1 opacity-80" />}
        </span>
      </Link>
    </li>
  );
}
