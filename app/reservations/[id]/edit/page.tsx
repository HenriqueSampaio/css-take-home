import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BerthResults } from "@/components/berth-results";
import { BookBerthButton } from "@/components/book-berth-button";
import { ChevronLeft } from "@/components/icons";
import { ReservationForm, type StayDraft } from "@/components/reservation-form";
import { getBerths } from "@/lib/db/queries/berths";
import { getOccupancy, getReservationDetail } from "@/lib/db/queries/reservations";
import { classifyBerths } from "@/lib/domain/availability";
import { formatDate, todayIn, yearMonthOf } from "@/lib/domain/dates";
import type { UpdateReservationInput } from "@/lib/services/reservations";
import { requestDb } from "@/lib/ui/data";
import { editReservationHref, parseIdParam, scheduleHref } from "@/lib/ui/params";
import { parseStayParams } from "@/lib/ui/stay-params";

export const metadata: Metadata = { title: "Edit reservation" };

export default async function EditReservationPage(props: PageProps<"/reservations/[id]/edit">) {
  const id = parseIdParam((await props.params).id);
  if (!id) notFound();
  const sp = await props.searchParams;
  const today = todayIn();
  const db = await requestDb();
  const [detail, berths] = await Promise.all([getReservationDetail(db, id), getBerths(db)]);
  if (!detail) notFound();

  const backHref = scheduleHref(yearMonthOf(detail.startDate < today ? today : detail.startDate), detail.id);
  const locked = detail.status === "cancelled" ? "This reservation is cancelled. Restore it from the schedule before editing it." : detail.endDate < today ? `This stay ended on ${formatDate(detail.endDate)}, so it can no longer be changed.` : null;
  if (locked) {
    return (
      <div className="mx-auto max-w-[64rem]">
        <h1 className="t-display">{detail.label}</h1>
        <p className="mt-2 text-ink-2">{locked}</p>
        <Link href={backHref} className="btn btn-secondary mt-5"><ChevronLeft size={16} />Back to the schedule</Link>
      </div>
    );
  }

  const started = detail.startDate < today;
  const edits = parseStayParams(sp);
  const submitted = edits.start !== null || (started && edits.end !== null);
  const start = started ? detail.startDate : edits.start && edits.start >= today ? edits.start : detail.startDate;
  const end = submitted && edits.end && edits.end >= today && edits.end >= start ? edits.end : detail.endDate < start ? start : detail.endDate;
  const range = { start, end };
  const title = detail.kind === "vessel" ? null : submitted ? edits.title ?? detail.title : detail.title;
  // Only a real submission may replace the saved notes; a mangled URL must not blank them.
  const notes = submitted ? edits.notes : detail.notes;
  const vesselLengthFt = detail.vessel?.lengthFt ?? null;

  const options = classifyBerths(berths, await getOccupancy(db, range), { range, vesselLengthFt, excludeReservationId: detail.id });
  const scaleFt = Math.max(...berths.map((b) => b.lengthFt), vesselLengthFt ?? 0);
  const changed = start !== detail.startDate || end !== detail.endDate;

  const initial: StayDraft = { kind: detail.kind, vesselId: detail.vessel?.id ?? null, newVessel: false, vesselName: "", vesselPrefix: "", vesselLengthFt: "", title: title ?? "", start, end, notes, berthId: detail.berth.id };
  const inputFor = (berthId: string): UpdateReservationInput => ({ id: detail.id, version: detail.version, berthId, startDate: start, endDate: end, title: detail.kind === "vessel" ? undefined : title, notes });

  return (
    <div className="mx-auto flex max-w-[64rem] flex-col gap-6">
      <div>
        <Link href={backHref} className="link inline-flex items-center gap-1 text-[0.875rem]"><ChevronLeft size={14} />Back to the schedule</Link>
        <h1 className="t-display mt-2">Edit {detail.label}</h1>
        <p className="mt-1.5 text-ink-2">Now at <strong>{detail.berth.name}</strong>, <strong className="t-num">{formatDate(detail.startDate)}</strong> to <strong className="t-num">{formatDate(detail.endDate)}</strong>.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-8">
        <section aria-label="Dates and details" className="surface p-5 lg:sticky lg:top-24">
          <ReservationForm key={JSON.stringify(initial)} basePath={editReservationHref(detail.id)} vessels={[]} initial={initial} today={today} fixedSubject={detail.label} lockStart={started} hasResults />
        </section>

        <section aria-labelledby="results-heading" className="flex min-w-0 flex-col gap-4">
          <div role="status">
            <h2 id="results-heading" className="t-heading">Choose where to save it</h2>
            <p className="mt-1 text-ink-2">
              <strong className="t-num">{formatDate(start)}</strong>{end !== start && <> to <strong className="t-num">{formatDate(end)}</strong></>}
              {changed && <span className="pill pill-warn ml-2">New dates, not saved yet</span>}
            </p>
          </div>
          <BerthResults
            options={options}
            scaleFt={scaleFt}
            pickedBerthId={detail.berth.id}
            renderAction={(option, isBest) =>
              option.verdict === "available" ? <BookBerthButton mode="update" input={inputFor(option.berth.id)} label={option.berth.id === detail.berth.id ? "Save here" : "Move here"} primary={isBest} /> : null
            }
          />
        </section>
      </div>
    </div>
  );
}
