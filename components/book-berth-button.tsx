"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createReservationAction, updateReservationAction } from "@/lib/actions/reservations";
import { formatDate, yearMonthOf } from "@/lib/domain/dates";
import type { CreateReservationInput, UpdateReservationInput } from "@/lib/services/reservations";
import type { ServiceFailure } from "@/lib/services/result";
import { scheduleHref } from "@/lib/ui/params";

type Props =
  | { mode: "create"; input: CreateReservationInput; label: string; primary?: boolean }
  | { mode: "update"; input: UpdateReservationInput; label: string; primary?: boolean };

/** Books (or moves) the stay onto one berth. The server re-checks everything; a refusal is shown here, in words. */
export function BookBerthButton(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<ServiceFailure | null>(null);
  const [saved, setSaved] = useState<{ href: string; warning: string } | null>(null);

  const go = () =>
    startTransition(async () => {
      const result = props.mode === "create" ? await createReservationAction(props.input) : await updateReservationAction(props.input);
      if (result.ok) {
        const href = scheduleHref(yearMonthOf(props.input.startDate), result.data.id);
        // A warning (say, an unresolved legacy stay on the same days) must be read, so stay here and show it.
        if (result.warning) return setSaved({ href, warning: result.warning });
        router.push(href);
        router.refresh();
      } else {
        setFailure(result);
      }
    });

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" className={`btn ${props.primary ? "btn-primary" : "btn-secondary"}`} onClick={go} disabled={pending || saved !== null}>
        {pending ? (props.mode === "create" ? "Booking..." : "Saving...") : props.label}
      </button>
      {saved && (
        <div className="notice notice-caution max-w-[22rem]" role="status">
          <div>
            <p><span className="font-semibold">{props.mode === "create" ? "Booked." : "Saved."}</span> {saved.warning}</p>
            <Link className="link mt-1 inline-block" href={saved.href}>See it on the schedule</Link>
          </div>
        </div>
      )}
      <div>
        {failure && (
          <div className="notice notice-danger max-w-[22rem]" role="alert">
            <div>
              <p className="font-semibold">{failure.message}</p>
              {failure.conflicts && failure.conflicts.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {failure.conflicts.map((c) => (
                    <li key={c.id}><Link className="link" href={scheduleHref(yearMonthOf(c.startDate), c.id)}>{c.label}</Link>, {formatDate(c.startDate)} to {formatDate(c.endDate)}</li>
                  ))}
                </ul>
              )}
              {failure.fieldErrors && Object.keys(failure.fieldErrors).length > 0 && !failure.conflicts && (
                <ul className="mt-1 list-disc pl-5">{Object.values(failure.fieldErrors).flat().filter((m) => m !== failure.message).map((m) => <li key={m}>{m}</li>)}</ul>
              )}
              {failure.code === "STALE" && <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => { setFailure(null); router.refresh(); }}>Load the latest version</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
