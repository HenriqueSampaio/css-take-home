import Link from "next/link";
import type { ReactNode } from "react";
import type { BerthOption } from "@/lib/domain/availability";
import { formatDate, yearMonthOf } from "@/lib/domain/dates";
import { scheduleHref } from "@/lib/ui/params";
import { FitGauge } from "./fit-gauge";
import { Check, Cross, Overrun, TriangleMark } from "./icons";

const VERDICT: Record<BerthOption["verdict"], { label: string; vesselLabel?: string; className: string; icon: ReactNode }> = {
  available: { label: "Free", vesselLabel: "Fits and free", className: "tag tag-clear", icon: <Check size={12} /> },
  length_needed: { label: "Length needed", className: "tag tag-caution", icon: <TriangleMark size={12} /> },
  occupied: { label: "Occupied", className: "tag tag-danger", icon: <Cross size={12} /> },
  too_short: { label: "Too short", className: "tag tag-danger", icon: <Overrun size={12} /> },
};

/**
 * Every berth, classified for one requested stay. This list is the replacement for both
 * manual checks: it shows at once which berths are free and which the vessel fits, and
 * says in words why the others cannot be used.
 */
export function BerthOptions({ options, scaleFt, vesselLabel, pickedBerthId, renderAction }: { options: BerthOption[]; scaleFt: number; vesselLabel: string | null; pickedBerthId: string | null; renderAction: (option: BerthOption, isFirstUsable: boolean) => ReactNode }) {
  const firstUsable = options.find((o) => o.verdict === "available" && o.berth.id === pickedBerthId) ?? options.find((o) => o.verdict === "available") ?? null;

  return (
    <ul className="divide-y divide-line-strong border-y-[1.5px] border-ink">
      {options.map((option) => {
        const verdict = VERDICT[option.verdict];
        return (
          <li key={option.berth.id} className="grid gap-x-6 gap-y-2 px-1 py-3.5 md:grid-cols-[13rem_minmax(0,1fr)_auto] md:items-start">
            <div>
              <p className="font-semibold leading-tight">{option.berth.name}</p>
              <p className="t-data text-ink-2">{option.berth.lengthFt} ft</p>
              <p className="mt-1.5 flex flex-wrap gap-1">
                <span className={verdict.className}>{verdict.icon}{option.fit && verdict.vesselLabel ? verdict.vesselLabel : verdict.label}</span>
                {option.berth.id === pickedBerthId && <span className="tag tag-accent">Picked on the schedule</span>}
              </p>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              {option.fit && <FitGauge fit={option.fit} berthFt={option.berth.lengthFt} scaleFt={scaleFt} vesselLabel={vesselLabel ?? "Vessel"} />}
              {option.conflicts.length > 0 && (
                <p className="text-[0.875rem]">
                  <span className="font-semibold text-revision">Taken by </span>
                  {option.conflicts.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && "; "}
                      <Link className="link" href={scheduleHref(yearMonthOf(c.start), c.id)}>{c.label}</Link>
                      <span className="t-num text-ink-2">, {formatDate(c.start)} to {formatDate(c.end)}</span>
                    </span>
                  ))}
                  .
                </p>
              )}
              {option.cautions.length > 0 && (
                <p className="text-[0.875rem] text-ink-2">
                  <span className="font-semibold text-caution">Check first: </span>
                  an unresolved legacy stay overlaps these dates (
                  {option.cautions.map((c, i) => (
                    <span key={c.id}>{i > 0 && "; "}<Link className="link" href={scheduleHref(yearMonthOf(c.start), c.id)}>{c.label}</Link>, {formatDate(c.start)} to {formatDate(c.end)}</span>
                  ))}
                  ). It does not block a booking, but one of the two will need moving.
                </p>
              )}
              {option.verdict === "length_needed" && <p className="text-[0.875rem] text-ink-2">Enter the vessel&apos;s length to check it against this berth.</p>}
            </div>

            <div className="md:justify-self-end">{renderAction(option, option === firstUsable)}</div>
          </li>
        );
      })}
    </ul>
  );
}
