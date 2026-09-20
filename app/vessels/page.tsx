import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "@/components/icons";
import { AddVesselForm, VesselLengthEdit } from "@/components/vessel-admin";
import { getVessels } from "@/lib/db/queries/vessels";
import { todayIn } from "@/lib/domain/dates";
import { requestDb } from "@/lib/ui/data";
import { firstParam } from "@/lib/ui/params";

export const metadata: Metadata = { title: "Vessels" };

const PAGE = 60;

export default async function VesselsPage(props: PageProps<"/vessels">) {
  const sp = await props.searchParams;
  const q = firstParam(sp.q)?.trim().slice(0, 80) ?? "";
  const all = await getVessels(await requestDb(), todayIn(), { q: q || undefined });
  // Vessels with stays coming up first: those are the ones a coordinator is working with.
  const vessels = [...all].sort((a, b) => b.upcomingCount - a.upcomingCount || a.name.localeCompare(b.name));
  const shown = vessels.slice(0, PAGE);

  return (
    <div className="mx-auto flex max-w-[64rem] flex-col gap-6">
      <div>
        <h1 className="t-headline">Vessels</h1>
        <p className="mt-1.5 text-ink-2"><strong className="t-num">{all.length}</strong> {q ? "matching" : "registered"}. A vessel&apos;s <strong>length</strong> decides which berths it can take.</p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <form action="/vessels" method="get" role="search" className="relative w-full max-w-sm">
          <label htmlFor="vessel-q" className="sr-only">Search vessels by name</label>
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-ink-3" />
          <input id="vessel-q" name="q" defaultValue={q} className="input !pl-9" placeholder="Search by name" autoComplete="off" />
        </form>
        <AddVesselForm />
      </div>

      {shown.length > 0 ? (
        <ul className="sheet rows overflow-hidden">
          {shown.map((v) => (
            <li key={v.id} className="row-hover flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3">
              <p className="flex min-w-0 flex-1 basis-56 flex-wrap items-baseline gap-x-2.5">
                <span className="t-title truncate">{v.displayName}</span>
                {v.upcomingCount > 0 && <span className="tag tag-accent">{v.upcomingCount} upcoming</span>}
              </p>
              <div className="flex items-center gap-3">
                <strong className="t-num text-[1.0625rem]">{v.lengthFt} ft</strong>
                <VesselLengthEdit key={`${v.id}-${v.version}`} vesselId={v.id} version={v.version} name={v.displayName} lengthFt={v.lengthFt} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="sheet p-6 text-ink-2">
          <p><strong>No vessel matches &ldquo;{q}&rdquo;.</strong> Check the spelling, <Link className="link" href="/vessels">show all vessels</Link>, or add it with the button above.</p>
        </div>
      )}
      {vessels.length > PAGE && <p className="text-[0.875rem] text-ink-3">Showing {PAGE} of {vessels.length}. Search by name to find the rest.</p>}
    </div>
  );
}
