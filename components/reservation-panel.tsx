import Link from "next/link";
import type { ReservationDetail } from "@/lib/db/queries/reservations";
import { formatDate, yearMonthOf, type YearMonth } from "@/lib/domain/dates";
import { lengthInDays } from "@/lib/domain/ranges";
import { scheduleHref, vesselsHref } from "@/lib/ui/params";
import { FitGauge } from "./fit-gauge";
import { Cross } from "./icons";
import { ReservationActions } from "./reservation-actions";
import { RevisionTriangle } from "./revision-triangle";
import { KindTag, LengthStatusTag, ReservationStatusTag, TooLongTag } from "./status-tags";

const ISSUE_TITLES: Record<string, string> = {
  overlap: "Double-booking in the legacy data",
  unlabelled: "No name on this booking in the workbook",
  calendar_defect: "The workbook's calendar is wrong here",
  ambiguous_extent: "Dates could not be read with certainty",
  length_conflict: "The registry lists two lengths",
};

/** The selected stay, as a detail drawn beside the sheet. Driven by `?r=` so it is a link, not a modal. */
export function ReservationPanel({ detail, month, maxBerthFt, showCancelled }: { detail: ReservationDetail; month: YearMonth; maxBerthFt: number; showCancelled: boolean }) {
  const days = lengthInDays({ start: detail.startDate, end: detail.endDate });
  const open = detail.issues.filter((i) => i.resolvedAt === null);
  const resolved = detail.issues.filter((i) => i.resolvedAt !== null);
  const closeHref = scheduleHref(month, null, { showCancelled });

  return (
    <aside className="sheet panel-in" aria-labelledby="panel-title">
      <div className="flex items-start justify-between gap-3 border-b border-line-strong bg-sheet-sunk px-4 py-3">
        <div className="min-w-0">
          <p className="t-caption">Reservation</p>
          <h2 id="panel-title" className="t-title truncate">{detail.label}</h2>
        </div>
        <Link href={closeHref} scroll={false} className="btn btn-secondary btn-sm shrink-0" aria-label="Close reservation details"><Cross size={12} />Close</Link>
      </div>

      <div className="grid gap-x-8 gap-y-5 px-4 py-4 md:grid-cols-2 2xl:grid-cols-1">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            <KindTag kind={detail.kind} />
            <ReservationStatusTag status={detail.status} />
            {detail.fit?.kind === "too_long" && <TooLongTag overByFt={detail.fit.overByFt} />}
          </div>

          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[0.9375rem]">
            <dt className="t-caption pt-1">Berth</dt>
            <dd>{detail.berth.name} <span className="t-num text-ink-2">({detail.berth.lengthFt} ft)</span></dd>
            <dt className="t-caption pt-1">Dates</dt>
            <dd className="t-num">
              {formatDate(detail.startDate, "long")}{detail.endDate !== detail.startDate && <> to {formatDate(detail.endDate, "long")}</>}
              <span className="text-ink-2"> · {days} {days === 1 ? "day" : "days"}</span>
            </dd>
            {detail.vessel && (
              <>
                <dt className="t-caption pt-1">Vessel</dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  <Link className="link" href={vesselsHref({ q: detail.vessel.name })}>{detail.vessel.displayName}</Link>
                  <span className="t-num text-ink-2">{detail.vessel.lengthFt !== null ? `${detail.vessel.lengthFt} ft` : "no length on file"}</span>
                  <LengthStatusTag status={detail.vessel.lengthStatus} />
                </dd>
              </>
            )}
            <dt className="t-caption pt-1">Source</dt>
            <dd className="text-ink-2">
              {detail.source === "legacy" ? (
                <>Imported from the workbook, cells <span className="t-data break-all text-ink">{detail.sourceRef}</span>{detail.rawLabel && detail.rawLabel !== detail.label ? <> (written as &ldquo;{detail.rawLabel}&rdquo;)</> : null}</>
              ) : (
                "Booked in this system"
              )}
            </dd>
            {detail.notes !== "" && (
              <>
                <dt className="t-caption pt-1">Notes</dt>
                <dd className="whitespace-pre-line">{detail.notes}</dd>
              </>
            )}
          </dl>

          {detail.fit && <FitGauge fit={detail.fit} berthFt={detail.berth.lengthFt} scaleFt={maxBerthFt} vesselLabel={detail.vessel?.displayName ?? "Vessel"} />}
        </div>

        <div className="flex flex-col gap-4">
          {open.length > 0 && (
            <section aria-labelledby="panel-findings">
              <h3 id="panel-findings" className="t-caption mb-2">Open review findings</h3>
              <ul className="flex flex-col gap-2.5">
                {open.map((issue, index) => (
                  <li key={issue.id} className="flex gap-2.5">
                    <RevisionTriangle count={index + 1} size={22} label={`Finding ${index + 1}`} />
                    <div className="min-w-0 text-[0.875rem]">
                      <p className="font-semibold">{ISSUE_TITLES[issue.type] ?? issue.type}</p>
                      <p className="text-ink-2">{issue.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail.overlaps.length > 0 && (
            <section aria-labelledby="panel-overlaps">
              <h3 id="panel-overlaps" className="t-caption mb-2">On this berth at the same time</h3>
              <ul className="flex flex-col gap-1.5 text-[0.875rem]">
                {detail.overlaps.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-1.5">
                    <Link className="link" scroll={false} href={scheduleHref(yearMonthOf(o.startDate) > month || yearMonthOf(o.endDate) < month ? yearMonthOf(o.startDate) : month, o.id, { showCancelled })}>{o.label}</Link>
                    <span className="t-num text-ink-2">{formatDate(o.startDate)} to {formatDate(o.endDate)}</span>
                    <ReservationStatusTag status={o.status} />
                  </li>
                ))}
              </ul>
              {detail.status === "needs_review" && detail.overlaps.some((o) => o.status === "confirmed") && (
                <p className="mt-2 text-[0.8125rem] text-ink-2">A confirmed stay is in the way, so this one cannot be confirmed as is. Edit its dates or berth, or cancel it.</p>
              )}
            </section>
          )}

          <ReservationActions id={detail.id} version={detail.version} status={detail.status} conflictHrefBase={scheduleHref(month, null, { showCancelled })} />

          {resolved.length > 0 && (
            <details className="text-[0.8125rem] text-ink-2">
              <summary className="cursor-pointer font-medium">{resolved.length} resolved {resolved.length === 1 ? "finding" : "findings"}</summary>
              <ul className="mt-1.5 list-disc pl-5">
                {resolved.map((issue) => <li key={issue.id}>{ISSUE_TITLES[issue.type] ?? issue.type}: {issue.detail} <span className="text-ink-3">({issue.resolution ?? "resolved"})</span></li>)}
              </ul>
            </details>
          )}
        </div>
      </div>
    </aside>
  );
}
