"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createReservationAction, updateReservationAction } from "@/lib/actions/reservations";
import { formatDate, yearMonthOf } from "@/lib/domain/dates";
import type { CreateReservationInput, UpdateReservationInput } from "@/lib/services/reservations";
import type { ServiceFailure } from "@/lib/services/result";
import { scheduleHref } from "@/lib/ui/params";
import { ArrowRight } from "./icons";

type Props =
  | { mode: "create"; input: CreateReservationInput; label: string; primary?: boolean }
  | { mode: "update"; input: UpdateReservationInput; label: string; primary?: boolean };

/** Books (or moves) the stay onto one berth. The server re-checks everything; a refusal is shown here as a sentence. */
export function BookBerthButton(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<ServiceFailure | null>(null);

  const go = () =>
    startTransition(async () => {
      setFailure(null);
      const result = props.mode === "create" ? await createReservationAction(props.input) : await updateReservationAction(props.input);
      if (result.ok) {
        router.push(scheduleHref(yearMonthOf(props.input.startDate), result.data.id, { flash: props.mode === "create" ? "booked" : "saved" }));
        router.refresh();
      } else {
        setFailure(result);
      }
    });

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button type="button" className={`btn ${props.primary ? "btn-primary" : "btn-secondary"}`} onClick={go} disabled={pending}>
        {pending ? (props.mode === "create" ? "Booking..." : "Saving...") : <>{props.label}<ArrowRight size={16} /></>}
      </button>
      {failure && (
        <div className="notice notice-danger max-w-[24rem] text-left" role="alert">
          <div>
            <p className="font-semibold">{failure.message}</p>
            {failure.conflicts && failure.conflicts.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {failure.conflicts.map((c) => (
                  <li key={c.id}><Link className="font-semibold underline underline-offset-2" href={scheduleHref(yearMonthOf(c.startDate), c.id)}>{c.label}</Link>, {formatDate(c.startDate)} to {formatDate(c.endDate)}</li>
                ))}
              </ul>
            )}
            {failure.code === "STALE" && <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => { setFailure(null); router.refresh(); }}>Load the latest version</button>}
          </div>
        </div>
      )}
    </div>
  );
}
