import type { Metadata } from "next";
import Link from "next/link";
import { BerthOptions } from "@/components/berth-options";
import { BookBerthButton } from "@/components/book-berth-button";
import { ReservationForm, type StayDraft } from "@/components/reservation-form";
import { getBerths } from "@/lib/db/queries/berths";
import { getOccupancy } from "@/lib/db/queries/reservations";
import { getVesselOptions } from "@/lib/db/queries/vessels";
import { classifyBerths } from "@/lib/domain/availability";
import { formatDate } from "@/lib/domain/dates";
import { displayVesselName } from "@/lib/domain/names";
import { lengthInDays } from "@/lib/domain/ranges";
import type { CreateReservationInput } from "@/lib/services/reservations";
import { requestDb } from "@/lib/ui/data";
import { parseStayParams } from "@/lib/ui/stay-params";

export const metadata: Metadata = { title: "New reservation" };

export default async function NewReservationPage(props: PageProps<"/reservations/new">) {
  const stay = parseStayParams(await props.searchParams);
  const db = await requestDb();
  const [berths, vessels] = await Promise.all([getBerths(db), getVesselOptions(db)]);

  const vessel = stay.vesselId ? vessels.find((v) => v.id === stay.vesselId) ?? null : null;
  const isNewVessel = stay.kind === "vessel" && !vessel && stay.newVesselName !== null;
  const subject = stay.kind === "vessel" ? vessel?.displayName ?? (isNewVessel ? displayVesselName(stay.newVesselPrefix, stay.newVesselName!) : null) : stay.title;
  const range = stay.start && stay.end ? { start: stay.start, end: stay.end } : null;
  const ready = subject !== null && range !== null;

  // A typed length wins only when the registry has none to offer (the form only sends it then).
  const vesselLengthFt = stay.kind === "vessel" ? vessel?.lengthFt ?? stay.lengthFt : null;
  const options = ready ? classifyBerths(berths, await getOccupancy(db, range), { range, vesselLengthFt, requiresFit: stay.kind === "vessel" }) : null;
  const scaleFt = Math.max(...berths.map((b) => b.lengthFt), vesselLengthFt ?? 0);
  const days = range ? lengthInDays(range) : 0;
  const usable = options?.filter((o) => o.verdict === "available").length ?? 0;

  const initial: StayDraft = {
    kind: stay.kind,
    vesselId: vessel?.id ?? null,
    newVessel: isNewVessel,
    vesselName: stay.newVesselName ?? "",
    vesselPrefix: stay.newVesselPrefix ?? "",
    lengthFt: stay.lengthFt !== null ? String(stay.lengthFt) : "",
    title: stay.title ?? "",
    start: stay.start ?? "",
    end: stay.end ?? stay.start ?? "",
    notes: stay.notes,
    berthId: stay.berthId,
  };

  const inputFor = (berthId: string): CreateReservationInput => ({
    kind: stay.kind,
    berthId,
    startDate: range!.start,
    endDate: range!.end,
    vesselId: vessel?.id ?? null,
    newVessel: isNewVessel && stay.lengthFt !== null ? { name: stay.newVesselName!, prefix: stay.newVesselPrefix, lengthFt: stay.lengthFt } : null,
    vesselLengthFt: vessel && vessel.lengthFt === null ? stay.lengthFt : null,
    title: stay.kind === "vessel" ? null : stay.title,
    notes: stay.notes,
  });

  const picked = stay.berthId ? berths.find((b) => b.id === stay.berthId) ?? null : null;

  return (
    <div className="mx-auto flex max-w-[72rem] flex-col gap-6">
      <div>
        <p className="t-caption">New reservation</p>
        <h1 className="t-headline">Find a berth</h1>
        <p className="prose-measure mt-1 text-ink-2">
          Say what needs a berth and when. Every berth is then checked two ways: is it free on those days, and is the vessel short enough to fit.
          {picked && <> You started from <span className="font-semibold text-ink">{picked.name}</span> on the schedule; it is marked below.</>}
        </p>
      </div>

      <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-labelledby="stay-heading" className="sheet px-4 py-4">
          <h2 id="stay-heading" className="t-title mb-3">The stay</h2>
          <ReservationForm key={JSON.stringify(initial)} basePath="/reservations/new" vessels={vessels} initial={initial} />
        </section>

        <section aria-labelledby="berths-heading" aria-live="polite">
          <h2 id="berths-heading" className="t-title">Berths for this stay</h2>
          {options && range ? (
            <>
              <p className="mb-3 mt-1 text-ink-2">
                <span className="font-semibold text-ink">{subject}</span>, <span className="t-num">{formatDate(range.start)}{range.end !== range.start && <> to {formatDate(range.end)}</>}</span> ({days} {days === 1 ? "day" : "days"}).{" "}
                {usable === 0 ? <span className="font-semibold text-revision">No berth can take this stay as entered.</span> : <>{usable} of {options.length} berths can take it.</>}
              </p>
              <BerthOptions
                options={options}
                scaleFt={scaleFt}
                vesselLabel={stay.kind === "vessel" ? subject : null}
                pickedBerthId={stay.berthId}
                renderAction={(option, isFirstUsable) =>
                  option.verdict === "available" ? <BookBerthButton mode="create" input={inputFor(option.berth.id)} label={`Book ${option.berth.name}`} primary={isFirstUsable} /> : null
                }
              />
              {usable === 0 && <p className="prose-measure mt-3 text-ink-2">Try different dates, or open the <Link className="link" href="/schedule">schedule</Link> to see what is in the way.</p>}
            </>
          ) : (
            <div className="prose-measure mt-1 text-ink-2">
              <p>Fill in the stay and choose Find a berth. You will see all {berths.length} berths, each marked as one of:</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                <li><span className="tag tag-clear">Fits and free</span> ready to book.</li>
                <li><span className="tag tag-danger">Too short</span> the vessel is longer than the berth, with the overage in feet.</li>
                <li><span className="tag tag-danger">Occupied</span> a confirmed stay is already there, named with its dates.</li>
                <li><span className="tag tag-caution">Length needed</span> the vessel has no length on file yet.</li>
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
