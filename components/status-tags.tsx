import type { LengthStatus } from "@/lib/domain/fit";
import { Check, Cross, Info, Overrun, TriangleMark } from "./icons";

/** Every status is a glyph plus a word; colour only reinforces. */
export function ReservationStatusTag({ status }: { status: "confirmed" | "needs_review" | "cancelled" }) {
  if (status === "confirmed") return <span className="tag tag-clear"><Check size={12} />Confirmed</span>;
  if (status === "needs_review") return <span className="tag tag-caution"><TriangleMark size={12} />Needs review</span>;
  return <span className="tag"><Cross size={12} />Cancelled</span>;
}

export function KindTag({ kind }: { kind: "vessel" | "event" | "closure" }) {
  const label = kind === "vessel" ? "Vessel" : kind === "event" ? "Event" : "Closure";
  return <span className="tag">{label}</span>;
}

const LENGTH_COPY: Record<LengthStatus, { label: string; className: string; title: string }> = {
  verified: { label: "Verified", className: "tag tag-clear", title: "Length confirmed: an exact registry match, or entered by the coordinator." },
  probable: { label: "Probable", className: "tag tag-accent", title: "The registry lists this name under a different vessel type prefix. Usable for the fit check, worth confirming." },
  conflict: { label: "Conflicting", className: "tag tag-caution", title: "The registry gives two different lengths for this vessel. Pick the right one before booking." },
  unknown: { label: "Unknown", className: "tag tag-caution", title: "No length on file. It must be entered before this vessel can be booked." },
};

export function LengthStatusTag({ status }: { status: LengthStatus }) {
  const copy = LENGTH_COPY[status];
  const glyph = status === "verified" ? <Check size={12} /> : status === "probable" ? <Info size={12} /> : <TriangleMark size={12} />;
  return <span className={copy.className} title={copy.title}>{glyph}{copy.label}</span>;
}

export function TooLongTag({ overByFt }: { overByFt: number }) {
  return <span className="tag tag-danger"><Overrun size={12} />{overByFt} ft too long</span>;
}
