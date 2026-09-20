import type { Metadata } from "next";
import Link from "next/link";
import { AddBerthForm, BerthRowActions, RestoreBerthButton } from "@/components/berth-admin";
import { BerthScale } from "@/components/berth-scale";
import { ChevronDown, KIND_ICON } from "@/components/icons";
import { getBerthStatuses } from "@/lib/db/queries/berths";
import { formatDate, todayIn, yearMonthOf } from "@/lib/domain/dates";
import { requestDb } from "@/lib/ui/data";
import { scheduleHref } from "@/lib/ui/params";

export const metadata: Metadata = { title: "Berths" };

export default async function BerthsPage() {
  const today = todayIn();
  const all = await getBerthStatuses(await requestDb(), today, { includeRetired: true });
  const active = all.filter((b) => b.retiredAt === null);
  const retired = all.filter((b) => b.retiredAt !== null);
  const maxFt = Math.max(...active.map((b) => b.lengthFt), 1);

  return (
    <div className="mx-auto flex max-w-[64rem] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-headline">Berths</h1>
          <p className="mt-1.5 text-ink-2"><strong className="t-num">{active.length}</strong> berths. A vessel can only be booked where it fits, so <strong>length</strong> is what matters here.</p>
        </div>
      </div>

      <AddBerthForm />

      <ul className="sheet rows cascade overflow-hidden">
        {active.map((berth, i) => {
          const CurrentIcon = berth.current ? KIND_ICON[berth.current.kind] : null;
          return (
            <li key={berth.id} className="row-hover flex flex-col gap-3 px-5 py-4" style={{ ["--i" as string]: Math.min(i, 8) }}>
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-baseline gap-x-2.5">
                    <span className="t-title">{berth.name}</span>
                    <strong className="t-num text-[1.0625rem]">{berth.lengthFt} ft</strong>
                  </p>
                  {/* Lengths to one scale: 55 ft reads as a sliver beside 410 ft before a number is read. */}
                  <BerthScale lengthFt={berth.lengthFt} maxFt={maxFt} className="mt-2 max-w-sm" />
                </div>

                <div className="flex flex-col items-start gap-1 sm:items-end sm:text-right">
                  {berth.current && CurrentIcon ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-[0.875rem]">
                      <span className="tag tag-accent"><CurrentIcon size={12} />In use today</span>
                      <Link className="link" href={scheduleHref(yearMonthOf(today), berth.current.id)}>{berth.current.label}</Link>
                      <span className="text-ink-2">until <strong className="t-num">{formatDate(berth.current.endDate, "short")}</strong></span>
                    </p>
                  ) : (
                    <p><span className="tag tag-clear">Free today</span></p>
                  )}
                  {berth.next && (
                    <p className="t-data text-ink-2">Next: <Link className="link" href={scheduleHref(yearMonthOf(berth.next.startDate), berth.next.id)}>{berth.next.label}</Link> on <strong className="t-num">{formatDate(berth.next.startDate, "short")}</strong></p>
                  )}
                  {!berth.current && !berth.next && <p className="t-data text-ink-3">Nothing booked ahead</p>}
                </div>
              </div>
              <BerthRowActions key={`${berth.id}-${berth.version}`} berthId={berth.id} version={berth.version} name={berth.name} lengthFt={berth.lengthFt} canRetire={active.length > 1} />
            </li>
          );
        })}
      </ul>

      {retired.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[0.875rem] font-semibold text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown size={16} className="transition-transform duration-200 group-open:rotate-180" />
            {retired.length} retired {retired.length === 1 ? "berth" : "berths"}
          </summary>
          <ul className="sheet rows mt-2 overflow-hidden">
            {retired.map((berth) => (
              <li key={berth.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <p className="text-ink-2"><span className="font-semibold">{berth.name}</span> <span className="t-num">· {berth.lengthFt} ft</span></p>
                <RestoreBerthButton berthId={berth.id} version={berth.version} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
