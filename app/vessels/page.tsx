import type { Metadata } from "next";
import Link from "next/link";
import { SetLengthForm } from "@/components/set-length-form";
import { LengthStatusTag } from "@/components/status-tags";
import { getVessels } from "@/lib/db/queries/vessels";
import type { LengthStatus } from "@/lib/domain/fit";
import { requestDb } from "@/lib/ui/data";
import { firstParam, vesselsHref } from "@/lib/ui/params";

export const metadata: Metadata = { title: "Vessels" };

const STATUSES: { value: LengthStatus; label: string; blurb: string }[] = [
  { value: "verified", label: "Verified", blurb: "An exact registry match, or entered here." },
  { value: "probable", label: "Probable", blurb: "Same name in the registry under a different type prefix. Used for the fit check; worth confirming." },
  { value: "conflict", label: "Conflicting", blurb: "The registry gives two lengths. Not used until one is chosen." },
  { value: "unknown", label: "Unknown", blurb: "No length anywhere in the workbook. Must be entered before the vessel can be booked." },
];
const PAGE = 100;

export default async function VesselsPage(props: PageProps<"/vessels">) {
  const sp = await props.searchParams;
  const q = firstParam(sp.q)?.trim().slice(0, 80) ?? "";
  const statusRaw = firstParam(sp.status);
  const status = STATUSES.find((s) => s.value === statusRaw)?.value;
  const db = await requestDb();
  const all = await getVessels(db, { q: q || undefined, status });
  // Busiest first: a length entered for a busy vessel re-scores the most history.
  const vessels = [...all].sort((a, b) => b.bookingCount - a.bookingCount || a.name.localeCompare(b.name));
  const shown = vessels.slice(0, PAGE);

  return (
    <div className="mx-auto flex max-w-[72rem] flex-col gap-5">
      <div>
        <h1 className="t-headline">Vessels and their lengths</h1>
        <p className="prose-measure mt-1 text-ink-2">
          A vessel&apos;s length decides where it can berth. Lengths came from the workbook&apos;s Science and Yachts lists, which cover only part of the fleet, so each length carries a status. Entering a length here saves it as verified and immediately re-checks every stay that vessel has ever had.
        </p>
      </div>

      <form action="/vessels" method="get" className="flex flex-wrap items-end gap-2" role="search">
        <div>
          <label htmlFor="vessel-q" className="t-caption field-label">Name</label>
          <input id="vessel-q" name="q" defaultValue={q} className="input !w-64" placeholder="e.g. Long Ketch" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="vessel-status" className="t-caption field-label">Length status</label>
          <select id="vessel-status" name="status" defaultValue={status ?? ""} className="input !w-44">
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary">Filter</button>
        {(q || status) && <Link href="/vessels" className="link pb-2 text-[0.875rem]">Clear</Link>}
      </form>

      <div className="sheet overflow-x-auto">
        <table className="table">
          <caption className="sr-only">Vessels, busiest first</caption>
          <thead>
            <tr>
              <th scope="col" className="t-caption">Vessel</th>
              <th scope="col" className="t-caption num">Length</th>
              <th scope="col" className="t-caption">Status</th>
              <th scope="col" className="t-caption num">Stays</th>
              <th scope="col" className="t-caption num">Too long</th>
              <th scope="col" className="t-caption">Record a length</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id}>
                <th scope="row" className="text-left">
                  {v.displayName}
                  {v.lengthEvidence && <span className="mt-0.5 block text-[0.8125rem] font-normal text-ink-2">{v.lengthEvidence}</span>}
                </th>
                <td className="num t-num whitespace-nowrap">{v.lengthFt !== null ? `${v.lengthFt} ft` : v.lengthCandidates.length > 1 ? `${v.lengthCandidates.join(" or ")} ft` : <span className="text-ink-3">none</span>}</td>
                <td><LengthStatusTag status={v.lengthStatus} /></td>
                <td className="num t-num">{v.bookingCount}</td>
                <td className="num t-num">{v.misfitCount > 0 ? <span className="font-semibold text-revision">{v.misfitCount}</span> : <span className="text-ink-3">0</span>}</td>
                <td><SetLengthForm key={v.id} vesselId={v.id} version={v.version} name={v.displayName} current={v.lengthFt} candidates={v.lengthStatus === "conflict" ? v.lengthCandidates : []} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-4 py-6 text-ink-2">No vessel matches. <Link href={vesselsHref()} className="link">Show all vessels</Link>, or add a new one while making a <Link href="/reservations/new" className="link">new reservation</Link>.</p>}
      </div>
      {vessels.length > PAGE && <p className="text-ink-2">Showing the {PAGE} busiest of {vessels.length}. Filter by name or status to narrow the list.</p>}

      <section aria-labelledby="status-key">
        <h2 id="status-key" className="mb-2 text-[0.875rem] font-semibold">What each length status means</h2>
        <dl className="grid gap-x-8 gap-y-2 text-[0.875rem] sm:grid-cols-2">
          {STATUSES.map((s) => (
            <div key={s.value} className="flex items-start gap-2">
              <dt className="shrink-0 pt-0.5"><LengthStatusTag status={s.value} /></dt>
              <dd className="text-ink-2">{s.blurb}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
