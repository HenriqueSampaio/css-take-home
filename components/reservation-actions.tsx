"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelReservationAction, confirmReservationAction } from "@/lib/actions/reservations";
import type { ServiceResult } from "@/lib/services/result";
import { formatDate } from "@/lib/domain/dates";
import { editReservationHref } from "@/lib/ui/params";

type Status = "confirmed" | "needs_review" | "cancelled";

/** Confirm, cancel, restore. Results come back as values and are shown in place, with the blocking stays named. */
export function ReservationActions({ id, version, status, conflictHrefBase }: { id: string; version: number; status: Status; conflictHrefBase: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [result, setResult] = useState<ServiceResult<unknown> | null>(null);

  const run = (which: "confirm" | "cancel", action: typeof confirmReservationAction) =>
    startTransition(async () => {
      setBusy(which);
      const outcome = await action({ id, version });
      setBusy(null);
      setConfirmingCancel(false);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {status !== "cancelled" && <Link href={editReservationHref(id)} className="btn btn-secondary">{status === "needs_review" ? "Edit and confirm" : "Edit"}</Link>}
        {status === "needs_review" && (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run("confirm", confirmReservationAction)}>
            {busy === "confirm" ? "Confirming..." : "Confirm as is"}
          </button>
        )}
        {status === "cancelled" && (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run("confirm", confirmReservationAction)}>
            {busy === "confirm" ? "Restoring..." : "Restore reservation"}
          </button>
        )}
        {status !== "cancelled" &&
          (confirmingCancel ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[0.875rem] font-medium">Cancel this reservation?</span>
              <button type="button" className="btn btn-danger" disabled={pending} onClick={() => run("cancel", cancelReservationAction)}>
                {busy === "cancel" ? "Cancelling..." : "Yes, cancel it"}
              </button>
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setConfirmingCancel(false)}>Keep it</button>
            </span>
          ) : (
            <button type="button" className="btn btn-danger" disabled={pending} onClick={() => { setResult(null); setConfirmingCancel(true); }}>Cancel reservation</button>
          ))}
      </div>

      <div aria-live="polite">
        {result && !result.ok && (
          <div className="notice notice-danger" role="alert">
            <div>
              <p className="font-semibold">{result.message}</p>
              {result.conflicts && result.conflicts.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {result.conflicts.map((c) => (
                    <li key={c.id}>
                      <Link className="link" href={`${conflictHrefBase}&r=${encodeURIComponent(c.id)}`}>{c.label}</Link>, {formatDate(c.startDate)} to {formatDate(c.endDate)}
                    </li>
                  ))}
                </ul>
              )}
              {result.code === "STALE" && <p className="mt-1">Reload the page to see the latest version, then try again.</p>}
            </div>
          </div>
        )}
        {result?.ok && result.warning && <div className="notice notice-caution" role="status"><p>{result.warning}</p></div>}
      </div>
    </div>
  );
}
