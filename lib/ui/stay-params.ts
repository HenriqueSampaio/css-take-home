import { isISODate, type ISODate } from "../domain/dates";
import { firstParam, parseDateParam, parseIdParam, type SearchParams } from "./params";

export type StayParams = {
  kind: "vessel" | "event" | "closure";
  vesselId: string | null;
  newVesselName: string | null;
  newVesselPrefix: string | null;
  lengthFt: number | null;
  title: string | null;
  start: ISODate | null;
  end: ISODate | null;
  notes: string;
  berthId: string | null;
};

const text = (value: string | string[] | undefined, max: number): string | null => {
  const t = firstParam(value)?.trim().slice(0, max);
  return t ? t : null;
};

/** The requested stay as carried in the URL by the reservation form. Everything is re-validated by the service on booking. */
export function parseStayParams(sp: SearchParams): StayParams {
  const kindRaw = firstParam(sp.kind);
  const len = Number(firstParam(sp.len));
  const start = parseDateParam(sp.start);
  const end = parseDateParam(sp.end);
  return {
    kind: kindRaw === "event" || kindRaw === "closure" ? kindRaw : "vessel",
    vesselId: parseIdParam(sp.vessel),
    newVesselName: text(sp.vname, 80),
    newVesselPrefix: text(sp.vprefix, 8),
    lengthFt: Number.isInteger(len) && len >= 1 && len <= 1500 ? len : null,
    title: text(sp.title, 120),
    start,
    end: end && start && isISODate(end) && end >= start ? end : start && !end ? null : end,
    notes: text(sp.notes, 1000) ?? "",
    berthId: parseIdParam(sp.berth),
  };
}
