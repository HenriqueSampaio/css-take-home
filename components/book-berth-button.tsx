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

  const go = () =>
    startTransition(async () => {
      const result = props.mode === "create" ? await createReservationAction(props.input) : await updateReservationAction(props.input);
      if (result.ok) {
        router.push(scheduleHref(yearMonthOf(props.input.startDate), result.data.id));
        router.refresh();
      } else {
        setFailure(result);
      }
    });

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" className={`btn ${props.primary ? "btn-primary" : "btn-secondary"}`} onClick={go} disabled={pending}>
        {pending ? (props.mode === "create" ? "Booking..." : "Saving...") : props.label}
      </button>
      <div aria-live="polite">
        {failure && (
          <div className="notice notice-danger" role="alert">
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
              {failure.code === "STALE" && <p className="mt-1">Someone changed this reservation. Reload to see the latest version.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
