import Link from "next/link";
import type { DockToday } from "@/lib/db/queries/reservations";
import { formatDate, toEpochDay, yearMonthOf } from "@/lib/domain/dates";
import { scheduleHref } from "@/lib/ui/params";

/** One line about right now. Bold numbers, nothing else. */
export function TodayStrip({ dock }: { dock: DockToday }) {
  const free = dock.berthsTotal - dock.berthsOccupied;
  const next = dock.nextArrival;
  const inDays = next ? toEpochDay(next.startDate) - toEpochDay(dock.today) : 0;
  return (
    <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.9375rem] text-ink-2">
      <span><strong className="t-num text-[1.0625rem]">{dock.berthsOccupied}</strong> of {dock.berthsTotal} berths in use today</span>
      <span><strong className="t-num text-[1.0625rem] text-clear">{free}</strong> free</span>
      {dock.arrivingToday.length > 0 && <span><strong className="t-num text-[1.0625rem]">{dock.arrivingToday.length}</strong> arriving today</span>}
      {dock.departingToday.length > 0 && <span><strong className="t-num text-[1.0625rem]">{dock.departingToday.length}</strong> leaving today</span>}
      {next && (
        <span>
          Next in: <Link className="link" href={scheduleHref(yearMonthOf(next.startDate), next.id)}>{next.label}</Link>{" "}
          {inDays === 1 ? "tomorrow" : <>on <strong>{formatDate(next.startDate, "short")}</strong></>}
        </span>
      )}
    </p>
  );
}
