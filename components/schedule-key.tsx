import { Overrun, TriangleMark, NoteDot } from "./icons";

/** A drawing always carries a key. This one explains the fills and marks in words. */
export function ScheduleKey() {
  const swatch = "inline-block h-4 w-7 shrink-0 align-middle";
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem] text-ink-2" aria-label="Key to the schedule">
      <div className="flex items-center gap-1.5"><dt><span className={`${swatch} fill-vessel`} aria-hidden /></dt><dd>Vessel, confirmed</dd></div>
      <div className="flex items-center gap-1.5"><dt><span className={`${swatch} fill-event`} aria-hidden /></dt><dd>Event</dd></div>
      <div className="flex items-center gap-1.5"><dt><span className={`${swatch} fill-closure`} aria-hidden /></dt><dd>Closure</dd></div>
      <div className="flex items-center gap-1.5"><dt><span className={`${swatch} fill-review`} aria-hidden /></dt><dd>Needs review (legacy data)</dd></div>
      <div className="flex items-center gap-1.5"><dt><span className={`${swatch} fill-cancelled`} aria-hidden /></dt><dd>Cancelled</dd></div>
      <div className="flex items-center gap-1.5"><dt className="text-revision"><Overrun size={14} /></dt><dd>Vessel too long for berth</dd></div>
      <div className="flex items-center gap-1.5"><dt className="text-caution"><TriangleMark size={14} /></dt><dd>Open review finding</dd></div>
      <div className="flex items-center gap-1.5"><dt className="text-ink-2"><NoteDot /></dt><dd>Has notes</dd></div>
      <div className="flex items-center gap-1.5"><dt className="t-data text-ink-2" aria-hidden>2 rows</dt><dd>Bars stacked in one berth: same berth, same days</dd></div>
    </dl>
  );
}
