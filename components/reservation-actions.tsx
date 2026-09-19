"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { cancelReservationAction, confirmReservationAction } from "@/lib/actions/reservations";
import { formatDate, yearMonthOf } from "@/lib/domain/dates";
import type { ServiceResult } from "@/lib/services/result";
import { editReservationHref, scheduleHref } from "@/lib/ui/params";

type Status = "confirmed" | "needs_review" | "cancelled";

/** Confirm, close findings, cancel, restore. Results come back as values and are shown in place, with the blocking stays named. */
export function ReservationActions({ id, version, status, openFindings, showCancelled }: { id: string; version: number; status: Status; openFindings: number; showCancelled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [result, setResult] = useState<ServiceResult<unknown> | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const cancelTrigger = useRef<HTMLButtonElement>(null);

  const run = (which: "confirm" | "cancel", action: typeof confirmReservationAction, success: string) =>
    startTransition(async () => {
      setBusy(which);
      setDone(null);
      const outcome = await action({ id, version });
      setBusy(null);
      setConfirmingCancel(false);
      setResult(outcome);
      if (outcome.ok) {
        setDone(success);
        router.refresh();
      }
    });

  const backOut = () => {
    setConfirmingCancel(false);
    requestAnimationFrame(() => cancelTrigger.current?.focus());
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {status !== "cancelled" && <Link href={editReservationHref(id)} className="btn btn-secondary">{status === "needs_review" ? "Edit and confirm" : "Edit"}</Link>}
        {status === "needs_review" && (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run("confirm", confirmReservationAction, "Confirmed. Its review findings are closed.")}>
            {busy === "confirm" ? "Confirming..." : "Confirm as is"}
          </button>
        )}
        {status === "confirmed" && openFindings > 0 && (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run("confirm", confirmReservationAction, openFindings === 1 ? "Finding closed." : "Findings closed.")}>
            {busy === "confirm" ? "Closing..." : openFindings === 1 ? "Looks right, close the finding" : `Looks right, close ${openFindings} findings`}
          </button>
        )}
        {status === "cancelled" && (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run("confirm", confirmReservationAction, "Reservation restored.")}>
            {busy === "confirm" ? "Restoring..." : "Restore reservation"}
          </button>
        )}
        {status !== "cancelled" &&
          (confirmingCancel ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[0.875rem] font-medium">Cancel this reservation?</span>
              <button type="button" className="btn btn-danger" disabled={pending} onClick={() => run("cancel", cancelReservationAction, "Reservation cancelled. Use Show cancelled stays to find and restore it.")}>
                {busy === "cancel" ? "Cancelling..." : "Yes, cancel it"}
              </button>
              {/* Focus lands on the safe choice; the trigger it replaced is gone from the page. */}
              <button type="button" className="btn btn-secondary" disabled={pending} autoFocus onClick={backOut}>Keep it</button>
            </span>
          ) : (
            <button ref={cancelTrigger} type="button" className="btn btn-danger" disabled={pending} onClick={() => { setResult(null); setDone(null); setConfirmingCancel(true); }}>Cancel reservation</button>
          ))}
      </div>

      {result && !result.ok && (
        <div className="notice notice-danger" role="alert">
          <div>
            <p className="font-semibold">{result.message}</p>
            {result.conflicts && result.conflicts.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {result.conflicts.map((c) => (
                  <li key={c.id}>
                    <Link className="link" scroll={false} href={scheduleHref(yearMonthOf(c.startDate), c.id, { showCancelled })}>{c.label}</Link>, {formatDate(c.startDate)} to {formatDate(c.endDate)}
                  </li>
                ))}
              </ul>
            )}
            {result.code === "STALE" && <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => { setResult(null); router.refresh(); }}>Load the latest version</button>}
          </div>
        </div>
      )}
      {result?.ok && (
        <div className={`notice ${result.warning ? "notice-caution" : "notice-clear"}`} role="status">
          <p>{done}{result.warning ? ` ${result.warning}` : ""}</p>
        </div>
      )}
    </div>
  );
}
