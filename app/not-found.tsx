import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[40rem] py-10">
      <h1 className="t-headline">Nothing here</h1>
      <p className="mt-2 text-ink-2">If you followed a link to a reservation, it may have been removed when the demo data was reset.</p>
      <Link href="/schedule" className="btn btn-primary mt-5">Go to the schedule</Link>
    </div>
  );
}
