import Link from "next/link";
import type { ReactNode } from "react";
import type { BerthOption } from "@/lib/domain/availability";
import { formatDate, yearMonthOf } from "@/lib/domain/dates";
import { scheduleHref } from "@/lib/ui/params";
import { FitBar, FitSentence } from "./fit-bar";
import { Check, ChevronDown, Cross, Ruler } from "./icons";

/**
 * Every berth, checked for one requested stay. The answer comes first: the berths that can
 * take it, each with one Book button. The berths that cannot are folded away with their
 * reasons one click down (and opened automatically when nothing is available).
 */
export function BerthResults({ options, scaleFt, pickedBerthId, renderAction }: { options: BerthOption[]; scaleFt: number; pickedBerthId: string | null; renderAction: (option: BerthOption, isBest: boolean) => ReactNode }) {
  const usable = options.filter((o) => o.verdict === "available");
  const blocked = options.filter((o) => o.verdict !== "available");
  const best = usable.find((o) => o.berth.id === pickedBerthId) ?? usable[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      {usable.length > 0 && (
        <ul className="surface rows cascade overflow-hidden">
          {usable.map((option, i) => (
            <Row key={option.berth.id} option={option} index={i} scaleFt={scaleFt} picked={option.berth.id === pickedBerthId} action={renderAction(option, option === best)} />
          ))}
        </ul>
      )}

      {blocked.length > 0 && (
        <details className="group" open={usable.length === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg py-1 text-[0.875rem] font-semibold text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown size={16} className="transition-transform duration-200 group-open:rotate-180" />
            {usable.length === 0 ? "Why none of them work" : `Show the ${blocked.length} that cannot take it`}
          </summary>
          <ul className="surface rows cascade mt-2 overflow-hidden">
            {blocked.map((option, i) => (
              <Row key={option.berth.id} option={option} index={i} scaleFt={scaleFt} picked={option.berth.id === pickedBerthId} action={renderAction(option, false)} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Row({ option, index, scaleFt, picked, action }: { option: BerthOption; index: number; scaleFt: number; picked: boolean; action: ReactNode }) {
  const ok = option.verdict === "available";
  return (
    <li className="grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" style={{ ["--i" as string]: Math.min(index, 6) }}>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={`t-title ${ok ? "" : "text-ink-2"}`}>{option.berth.name}</span>
          <span className="t-small t-num text-ink-3">{option.berth.lengthFt} ft</span>
          {option.verdict === "available" && <span className="pill pill-ok"><Check size={12} />{option.fit ? "Fits and free" : "Free"}</span>}
          {option.verdict === "too_short" && <span className="pill pill-danger"><Ruler size={12} />Too short</span>}
          {option.verdict === "occupied" && <span className="pill pill-danger"><Cross size={12} />Occupied</span>}
          {picked && <span className="pill pill-brand">You picked this one</span>}
        </p>

        {option.fit && (
          <div className="flex max-w-md flex-col gap-1.5">
            <FitBar fit={option.fit} scaleFt={scaleFt} />
            <FitSentence fit={option.fit} />
          </div>
        )}

        {option.conflicts.length > 0 && (
          <p className="t-small text-ink-2">
            Taken by{" "}
            {option.conflicts.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link className="link" href={scheduleHref(yearMonthOf(c.start), c.id)}>{c.label}</Link> <span className="t-num">({formatDate(c.start, "short")} to {formatDate(c.end, "short")})</span>
              </span>
            ))}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </li>
  );
}
