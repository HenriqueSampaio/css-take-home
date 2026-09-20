import type { Metadata } from "next";
import Link from "next/link";
import { FlashCleaner } from "@/components/flash-cleaner";
import { ChevronLeft, ChevronRight, KIND_ICON, KIND_LABEL } from "@/components/icons";
import { MonthSlide } from "@/components/month-slide";
import { ReservationDrawer } from "@/components/reservation-drawer";
import { ScheduleGrid } from "@/components/schedule-grid";
import { Toast } from "@/components/toast";
import { TodayStrip } from "@/components/today-strip";
import { getBerths } from "@/lib/db/queries/berths";
import { getDockToday, getFirstMonth, getMonthReservations, getReservationDetail } from "@/lib/db/queries/reservations";
import { addMonths, formatYearMonth, todayIn, yearMonthOf } from "@/lib/domain/dates";
import { requestDb } from "@/lib/ui/data";
import { firstParam, lastAllowedMonth, newReservationHref, parseIdParam, parseMonthParam, scheduleHref } from "@/lib/ui/params";

/** The month belongs in the tab title: a coordinator often has two months open side by side. */
export async function generateMetadata(props: PageProps<"/schedule">): Promise<Metadata> {
  const m = firstParam((await props.searchParams).m);
  return { title: m && /^\d{4}-\d{2}$/.test(m) ? `${formatYearMonth(m)} schedule` : "Schedule" };
}

const LEGEND = ["vessel", "event", "closure"] as const;
const LEGEND_CHIP = { vessel: "fill-vessel", event: "fill-event", closure: "fill-closure" } as const;

export default async function SchedulePage(props: PageProps<"/schedule">) {
  const sp = await props.searchParams;
  const today = todayIn();
  const thisMonth = yearMonthOf(today);
  const db = await requestDb();

  const firstMonth = await getFirstMonth(db, today);
  const lastMonth = lastAllowedMonth(today);
  const month = parseMonthParam(sp.m, firstMonth, lastMonth) ?? thisMonth;
  const selectedId = parseIdParam(sp.r);
  const showCancelled = firstParam(sp.cancelled) === "1";
  const flash = firstParam(sp.flash);

  const [berths, reservations, detail, dock] = await Promise.all([
    getBerths(db),
    getMonthReservations(db, month, { includeCancelled: showCancelled }),
    selectedId ? getReservationDetail(db, selectedId) : Promise.resolve(null),
    getDockToday(db, today),
  ]);

  const live = reservations.filter((r) => r.status === "confirmed");
  const maxBerthFt = Math.max(...berths.map((b) => b.lengthFt), 1);
  const [year, monthNumber] = [month.slice(0, 4), Number(month.slice(5, 7))];
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(Number(year), monthNumber - 1, 1)));
  const canGoBack = month > firstMonth;
  const canGoForward = month < lastMonth;

  return (
    // On a wide screen the page makes room for the drawer, so the stay you picked is never hidden behind it.
    <div className={`flex flex-col gap-5 ${selectedId && detail ? "lg:pr-[27.5rem]" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="t-headline"><span className="sr-only">Schedule for </span>{monthName} <span className="font-medium text-ink-3">{year}</span></h1>
            <nav aria-label="Change month" className="flex items-center gap-1">
              {canGoBack ? (
                <Link href={scheduleHref(addMonths(month, -1), null, { showCancelled })} scroll={false} className="btn btn-secondary btn-icon btn-sm" aria-label={`Previous month, ${formatYearMonth(addMonths(month, -1))}`}><ChevronLeft /></Link>
              ) : (
                <span className="btn btn-secondary btn-icon btn-sm" aria-disabled="true" title="The schedule starts here"><ChevronLeft /></span>
              )}
              {canGoForward ? (
                <Link href={scheduleHref(addMonths(month, 1), null, { showCancelled })} scroll={false} className="btn btn-secondary btn-icon btn-sm" aria-label={`Next month, ${formatYearMonth(addMonths(month, 1))}`}><ChevronRight /></Link>
              ) : (
                <span className="btn btn-secondary btn-icon btn-sm" aria-disabled="true"><ChevronRight /></span>
              )}
              {month !== thisMonth && <Link href={scheduleHref(thisMonth, null, { showCancelled })} scroll={false} className="btn btn-ghost btn-sm">Today</Link>}
            </nav>
          </div>
          <TodayStrip dock={dock} />
        </div>

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.8125rem] font-medium text-ink-2" aria-label="Colour key">
          {LEGEND.map((kind) => {
            const KindIcon = KIND_ICON[kind];
            return (
              <li key={kind} className="flex items-center gap-1.5">
                <span aria-hidden className={`grid h-5 w-7 place-items-center ${LEGEND_CHIP[kind]}`}><KindIcon size={12} /></span>
                {KIND_LABEL[kind]}
              </li>
            );
          })}
        </ul>
      </div>

      <MonthSlide month={month}>
        <div className="sheet overflow-hidden">
          <ScheduleGrid month={month} berths={berths} reservations={reservations} selectedId={selectedId} newId={flash ? selectedId : null} today={today} showCancelled={showCancelled} />
        </div>
      </MonthSlide>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[0.875rem] text-ink-2">
        {live.length === 0 ? (
          <p className="prose-measure">
            <strong>Nothing is booked in {formatYearMonth(month)} yet.</strong> Click any free day on a berth to start a reservation there, or{" "}
            <Link className="link" href={newReservationHref()}>find a berth</Link> for a vessel and dates.
          </p>
        ) : (
          <p><strong className="t-num">{live.length}</strong> {live.length === 1 ? "reservation" : "reservations"} this month. Click a free day to add one.</p>
        )}
        <Link href={scheduleHref(month, selectedId, { showCancelled: !showCancelled })} scroll={false} className="link">{showCancelled ? "Hide cancelled" : "Show cancelled"}</Link>
      </div>

      {selectedId && detail && <ReservationDrawer detail={detail} month={month} today={today} maxBerthFt={maxBerthFt} showCancelled={showCancelled} />}
      {selectedId && !detail && (
        <div className="notice notice-caution prose-measure" role="alert">
          <p><strong>That reservation no longer exists.</strong> The demo data may have been reset. <Link className="link" href={scheduleHref(month)}>Back to the schedule</Link></p>
        </div>
      )}

      {flash && <FlashCleaner />}
      {flash === "booked" && detail && <Toast>Booked <span className="font-bold">{detail.label}</span> on {detail.berth.name}</Toast>}
      {flash === "saved" && detail && <Toast>Saved <span className="font-bold">{detail.label}</span></Toast>}

    </div>
  );
}
