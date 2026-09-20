"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { cancelReservationAction, restoreReservationAction } from "@/lib/actions/reservations";
import { formatDate, yearMonthOf } from "@/lib/domain/dates";
import type { ServiceResult } from "@/lib/services/result";
import { editReservationHref, scheduleHref } from "@/lib/ui/params";
import { Pencil, Undo } from "./icons";

/** Edit, cancel, restore. A refusal comes back as a sentence and is shown in place, naming what is in the way. */
export function ReservationActions({ id, version, status, ended, showCancelled }: { id: string; version: number; status: "confirmed" | "cancelled"; ended: boolean; showCancelled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [result, setResult] = useState<ServiceResult<unknown> | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const cancelTrigger = useRef<HTMLButtonElement>(null);

  const run = (action: typeof cancelReservationAction, success: string) =>
    startTransition(async () => {
      setDone(null);
      const outcome = await action({ id, version });
      setConfirmingCancel(false);
      setResult(outcome);
      if (outcome.ok) {
        setDone(success);
        router.refresh();
      }
    });

  if (ended) return <p className="t-data text-ink-3">This stay has ended, so it can no longer be changed.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "confirmed" && !confirmingCancel && (
          <>
            <Link href={editReservationHref(id)} className="btn btn-secondary"><Pencil size={16} />Edit</Link>
            <button ref={cancelTrigger} type="button" className="btn btn-danger" disabled={pending} onClick={() => { setResult(null); setDone(null); setConfirmingCancel(true); }}>Cancel reservation</button>
          </>
        )}
        {status === "confirmed" && confirmingCancel && (
          <div className="rise-in flex w-full flex-col gap-2 bg-revision-tone p-3">
            <p className="text-[0.875rem] font-semibold text-revision">Cancel this reservation? Its days become free to book.</p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-danger-solid btn-sm" disabled={pending} onClick={() => run(cancelReservationAction, "Cancelled. Turn on Show cancelled to find and restore it.")}>{pending ? "Cancelling..." : "Yes, cancel it"}</button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={pending} autoFocus onClick={() => { setConfirmingCancel(false); requestAnimationFrame(() => cancelTrigger.current?.focus()); }}>Keep it</button>
            </div>
          </div>
        )}
        {status === "cancelled" && (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(restoreReservationAction, "Restored.")}><Undo size={16} />{pending ? "Restoring..." : "Restore reservation"}</button>
        )}
      </div>

      {result && !result.ok && (
        <div className="notice notice-danger" role="alert">
          <div>
            <p className="font-semibold">{result.message}</p>
            {result.conflicts && result.conflicts.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {result.conflicts.map((c) => (
                  <li key={c.id}><Link className="font-semibold underline underline-offset-2" scroll={false} href={scheduleHref(yearMonthOf(c.startDate), c.id, { showCancelled })}>{c.label}</Link>, {formatDate(c.startDate)} to {formatDate(c.endDate)}</li>
                ))}
              </ul>
            )}
            {result.code === "STALE" && <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => { setResult(null); router.refresh(); }}>Load the latest version</button>}
          </div>
        </div>
      )}
      {result?.ok && done && <p className="notice notice-clear font-semibold" role="status">{done}</p>}
    </div>
  );
}
