"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetDemoDataAction } from "@/lib/actions/demo";

/** This deployment is an open, shared demo, so anyone may put it back to its starting state. Kept quiet, in the footer. */
export function DemoReset({ changes }: { changes: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () =>
    startTransition(async () => {
      const result = await resetDemoDataAction();
      setConfirming(false);
      setNote(result.ok ? { ok: true, text: "Demo reset: the schedule is empty again." } : { ok: false, text: result.message });
      if (result.ok) router.refresh();
    });

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" aria-live="polite">
      <span>{changes === 0 ? "No changes yet." : `${changes} ${changes === 1 ? "change" : "changes"} since the last reset.`}</span>
      {confirming ? (
        <>
          <span className="font-semibold text-ink">Clear every reservation and restore the starting berths and vessels?</span>
          <button type="button" className="btn btn-danger btn-sm" onClick={reset} disabled={pending}>{pending ? "Resetting..." : "Yes, reset"}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={pending} autoFocus>Do not reset</button>
        </>
      ) : (
        <button type="button" className="link" onClick={() => { setNote(null); setConfirming(true); }}>Reset demo data</button>
      )}
      {note && !confirming && <span className={`font-semibold ${note.ok ? "text-ok" : "text-danger-ink"}`}>{note.text}</span>}
    </span>
  );
}
