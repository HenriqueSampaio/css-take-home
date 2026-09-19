import type { Metadata } from "next";
import Link from "next/link";
import { BerthResults } from "@/components/berth-results";
import { BookBerthButton } from "@/components/book-berth-button";
import { ReservationForm, type StayDraft } from "@/components/reservation-form";
import { getBerths } from "@/lib/db/queries/berths";
import { getOccupancy } from "@/lib/db/queries/reservations";
import { getVesselOptions } from "@/lib/db/queries/vessels";
import { classifyBerths } from "@/lib/domain/availability";
import { formatDate, todayIn } from "@/lib/domain/dates";
import { displayVesselName } from "@/lib/domain/names";
import { lengthInDays } from "@/lib/domain/ranges";
import type { CreateReservationInput } from "@/lib/services/reservations";
import { requestDb } from "@/lib/ui/data";
import { parseStayParams } from "@/lib/ui/stay-params";

export const metadata: Metadata = { title: "New reservation" };

export default async function NewReservationPage(props: PageProps<"/reservations/new">) {
  const stay = parseStayParams(await props.searchParams);
  const today = todayIn();
  const db = await requestDb();
  const [berths, vessels] = await Promise.all([getBerths(db), getVesselOptions(db)]);

  const vessel = stay.vesselId ? vessels.find((v) => v.id === stay.vesselId) ?? null : null;
  const isNewVessel = stay.kind === "vessel" && !vessel && stay.newVesselName !== null && stay.newVesselLengthFt !== null;
  const subject = stay.kind === "vessel" ? vessel?.displayName ?? (isNewVessel ? displayVesselName(stay.newVesselPrefix, stay.newVesselName!) : null) : stay.title;
  // Only a range that starts today or later can be booked; anything else just shows the form again.
  const range = stay.start && stay.end && stay.start >= today ? { start: stay.start, end: stay.end } : null;
  const ready = subject !== null && range !== null;

  const vesselLengthFt = stay.kind === "vessel" ? vessel?.lengthFt ?? stay.newVesselLengthFt : null;
  const options = ready ? classifyBerths(berths, await getOccupancy(db, range), { range, vesselLengthFt }) : null;
  const scaleFt = Math.max(...berths.map((b) => b.lengthFt), vesselLengthFt ?? 0);
  const days = range ? lengthInDays(range) : 0;
  const usable = options?.filter((o) => o.verdict === "available").length ?? 0;
  const picked = stay.berthId ? berths.find((b) => b.id === stay.berthId) ?? null : null;

  const initial: StayDraft = {
    kind: stay.kind,
    vesselId: vessel?.id ?? null,
    newVessel: stay.kind === "vessel" && !vessel && stay.newVesselName !== null,
    vesselName: stay.newVesselName ?? "",
    vesselPrefix: stay.newVesselPrefix ?? "",
    vesselLengthFt: stay.newVesselLengthFt !== null ? String(stay.newVesselLengthFt) : "",
    title: stay.title ?? "",
    start: stay.start && stay.start >= today ? stay.start : "",
    end: stay.end && stay.end >= today ? stay.end : stay.start && stay.start >= today ? stay.start : "",
    notes: stay.notes,
    berthId: stay.berthId,
  };

  const inputFor = (berthId: string): CreateReservationInput => ({
    kind: stay.kind,
    berthId,
    startDate: range!.start,
    endDate: range!.end,
    vesselId: vessel?.id ?? null,
    newVessel: isNewVessel ? { name: stay.newVesselName!, prefix: stay.newVesselPrefix, lengthFt: stay.newVesselLengthFt! } : null,
    title: stay.kind === "vessel" ? null : stay.title,
    notes: stay.notes,
  });

  return (
    <div className="mx-auto flex max-w-[64rem] flex-col gap-6">
      <div>
        <h1 className="t-display">Find a berth</h1>
        <p className="mt-1.5 text-ink-2">
          Say what needs a berth and when. {picked ? <>You started from <strong>{picked.name}</strong>.</> : "Every berth is checked for you."}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-8">
        <section aria-label="The stay" className="surface p-5 lg:sticky lg:top-24">
          <ReservationForm key={JSON.stringify(initial)} basePath="/reservations/new" vessels={vessels} initial={initial} today={today} hasResults={options !== null} />
        </section>

        <section aria-labelledby="results-heading" className="min-w-0">
          {options && range ? (
            <div className="flex flex-col gap-4">
              <div role="status">
                <h2 id="results-heading" className="t-heading">
                  {usable === 0 ? <span className="text-danger-ink">No berth can take this stay</span> : <>{usable} of {options.length} berths can take it</>}
                </h2>
                <p className="mt-1 text-ink-2">
                  <strong>{subject}</strong>, <strong className="t-num">{formatDate(range.start)}</strong>{range.end !== range.start && <> to <strong className="t-num">{formatDate(range.end)}</strong></>} ({days} {days === 1 ? "day" : "days"})
                </p>
              </div>
              <BerthResults
                options={options}
                scaleFt={scaleFt}
                pickedBerthId={stay.berthId}
                renderAction={(option, isBest) => (option.verdict === "available" ? <BookBerthButton mode="create" input={inputFor(option.berth.id)} label="Book this berth" primary={isBest} /> : null)}
              />
              {usable === 0 && <p className="text-ink-2">Try different dates, or open the <Link className="link" href="/schedule">schedule</Link> to see what is in the way.</p>}
            </div>
          ) : (
            <div className="surface flex flex-col gap-3 p-6 text-ink-2">
              <h2 id="results-heading" className="t-heading text-ink">Berths will appear here</h2>
              <p className="measure">Fill in the stay and choose <strong>Find a berth</strong>. Each berth is checked two ways: is it <strong>free</strong> on those days, and is the vessel <strong>short enough</strong> to fit. You book with one click from the ones that pass.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
