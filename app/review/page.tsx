import type { Metadata } from "next";
import Link from "next/link";
import { RevisionTriangle } from "@/components/revision-triangle";
import { LengthStatusTag, ReservationStatusTag } from "@/components/status-tags";
import { getFitViolations, getIssueSummary, getOpenIssues } from "@/lib/db/queries/issues";
import { formatDate, yearMonthOf } from "@/lib/domain/dates";
import type { IssueType } from "@/lib/seed/contract";
import { requestDb } from "@/lib/ui/data";
import { firstParam, scheduleHref, vesselsHref } from "@/lib/ui/params";

export const metadata: Metadata = { title: "Review" };

type SectionKey = IssueType | "misfits";
const PAGE = 50;

const SECTIONS: { key: SectionKey; title: string; meaning: string; action: string; blocking: boolean }[] = [
  { key: "overlap", title: "Double-bookings", meaning: "Two stays on the same berth on the same days. The old grid could only record this by adding a second row for the berth.", action: "Decide which stay is real: move or cancel one, then confirm the other.", blocking: true },
  { key: "unlabelled", title: "Stays with no name", meaning: "A coloured run in the workbook with no vessel or event written in it.", action: "Give it a name by editing it, or cancel it if nothing was there.", blocking: true },
  { key: "calendar_defect", title: "Impossible calendar", meaning: "The workbook's month had days that do not exist, or its header rows were scrambled, so the dates are a best reading.", action: "Check the dates against another record, then save to confirm.", blocking: true },
  { key: "misfits", title: "Vessels too long for their berth", meaning: "The vessel's length on file is greater than the berth's. Computed live from current lengths, so correcting a length updates this list.", action: "Move the stay, or correct the vessel's length if it is wrong.", blocking: false },
  { key: "ambiguous_extent", title: "Uncertain dates or occupant", meaning: "The stay was imported, but its extent or occupant could be read more than one way: a name on an uncoloured cell, two names in one bar, a bar running past the month.", action: "Glance at each; they stay confirmed unless you change them.", blocking: false },
  { key: "length_conflict", title: "Two lengths on file", meaning: "The registry lists the same vessel with two different lengths, so neither is used.", action: "Pick the right length on the Vessels page.", blocking: false },
];

export default async function ReviewPage(props: PageProps<"/review">) {
  const sp = await props.searchParams;
  const db = await requestDb();
  const summary = await getIssueSummary(db);
  const countOf = (key: SectionKey) => (key === "misfits" ? summary.misfitReservations : summary.byType[key] ?? 0);

  const requested = firstParam(sp.show) as SectionKey | undefined;
  const active = SECTIONS.find((s) => s.key === requested) ?? SECTIONS.find((s) => countOf(s.key) > 0) ?? SECTIONS[0];
  const offset = Math.max(0, Number(firstParam(sp.offset)) || 0);

  const issues = active.key === "misfits" ? null : await getOpenIssues(db, { type: active.key, limit: PAGE, offset });
  const misfits = active.key === "misfits" ? await getFitViolations(db, { limit: PAGE, offset }) : null;
  const total = issues?.total ?? misfits?.totalGroups ?? 0;
  const hrefFor = (key: SectionKey, at = 0) => `/review?show=${key}${at > 0 ? `&offset=${at}` : ""}`;

  return (
    <div className="mx-auto flex max-w-[72rem] flex-col gap-6">
      <div>
        <p className="t-caption">Review</p>
        <h1 className="t-headline">What the import could not settle</h1>
        <p className="prose-measure mt-1 text-ink-2">
          Twenty-three years of spreadsheet were imported without guessing. Anything that could not be read with certainty is listed here for a person to decide.
          None of it blocks new bookings: only <span className="font-semibold text-ink">confirmed</span> stays can refuse a berth, and these wait outside that rule until resolved.
        </p>
        <p className="t-data mt-2 text-ink-2">
          {summary.needsReviewReservations} stays need review · {summary.misfitReservations} stays too long for their berth ·{" "}
          <Link className="link" href={vesselsHref({ status: "unknown" })}>{summary.vesselsWithUnknownLength} vessels with no length on file</Link>
        </p>
      </div>

      <div className="sheet overflow-x-auto">
        <table className="table">
          <caption className="sr-only">Review findings by kind</caption>
          <thead>
            <tr>
              <th scope="col" className="t-caption">Finding</th>
              <th scope="col" className="t-caption num">Open</th>
              <th scope="col" className="t-caption">What it means</th>
              <th scope="col" className="t-caption">What to do</th>
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((s) => {
              const count = countOf(s.key);
              const current = s.key === active.key;
              return (
                <tr key={s.key} className={current ? "[&>*]:!bg-prussian-tone" : ""}>
                  <th scope="row" className="!border-b !border-line !bg-transparent text-left align-top">
                    <Link href={hrefFor(s.key)} scroll={false} aria-current={current ? "true" : undefined} className="link font-semibold">{s.title}</Link>
                    <span className="mt-1 block">{s.blocking ? <span className="tag tag-caution">Needs review</span> : <span className="tag">Note only</span>}</span>
                  </th>
                  <td className="num t-num text-[1rem] font-semibold">{count}</td>
                  <td className="text-ink-2">{s.meaning}</td>
                  <td className="text-ink-2">{s.action}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="findings-heading">
        <h2 id="findings-heading" className="t-title">{active.title} <span className="t-num font-normal text-ink-2">({total})</span></h2>

        {total === 0 && <p className="mt-2 text-ink-2">Nothing open here. {active.blocking ? "Every stay of this kind has been resolved." : ""}</p>}

        {issues && issues.rows.length > 0 && (
          <ol className="mt-3 divide-y divide-line border-y-[1.5px] border-ink">
            {issues.rows.map((issue, index) => (
              <li key={issue.id} className="flex gap-3 py-3">
                <RevisionTriangle count={offset + index + 1} size={24} label={`Finding ${offset + index + 1}`} />
                <div className="min-w-0 flex-1">
                  {issue.reservation && (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link className="link font-semibold" href={scheduleHref(yearMonthOf(issue.reservation.startDate), issue.reservation.id)}>{issue.reservation.label}</Link>
                      <span className="text-ink-2">{issue.reservation.berthName}, <span className="t-num">{formatDate(issue.reservation.startDate)} to {formatDate(issue.reservation.endDate)}</span></span>
                      <ReservationStatusTag status={issue.reservation.status} />
                    </p>
                  )}
                  {issue.vessel && (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link className="link font-semibold" href={vesselsHref({ q: issue.vessel.displayName.replace(/^\S+\/\S+\s|^(Tug|Barge|OSV)\s/, "") })}>{issue.vessel.displayName}</Link>
                      <span className="t-num text-ink-2">{issue.vessel.lengthCandidates.join(" ft or ")} ft on file</span>
                      <LengthStatusTag status={issue.vessel.lengthStatus} />
                    </p>
                  )}
                  <p className="mt-0.5 text-[0.875rem] text-ink-2">{issue.detail}</p>
                  {issue.sourceRef && <p className="t-data mt-0.5 break-all text-ink-3">Workbook cells {issue.sourceRef}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {misfits && misfits.groups.length > 0 && (
          <div className="sheet mt-3 overflow-x-auto">
            <table className="table">
              <caption className="sr-only">Vessels booked on berths shorter than they are, most stays first</caption>
              <thead>
                <tr>
                  <th scope="col" className="t-caption">Vessel</th>
                  <th scope="col" className="t-caption num">Length</th>
                  <th scope="col" className="t-caption">Berth</th>
                  <th scope="col" className="t-caption num">Berth length</th>
                  <th scope="col" className="t-caption num">Over by</th>
                  <th scope="col" className="t-caption num">Stays</th>
                  <th scope="col" className="t-caption">Between</th>
                </tr>
              </thead>
              <tbody>
                {misfits.groups.map((g) => (
                  <tr key={`${g.vesselId}-${g.berthId}`}>
                    <th scope="row" className="!border-b !border-line !bg-transparent text-left">
                      <Link className="link font-semibold" href={scheduleHref(yearMonthOf(g.lastDate), g.sampleReservationId)}>{g.vesselName}</Link>
                      <span className="ml-1.5 align-middle"><LengthStatusTag status={g.lengthStatus} /></span>
                    </th>
                    <td className="num t-num">{g.vesselLengthFt} ft</td>
                    <td>{g.berthName}</td>
                    <td className="num t-num">{g.berthLengthFt} ft</td>
                    <td className="num t-num font-semibold text-revision">{g.overByFt} ft</td>
                    <td className="num t-num">{g.count}</td>
                    <td className="t-num whitespace-nowrap text-ink-2">{formatDate(g.firstDate)} to {formatDate(g.lastDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {misfits && misfits.groups.length > 0 && (
          <p className="prose-measure mt-2 text-[0.875rem] text-ink-2">
            {misfits.totalReservations} stays in all. Lengths marked Probable came from a registry entry with the same name but a different type prefix; if one looks wrong, correct it on the <Link className="link" href="/vessels">Vessels</Link> page and this list updates.
          </p>
        )}

        {total > PAGE && (
          <nav aria-label="Pages" className="mt-3 flex items-center gap-2">
            {offset > 0 ? <Link className="btn btn-secondary btn-sm" href={hrefFor(active.key, Math.max(0, offset - PAGE))} scroll={false}>Previous {PAGE}</Link> : null}
            <span className="t-data text-ink-2">{offset + 1} to {Math.min(offset + PAGE, total)} of {total}</span>
            {offset + PAGE < total ? <Link className="btn btn-secondary btn-sm" href={hrefFor(active.key, offset + PAGE)} scroll={false}>Next {PAGE}</Link> : null}
          </nav>
        )}
      </section>
    </div>
  );
}
