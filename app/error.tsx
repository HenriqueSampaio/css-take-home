"use client";

import { useEffect } from "react";

/** Most failures here are the database waking from idle. `retry()` re-fetches; `reset()` would only re-render the same failure. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-[40rem] py-10">
      <h1 className="t-headline">This page did not load</h1>
      <p className="mt-2 text-ink-2">The database was probably waking up after a quiet spell, which takes a second or two. <strong>Try again.</strong> If you had just saved something, check the schedule afterwards to see whether it went through.</p>
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>Try again</button>
        <a href="/schedule" className="btn btn-secondary">Go to the schedule</a>
      </div>
      {error.digest && <p className="t-data t-num mt-5 text-ink-3">Reference {error.digest}</p>}
    </div>
  );
}
