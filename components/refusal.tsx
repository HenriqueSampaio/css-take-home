import Link from "next/link";
import { formatDate, yearMonthOf } from "@/lib/domain/dates";
import type { ServiceFailure } from "@/lib/services/result";
import { scheduleHref } from "@/lib/ui/params";

/** A refusal from the server, shown where the action was taken: the sentence, then the stays in the way. */
export function Refusal({ failure }: { failure: ServiceFailure }) {
  return (
    <div className="notice notice-danger" role="alert">
      <div>
        <p className="font-semibold">{failure.message}</p>
        {/* One stay in the way is already named in the sentence: just offer the way to it. Several get a list. */}
        {failure.conflicts && failure.conflicts.length === 1 && (
          <Link className="mt-1 inline-block font-semibold underline underline-offset-2" href={scheduleHref(yearMonthOf(failure.conflicts[0].startDate), failure.conflicts[0].id)}>See it on the schedule</Link>
        )}
        {failure.conflicts && failure.conflicts.length > 1 && (
          <ul className="mt-1 list-disc pl-5">
            {failure.conflicts.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link className="font-semibold underline underline-offset-2" href={scheduleHref(yearMonthOf(c.startDate), c.id)}>{c.label}</Link> at {c.berthName}, {formatDate(c.startDate)} to {formatDate(c.endDate)}
              </li>
            ))}
            {failure.conflicts.length > 5 && <li>and {failure.conflicts.length - 5} more</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
