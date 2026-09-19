import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "@/components/icons";
import { ReservationPanel } from "@/components/reservation-panel";
import { ScheduleGrid } from "@/components/schedule-grid";
import { ScheduleKey } from "@/components/schedule-key";
import { getBerths } from "@/lib/db/queries/berths";
import { getLiveStats } from "@/lib/db/queries/meta";
import { getDefaultMonth, getMonthReservations, getReservationDetail } from "@/lib/db/queries/reservations";
import { addMonths, formatDate, formatYearMonth, isYearMonth, todayIn, yearMonthOf } from "@/lib/domain/dates";
import { requestDb } from "@/lib/ui/data";
import { FIRST_MONTH, firstParam, lastAllowedMonth, newReservationHref, parseIdParam, parseMonthParam, scheduleHref } from "@/lib/ui/params";

export const metadata: Metadata = { title: "Schedule" };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function SchedulePage(props: PageProps<"/schedule">) {
  const sp = await props.searchParams;
  const today = todayIn();

  // The month jump is a plain GET form with two selects; fold it into the canonical ?m=.
  const jumped = `${firstParam(sp.y) ?? ""}-${firstParam(sp.mo) ?? ""}`;
  if (isYearMonth(jumped)) redirect(scheduleHref(parseMonthParam(jumped, today) ?? jumped));

  const db = await requestDb();
  const requested = parseMonthParam(sp.m, today);
  const month = requested ?? (await getDefaultMonth(db, today));
  const selectedId = parseIdParam(sp.r);
  const showCancelled = firstParam(sp.cancelled) === "1";

  const [berths, reservations, detail, stats] = await Promise.all([
    getBerths(db),
    getMonthReservations(db, month, { includeCancelled: showCancelled }),
    selectedId ? getReservationDetail(db, selectedId) : Promise.resolve(null),
    getLiveStats(db),
  ]);

  const maxBerthFt = Math.max(...berths.map((b) => b.lengthFt), 1);
  const live = reservations.filter((r) => r.status !== "cancelled");
  const needsReview = live.filter((r) => r.status === "needs_review").length;
  const tooLong = live.filter((r) => r.fit?.kind === "too_long").length;
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const thisMonth = yearMonthOf(today);
  const lastMonth = lastAllowedMonth(today);
  const [year, monthNumber] = month.split("-");
  const years = Array.from({ length: Number(lastMonth.slice(0, 4)) - 1997 + 1 }, (_, i) => 1997 + i);
  const archiveEnd = stats.lastReservationDate ? yearMonthOf(stats.lastReservationDate) : null;
  const showArchiveNote = (requested === null || live.length === 0) && stats.firstReservationDate !== null && stats.lastReservationDate !== null;

  return (
    <div className="mx-auto flex max-w-[120rem] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="t-caption">Schedule</p>
          <h1 className="t-headline">{formatYearMonth(month)}</h1>
          <p className="t-data mt-1 text-ink-2">
            {live.length} {live.length === 1 ? "stay" : "stays"}
            {needsReview > 0 && <> · <span className="font-semibold text-caution">{needsReview} need review</span></>}
            {tooLong > 0 && <> · <span className="font-semibold text-revision">{tooLong} too long for the berth</span></>}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <nav aria-label="Month" className="flex items-center gap-1">
            {month > FIRST_MONTH ? (
              <Link href={scheduleHref(prev, null, { showCancelled })} className="btn btn-secondary" aria-label={`Previous month, ${formatYearMonth(prev)}`}><ChevronLeft size={14} />Prev</Link>
            ) : (
              <span className="btn btn-secondary" aria-disabled="true"><ChevronLeft size={14} />Prev</span>
            )}
            {month < lastMonth ? (
              <Link href={scheduleHref(next, null, { showCancelled })} className="btn btn-secondary" aria-label={`Next month, ${formatYearMonth(next)}`}>Next<ChevronRight size={14} /></Link>
            ) : (
              <span className="btn btn-secondary" aria-disabled="true">Next<ChevronRight size={14} /></span>
            )}
            <Link href={scheduleHref(thisMonth, null, { showCancelled })} className="btn btn-secondary" aria-current={month === thisMonth ? "true" : undefined}>Today</Link>
          </nav>

          <form key={month} action="/schedule" method="get" className="flex items-end gap-1" aria-label="Jump to a month">
            <div>
              <label htmlFor="jump-month" className="t-caption field-label">Month</label>
              <select id="jump-month" name="mo" defaultValue={monthNumber} className="input !w-auto">
                {MONTH_NAMES.map((name, i) => <option key={name} value={String(i + 1).padStart(2, "0")}>{name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="jump-year" className="t-caption field-label">Year</label>
              <select id="jump-year" name="y" defaultValue={year} className="input !w-auto t-num">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-secondary">Go</button>
          </form>

          <Link href={newReservationHref()} className="btn btn-primary"><Plus size={14} />New reservation</Link>
        </div>
      </div>

      {showArchiveNote && (
        <div className="notice" role="note">
          <p>
            The imported archive covers {formatDate(stats.firstReservationDate!)} to {formatDate(stats.lastReservationDate!)}. Today is {formatDate(today)}
            {requested === null && month !== thisMonth ? <>, so this opens on the latest month with stays. </> : <>. </>}
            {archiveEnd && month !== archiveEnd && <><Link className="link" href={scheduleHref(archiveEnd)}>Go to {formatYearMonth(archiveEnd)}</Link>. </>}
            {month !== thisMonth && <><Link className="link" href={scheduleHref(thisMonth)}>Go to this month</Link>.</>}
          </p>
        </div>
      )}

      {/* The panel takes a column beside the sheet only when there is one to show, and only on very wide screens. */}
      <div className={`grid items-start gap-4 ${selectedId ? "2xl:grid-cols-[minmax(0,1fr)_26rem]" : ""}`}>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="sheet">
            <ScheduleGrid month={month} berths={berths} reservations={reservations} selectedId={selectedId} today={today} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <ScheduleKey />
            <Link href={scheduleHref(month, selectedId, { showCancelled: !showCancelled })} className="link shrink-0 text-[0.8125rem]" scroll={false}>
              {showCancelled ? "Hide cancelled stays" : "Show cancelled stays"}
            </Link>
          </div>
          {live.length === 0 && (
            <p className="prose-measure text-ink-2">
              Nothing is booked in {formatYearMonth(month)}. Pick an empty day on a berth to start a reservation there, or use New reservation to see which berths a vessel fits and which are free.
            </p>
          )}
        </div>

        {selectedId && detail && <ReservationPanel key={detail.id + detail.version} detail={detail} month={month} maxBerthFt={maxBerthFt} showCancelled={showCancelled} />}
        {selectedId && !detail && (
          <aside className="sheet px-4 py-4" role="alert">
            <h2 className="t-title">That reservation no longer exists</h2>
            <p className="mt-1 text-ink-2">The demo data may have been reset since this link was made.</p>
            <Link href={scheduleHref(month, null, { showCancelled })} className="btn btn-secondary mt-3" scroll={false}>Back to the schedule</Link>
          </aside>
        )}
      </div>
    </div>
  );
}
