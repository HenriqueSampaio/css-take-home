"use client";

import { useEffect } from "react";

/**
 * Most failures here are the database waking from idle. `retry()` re-fetches the server
 * components; `reset()` would only re-render the same failed result.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-[72rem]">
      <h1 className="t-headline">This page could not be loaded</h1>
      <p className="prose-measure mt-2 text-ink-2">
        The most likely cause is the database waking up after being idle, which takes a second or two. Try again.
        If you had just saved something, open the schedule afterwards to check whether it went through.
      </p>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>Try again</button>
        <a href="/schedule" className="btn btn-secondary">Go to the schedule</a>
      </div>
      {error.digest && <p className="t-data mt-4 text-ink-3">Reference {error.digest}</p>}
    </div>
  );
}
