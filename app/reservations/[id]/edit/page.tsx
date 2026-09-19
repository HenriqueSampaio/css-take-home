import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BerthOptions } from "@/components/berth-options";
import { BookBerthButton } from "@/components/book-berth-button";
import { ReservationForm, type StayDraft } from "@/components/reservation-form";
import { ReservationStatusTag } from "@/components/status-tags";
import { getBerths } from "@/lib/db/queries/berths";
import { getOccupancy, getReservationDetail } from "@/lib/db/queries/reservations";
import { classifyBerths } from "@/lib/domain/availability";
import { formatDate, yearMonthOf } from "@/lib/domain/dates";
import type { UpdateReservationInput } from "@/lib/services/reservations";
import { requestDb } from "@/lib/ui/data";
import { editReservationHref, parseIdParam, scheduleHref } from "@/lib/ui/params";
import { parseStayParams } from "@/lib/ui/stay-params";

export const metadata: Metadata = { title: "Edit reservation" };

export default async function EditReservationPage(props: PageProps<"/reservations/[id]/edit">) {
  const id = parseIdParam((await props.params).id);
  if (!id) notFound();
  const sp = await props.searchParams;
  const db = await requestDb();
  const [detail, berths] = await Promise.all([getReservationDetail(db, id), getBerths(db)]);
  if (!detail) notFound();

  const backHref = scheduleHref(yearMonthOf(detail.startDate), detail.id);
  if (detail.status === "cancelled") {
    return (
      <div className="mx-auto max-w-[72rem]">
        <h1 className="t-headline">{detail.label}</h1>
        <p className="mt-2 text-ink-2">This reservation is cancelled. Restore it from the schedule before editing it.</p>
        <Link href={backHref} className="btn btn-secondary mt-4">Back to the schedule</Link>
      </div>
    );
  }

  const edits = parseStayParams(sp);
  const start = edits.start ?? detail.startDate;
  const end = edits.start ? edits.end ?? edits.start : detail.endDate;
  const range = { start, end };
  const title = detail.kind === "vessel" ? null : edits.title ?? detail.title;
  const notes = sp.start !== undefined ? edits.notes : detail.notes;
  const vesselLengthFt = detail.kind === "vessel" ? detail.vessel?.lengthFt ?? edits.lengthFt : null;

  const occupancy = await getOccupancy(db, range);
  const options = classifyBerths(berths, occupancy, { range, vesselLengthFt, requiresFit: detail.kind === "vessel", excludeReservationId: detail.id });
  const scaleFt = Math.max(...berths.map((b) => b.lengthFt), vesselLengthFt ?? 0);
  const changedDates = start !== detail.startDate || end !== detail.endDate;

  const initial: StayDraft = {
    kind: detail.kind,
    vesselId: detail.vessel?.id ?? null,
    newVessel: false,
    vesselName: "",
    vesselPrefix: "",
    lengthFt: edits.lengthFt !== null ? String(edits.lengthFt) : "",
    title: title ?? "",
    start,
    end,
    notes,
    berthId: detail.berth.id,
  };

  const inputFor = (berthId: string): UpdateReservationInput => ({
    id: detail.id,
    version: detail.version,
    berthId,
    startDate: start,
    endDate: end,
    title: detail.kind === "vessel" ? undefined : title,
    notes,
    vesselLengthFt: detail.vessel && detail.vessel.lengthFt === null ? edits.lengthFt : null,
  });

  const vesselOption = detail.vessel ? [{ id: detail.vessel.id, displayName: detail.vessel.displayName, name: detail.vessel.name, prefix: detail.vessel.prefix, lengthFt: detail.vessel.lengthFt, lengthStatus: detail.vessel.lengthStatus }] : [];

  return (
    <div className="mx-auto flex max-w-[72rem] flex-col gap-6">
      <div>
        <p className="t-caption">Edit reservation</p>
        <h1 className="t-headline">{detail.label}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-ink-2">
          <ReservationStatusTag status={detail.status} />
          <span>Currently {detail.berth.name}, <span className="t-num">{formatDate(detail.startDate)} to {formatDate(detail.endDate)}</span>.</span>
          <Link className="link" href={backHref}>Back to the schedule</Link>
        </p>
        {detail.status === "needs_review" && <p className="prose-measure mt-2 text-ink-2">Saving confirms this stay and closes its review findings. It can only be saved where no confirmed stay is in the way.</p>}
      </div>

      <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-labelledby="stay-heading" className="sheet px-4 py-4">
          <h2 id="stay-heading" className="t-title mb-3">Dates and details</h2>
          <ReservationForm key={JSON.stringify(initial)} basePath={editReservationHref(detail.id)} vessels={vesselOption} initial={initial} fixedSubject={detail.label} />
        </section>

        <section aria-labelledby="berths-heading" aria-live="polite">
          <h2 id="berths-heading" className="t-title">Where it can go</h2>
          <p className="mb-3 mt-1 text-ink-2">
            <span className="t-num">{formatDate(start)}{end !== start && <> to {formatDate(end)}</>}</span>
            {changedDates ? " (new dates, not saved yet)." : "."} Choose a berth to save.
          </p>
          <BerthOptions
            options={options}
            scaleFt={scaleFt}
            vesselLabel={detail.vessel?.displayName ?? null}
            pickedBerthId={detail.berth.id}
            renderAction={(option, isFirstUsable) => {
              const current = option.berth.id === detail.berth.id;
              const label = `${detail.status === "needs_review" ? "Save and confirm" : "Save"} on ${option.berth.name}`;
              if (option.verdict === "available") return <BookBerthButton mode="update" input={inputFor(option.berth.id)} label={label} primary={isFirstUsable} />;
              // A legacy stay may keep a berth it never fitted: fixing its dates must not require fixing history first.
              if (option.verdict === "too_short" && current && detail.source === "legacy" && option.conflicts.length === 0) {
                return <BookBerthButton mode="update" input={inputFor(option.berth.id)} label={`Keep on ${option.berth.name} (known misfit)`} />;
              }
              return null;
            }}
          />
        </section>
      </div>
    </div>
  );
}
