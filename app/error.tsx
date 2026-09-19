"use client";

import { useEffect } from "react";

/** Most failures here are the database waking from idle; say so, and offer the retry. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-[72rem]">
      <p className="t-caption">Something went wrong</p>
      <h1 className="t-headline">This page could not be loaded</h1>
      <p className="prose-measure mt-2 text-ink-2">
        Nothing was changed. The most likely cause is the database waking up after being idle, which takes a second or two. Try again; if it keeps happening, the schedule itself is unaffected.
      </p>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
        <a href="/schedule" className="btn btn-secondary">Go to the schedule</a>
      </div>
      {error.digest && <p className="t-data mt-4 text-ink-3">Reference {error.digest}</p>}
    </div>
  );
}
