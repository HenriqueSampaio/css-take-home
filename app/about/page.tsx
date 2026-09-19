import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Check, Cross } from "@/components/icons";
import { getHealth, getLiveStats } from "@/lib/db/queries/meta";
import { formatDate, formatYearMonth } from "@/lib/domain/dates";
import type { ImportReport } from "@/lib/import/report";
import { importReport } from "@/lib/seed/load";
import { requestDb } from "@/lib/ui/data";
import { scheduleHref, vesselsHref } from "@/lib/ui/params";

export const metadata: Metadata = { title: "About and decisions" };

const n = (value: number) => value.toLocaleString("en-US");

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12 first:mt-0">
      <h2 id={id} className="t-title mb-3 border-b-[1.5px] border-ink pb-1.5 text-[1.1875rem]">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="prose-measure text-[1rem] leading-relaxed">{children}</p>;

export default async function AboutPage() {
  const report = importReport as unknown as ImportReport;
  const db = await requestDb();
  const [stats, health] = await Promise.all([getLiveStats(db), getHealth(db)]);

  const r = report.imported.reservations;
  const link = report.vesselLinking;
  const fitPct = Math.round((report.fit.violations / Math.max(1, report.fit.resolvableReservations)) * 100);
  const topMisfit = report.fit.top[0];
  const rec = report.reconciliation;

  return (
    <article className="mx-auto max-w-[72rem]">
      <p className="t-caption">About</p>
      <h1 className="t-headline">What this is, and why it is built this way</h1>
      <p className="prose-measure mt-2 text-[1.0625rem] leading-relaxed text-ink-2">
        A berth reservation system for a marine research facility, built for a take-home brief. The facility ran its waterfront from a spreadsheet for 23 years, and two checks were done by eye:
        is this berth already taken, and is this vessel too long for it. Here both are guarantees rather than habits.
      </p>

      <div className="mt-8 grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div>
          <Section id="try" title="Five things to try in two minutes">
            <ol className="prose-measure flex list-decimal flex-col gap-2.5 pl-5 text-[1rem] leading-relaxed">
              <li>
                <Link className="link font-semibold" href="/reservations/new?kind=vessel&vessel=v_far-horizon&start=2019-12-10&end=2019-12-14">Find a berth for the 170 ft Far Horizon</Link>.
                Four berths are too short, with the overage drawn to scale and stated in feet. One is occupied, and says by whom. One can be booked.
              </li>
              <li>Book it, then run the same search again. The berth you took now reads Occupied and names your booking. There is no way to book over it, from this screen or any other.</li>
              <li>
                <Link className="link font-semibold" href={scheduleHref("1998-09")}>Open September 1998</Link>, a genuine double-booking from the old grid: two stays on North Pier West on the same days, stacked and hatched.
                Confirm one and it succeeds. Try to confirm the other and it is refused, naming the first.
              </li>
              <li>
                <Link className="link font-semibold" href={vesselsHref({ q: "Long Ketch" })}>Give R/V Long Ketch a length</Link>. It is the busiest vessel in the archive and the workbook never recorded how long it is.
                Enter any length (try 120, then 60) and every one of its stays is re-checked against its berth at once.
              </li>
              <li>Use <span className="font-semibold">Reset demo data</span> in the header to put everything back. This is a shared, open demo with no sign-in.</li>
            </ol>
          </Section>

          <Section id="rules" title="The two guarantees, and where each one lives">
            <P>
              <span className="font-semibold">A berth has one confirmed occupant per day.</span> This is enforced by the database itself, with a Postgres exclusion constraint, not by application code that remembers to check:
            </P>
            <pre className="overflow-x-auto border border-line-strong bg-sheet-raised px-3 py-2.5 text-[0.8125rem] leading-relaxed"><code>{`ALTER TABLE reservations ADD CONSTRAINT reservations_no_double_booking
  EXCLUDE USING gist (
    berth_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (status = 'confirmed');`}</code></pre>
            <P>
              Two requests racing for the same berth cannot both commit, and neither can a future script or a bug. The application still checks first, so it can answer in words (&ldquo;North Pier East is taken Dec 1 to Dec 31, 2019 by R/V Golden Compass&rdquo;),
              and it catches the database&apos;s refusal as the backstop for the race. A test suite runs the real migrations on a real Postgres engine and proves the overlap, the touching-dates case, and the race mapping.
            </P>
            <P>
              <span className="font-semibold">A vessel must fit its berth.</span> This one lives in the service layer, inside the booking transaction, and deliberately not in the database: the historical data legitimately breaks it, and lengths get corrected over time.
              Because a misfit is computed from the current length every time it is shown, never stored, fixing one vessel&apos;s length instantly re-scores its entire history.
            </P>
            <P>
              A vessel with no usable length cannot be booked until a length is entered. The check is never silently skipped, and the system accumulates lengths as it is used.
            </P>
          </Section>

          <Section id="assumptions" title="Assumptions">
            <ul className="prose-measure flex list-disc flex-col gap-2 pl-5 text-[1rem] leading-relaxed">
              <li><span className="font-semibold">Whole days, both ends inclusive.</span> In the old grid one cell is one berth-day, so a departure and an arrival on the same berth on the same day was never representable. That rule is kept: stays that touch collide.</li>
              <li><span className="font-semibold">One occupant per berth per day.</span> Rafting two vessels alongside, or sharing the 410 ft pier by length, is not modelled. See the open questions.</li>
              <li><span className="font-semibold">Events and closures occupy a berth exactly as a vessel does.</span> A community sail day blocks its berth; pier repair closes one. They have no length, so no fit check.</li>
              <li><span className="font-semibold">Fit means length only.</span> Length overall against berth length, in whole feet. Beam and draft are out of scope.</li>
              <li><span className="font-semibold">Cells like &ldquo;ETA 1200&rdquo; and &ldquo;Fueling @0800&rdquo; are notes, not bookings.</span> They are attached to the stay they sit in. The full vocabulary is closed and listed in the import code.</li>
              <li><span className="font-semibold">Backdated bookings are allowed</span>, so the archive can be corrected and so the rules can be tried against 2019 data.</li>
              <li><span className="font-semibold">No sign-in.</span> This deployment is an open demo; a real one would put the coordinator behind authentication and keep an audit trail.</li>
            </ul>
          </Section>

          <Section id="import" title="Importing 23 years of spreadsheet without guessing">
            <P>
              The workbook has one sheet per year from {report.sheets.yearSheets[0]} to {report.sheets.yearSheets.at(-1)}. A booking is a run of coloured cells in a berth&apos;s row with a name somewhere inside it. The layout changed three times,
              day numbers are uncached formulas in the early years, and from 2009 a stay is usually a merged range where only the first cell carries the colour and the name. Reading only the colours would have cut every one of those {n(report.runs.merges)} stays to a single day.
            </P>
            <P>
              The import is a one-time, deterministic pipeline of small pure functions: find month blocks by their content, date each column from the number printed above it (validated against the real calendar), read stays merge-first then by colour,
              classify each label, stitch stays that continue across a month or year boundary, link vessels to the length lists, then audit. It reads {n(report.blocks.total)} month blocks and produces {n(r.total)} stays:
              {" "}{n(r.confirmed)} confirmed and {n(r.needsReview)} held for review. Its output is committed, so the deployed database and the Reset button load exactly what was reviewed.
            </P>
            <P>
              <span className="font-semibold">Nothing is dropped without being counted.</span> Every one of the {n(rec.labelCells)} text cells in the year sheets is accounted for exactly once: imported into a stay ({n(rec.imported)}), attached as a note ({n(rec.asNotes)}),
              or listed with a reason ({n(rec.notImported)}, almost all of it calendar furniture such as weekday letters and day numbers). The import fails if that sum does not balance.
            </P>
            <P>
              <span className="font-semibold">The grid could hide a double-booking, so almost none were recorded.</span> One cell is one berth-day, so the only way to write down two vessels at once was to add a second row for the berth. In 23 years that happened
              for {report.issues.overlapPairs} colliding pairs. That near-absence is the problem the brief describes, not evidence that it was rare. Each pair is imported with both stays marked for review and no winner chosen.
              Where one coloured bar holds two different names ({report.runs.sharedBarRuns} bars), it is read as a handover, split back to back and flagged; it is never turned into an invented overlap.
            </P>
            <P>
              <span className="font-semibold">Lengths are the weak point of the source.</span> They exist only in two contact lists, mixed with phone numbers and email addresses. {link.verified} vessels match exactly.
              {" "}{link.probable} match by name under a different type prefix (the grid says S/V Far Horizon, the list says M/Y Far Horizon 170&apos;): those are used, and labelled Probable. {link.conflict} are listed with two different lengths, so neither is trusted.
              {" "}{link.unknown} have no length anywhere, including the busiest vessel in the archive, {link.topUnlinked[0]?.name} ({link.topUnlinked[0]?.bookings} stays). Only {link.bookingCoveragePct}% of vessel stays can be length-checked at all,
              which is why &ldquo;unknown&rdquo; is a first-class state here rather than an error.
            </P>
            <P>
              Of the {n(report.fit.resolvableReservations)} stays that can be checked, <span className="font-semibold">{report.fit.violations} ({fitPct}%) do not fit their berth</span>
              {topMisfit && <>, led by {topMisfit.vessel} at {topMisfit.vesselFt} ft on the {topMisfit.berthFt} ft {topMisfit.berth} ({topMisfit.count} times)</>}. They are listed on the <Link className="link" href="/review?show=misfits">Review</Link> page.
            </P>
            <h3 className="t-caption mt-2">Left out on purpose, and counted</h3>
            <ul className="prose-measure flex list-disc flex-col gap-1.5 pl-5 text-[0.9375rem] leading-relaxed text-ink-2">
              <li>The first block of the 2002, 2003 and 2004 sheets: a copy of the previous December that disagrees with that year&apos;s own sheet (shifted a day, different berths) and whose weekday row matches the wrong year. The year&apos;s own sheet is treated as authoritative.</li>
              <li>{report.notImported.areas.entries.length} entries in two rows with no length (small craft slips, finger piers). They hold several boats at once, so the one-occupant rule and the fit check do not apply to them.</li>
              <li>{report.notImported.orphanRows.entries.length} labels in rows that belong to no berth, including a palette row repeated across eight sheets, and {report.notImported.corruptHeaderLabels.count} vessel names sitting where the header rows should be in November and December 2010.</li>
              <li>A full-month grey band on the North Pier Face row from 2009 on. It is not imported as a closure, because {`vessels were booked on that berth throughout`}.</li>
              <li>The Tours sheet (one 2018 season, no berth) and the eight-year summary sheet, which lists 648 days of use in one year for one berth and berths that appear in no grid.</li>
            </ul>
          </Section>

          <Section id="questions" title="Questions for the facility">
            <ul className="prose-measure flex list-disc flex-col gap-2 pl-5 text-[1rem] leading-relaxed">
              <li>What does the grey band on North Pier Face mean: by arrangement only, shallow at low water, reserved for the resident vessel?</li>
              <li>The summary sheet&apos;s 648 days in a year suggests the 410 ft pier was routinely shared. Should a berth be bookable by total length rather than by one occupant? The data model would extend to that with a capacity check in place of the exclusion constraint.</li>
              <li>Are a vessel one foot over, or a vessel overhanging the end of a float, ever acceptable? Today the rule is strict; a recorded, reasoned override would be the next step.</li>
              <li>Who may confirm a stay, and should requesters see availability themselves?</li>
            </ul>
          </Section>

          <Section id="built" title="How it is built">
            <ul className="prose-measure flex list-disc flex-col gap-2 pl-5 text-[1rem] leading-relaxed">
              <li><span className="font-semibold">A pure domain layer</span> (dates, inclusive ranges, fit, vessel identity, berth classification, timeline lanes) shared by the importer, the services and the screens, so there is one definition of &ldquo;overlap&rdquo; and one of &ldquo;fits&rdquo;.</li>
              <li><span className="font-semibold">Dates are plain text</span> like 2019-07-01 from the database to the screen, with arithmetic on whole-day numbers. A stay is a set of calendar days, not instants, so no time zone can shift it. The tests run under three time zones.</li>
              <li><span className="font-semibold">Services own the transactions</span> and return refusals as values with a sentence a coordinator can act on; they are tested against a real Postgres engine. Server actions are thin wrappers around them.</li>
              <li><span className="font-semibold">Every view is a link.</span> The month and the selected stay live in the URL and pages render on the server, so the back button works and a finding can be pointed at.</li>
              <li><span className="font-semibold">Editing is optimistic-locked</span> with a version number, so two people changing the same stay cannot silently overwrite each other.</li>
              <li>Next.js on Vercel, Postgres on Neon through a pooled connection, Drizzle for the schema and queries. The interface follows one idea, a marine engineer&apos;s berthing plan: lengths drawn to scale, and status shown by hatching and words, never by colour alone.</li>
            </ul>
          </Section>

          <Section id="next" title="Cut for time, and what comes next">
            <ul className="prose-measure flex list-disc flex-col gap-2 pl-5 text-[1rem] leading-relaxed">
              <li>Sign-in, roles and an audit trail of who changed what.</li>
              <li>A recorded override for a reasoned misfit or a rafted pair.</li>
              <li>Dragging a stay on the schedule to move or resize it. Today that is done from the edit screen, which shows every berth&apos;s verdict for the new dates.</li>
              <li>The two multi-boat areas, which need a capacity model rather than an occupancy one.</li>
              <li>A year-at-a-glance view and an export back to a spreadsheet.</li>
            </ul>
          </Section>
        </div>

        <aside aria-label="Figures" className="mt-12 flex flex-col gap-6 lg:mt-0">
          <div className="sheet">
            <h2 className="t-caption border-b border-line-strong bg-sheet-sunk px-3 py-2">The archive, as imported</h2>
            <dl className="divide-y divide-line text-[0.875rem]">
              {[
                ["Covers", `${formatDate(report.imported.dateRange.first)} to ${formatDate(report.imported.dateRange.last)}`],
                ["Month blocks read", n(report.blocks.total)],
                ["Stays imported", n(r.total)],
                ["Held for review", n(r.needsReview)],
                ["Genuine double-bookings", `${report.issues.overlapPairs} pairs`],
                ["Stays joined across months", n(report.stitching.joins)],
                ["Vessels", n(report.imported.vessels.fromGrid + report.imported.vessels.registryOnly)],
                ["With a usable length", n(link.verified + link.probable)],
                ["Too long for their berth", `${report.fit.violations} stays`],
                ["Busiest month", formatYearMonth(report.imported.busiestMonth)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                  <dt className="text-ink-2">{label}</dt>
                  <dd className="t-num text-right font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="sheet">
            <h2 className="t-caption border-b border-line-strong bg-sheet-sunk px-3 py-2">This database, right now</h2>
            <dl className="divide-y divide-line text-[0.875rem]">
              <div className="flex items-center justify-between gap-3 px-3 py-1.5">
                <dt className="text-ink-2">No-double-booking constraint</dt>
                <dd className={`flex items-center gap-1 font-semibold ${health.constraint ? "text-clear" : "text-revision"}`}>{health.constraint ? <><Check size={13} />In force</> : <><Cross size={13} />Missing</>}</dd>
              </div>
              {[
                ["Confirmed stays", n(stats.reservations.confirmed)],
                ["Needing review", n(stats.reservations.needsReview)],
                ["Cancelled", n(stats.reservations.cancelled)],
                ["Open findings", n(stats.openIssues)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                  <dt className="text-ink-2">{label}</dt>
                  <dd className="t-num font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="text-[0.8125rem] text-ink-2">
            All data is synthetic. &ldquo;Harborview Marine Research Center&rdquo; is the placeholder name printed in the sample workbook; this site is not affiliated with any real institution.
          </p>
        </aside>
      </div>
    </article>
  );
}
