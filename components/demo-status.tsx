"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetDemoDataAction } from "@/lib/actions/demo";

/**
 * This deployment is an open, shared demo with no sign-in, so anyone can restore the
 * imported data. The confirm step is inline (no modal): a reset discards every visitor's changes.
 */
export function DemoStatus({ changes, lastReset }: { changes: number; lastReset: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () =>
    startTransition(async () => {
      const result = await resetDemoDataAction();
      setConfirming(false);
      if (result.ok) {
        setMessage({ tone: "ok", text: "Demo data restored to the imported archive." });
        router.refresh();
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });

  return (
    <div className="flex min-w-0 flex-col justify-center gap-1">
      <p className="t-caption">Open demo, shared data</p>
      <p className="t-data text-ink-2">
        {changes === 0 ? "No changes" : `${changes} ${changes === 1 ? "change" : "changes"}`} since last reset{lastReset ? ` (${lastReset})` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        {confirming ? (
          <>
            <span className="text-[0.8125rem] font-medium">Discard everyone&apos;s changes?</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={reset} disabled={pending}>{pending ? "Resetting..." : "Yes, reset"}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)} disabled={pending} autoFocus>Do not reset</button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setMessage(null); setConfirming(true); }}>Reset demo data</button>
        )}
        {message && !confirming && <span className={`text-[0.8125rem] font-medium ${message.tone === "ok" ? "text-clear" : "text-revision"}`}>{message.text}</span>}
      </div>
    </div>
  );
}
