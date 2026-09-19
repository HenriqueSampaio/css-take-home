import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[72rem]">
      <h1 className="t-headline">There is nothing at this address</h1>
      <p className="prose-measure mt-2 text-ink-2">
        If you followed a link to a reservation, it may have been removed when the demo data was reset.
      </p>
      <Link href="/schedule" className="btn btn-primary mt-4">Go to the schedule</Link>
    </div>
  );
}
