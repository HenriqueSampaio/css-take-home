import Link from "next/link";
import type { ReservationDetail } from "@/lib/db/queries/reservations";
import { formatDate, type ISODate, type YearMonth } from "@/lib/domain/dates";
import { describePhase, stayPhase } from "@/lib/domain/phase";
import { lengthInDays } from "@/lib/domain/ranges";
import { scheduleHref } from "@/lib/ui/params";
import { DrawerShell } from "./drawer-shell";
import { FitGauge, FitSentence } from "./fit-gauge";
import { Cross, KIND_ICON, KIND_LABEL } from "./icons";
import { ReservationActions } from "./reservation-actions";

const KIND_PILL = { vessel: "tag tag-accent", event: "tag", closure: "tag" } as const;

/** The selected reservation. Driven by `?r=`, so it is a link, not client state: the back button closes it. */
export function ReservationDrawer({ detail, month, today, maxBerthFt, showCancelled }: { detail: ReservationDetail; month: YearMonth; today: ISODate; maxBerthFt: number; showCancelled: boolean }) {
  const days = lengthInDays({ start: detail.startDate, end: detail.endDate });
  const phase = stayPhase({ start: detail.startDate, end: detail.endDate }, today);
  const KindIcon = KIND_ICON[detail.kind];
  const closeHref = scheduleHref(month, null, { showCancelled });
  const cancelled = detail.status === "cancelled";

  return (
    <DrawerShell key={detail.id} closeHref={closeHref} returnFocusId={`stay-${detail.id}`} labelledBy="drawer-title">
      <div className="flex items-start justify-between gap-3 border-b border-line-strong bg-sheet-sunk px-5 py-4">
        <div className="min-w-0">
          <p className="mb-2 flex flex-wrap gap-1.5">
            <span className={KIND_PILL[detail.kind]}><KindIcon size={13} />{KIND_LABEL[detail.kind]}</span>
            {cancelled ? <span className="tag"><Cross size={12} />Cancelled</span> : <span className={`tag ${phase.kind === "in_port" ? "tag-clear" : ""}`}>{describePhase(phase)}</span>}
          </p>
          <h2 id="drawer-title" className={`t-heading break-words ${cancelled ? "text-ink-3 line-through" : ""}`}>{detail.label}</h2>
        </div>
        <Link href={closeHref} scroll={false} className="btn btn-secondary btn-icon btn-sm shrink-0" aria-label="Close"><Cross size={18} /></Link>
      </div>

      <div className="flex flex-col gap-5 px-5 py-5">
        <div className="border border-line-strong bg-sheet p-3.5">
          <p className="text-[1.0625rem] font-bold leading-snug">
            {formatDate(detail.startDate, "long")}
            {detail.endDate !== detail.startDate && <><span className="font-medium text-ink-3"> to </span>{formatDate(detail.endDate, "long")}</>}
          </p>
          <p className="t-data mt-1 text-ink-2"><strong>{days} {days === 1 ? "day" : "days"}</strong> at <strong>{detail.berth.name}</strong> <span className="t-num">({detail.berth.lengthFt} ft)</span></p>
        </div>

        {detail.fit && (
          <div className="flex flex-col gap-2">
            <FitGauge fit={detail.fit} scaleFt={maxBerthFt} />
            <FitSentence fit={detail.fit} />
          </div>
        )}

        {detail.notes !== "" && (
          <div>
            <h3 className="t-caption field-label">Notes</h3>
            <p className="whitespace-pre-line text-ink-2">{detail.notes}</p>
          </div>
        )}

        <ReservationActions id={detail.id} version={detail.version} status={detail.status} ended={phase.kind === "completed"} showCancelled={showCancelled} />
      </div>
    </DrawerShell>
  );
}
