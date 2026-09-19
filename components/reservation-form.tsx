"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import type { VesselOption } from "@/lib/db/queries/vessels";
import { VESSEL_PREFIXES } from "@/lib/domain/names";
import { VesselCombobox } from "./vessel-combobox";

export type StayDraft = {
  kind: "vessel" | "event" | "closure";
  vesselId: string | null;
  newVessel: boolean;
  vesselName: string;
  vesselPrefix: string;
  /** Length typed by the coordinator: for a new vessel, or for one with no usable length on file. */
  lengthFt: string;
  title: string;
  start: string;
  end: string;
  notes: string;
  berthId: string | null;
};

const TITLE_SUGGESTIONS = ["Community sail day", "Student tour", "Public open house", "Donor reception", "Pier repair - no docking", "Dock maintenance - restricted access"];

/**
 * "What and when". Submitting does not book anything: it puts the stay into the URL, and the
 * server answers with every berth classified (fits and free, too short, occupied). Booking
 * happens from that list, so the coordinator always sees why a berth can or cannot be used.
 */
export function ReservationForm({ basePath, vessels, initial, fixedSubject }: { basePath: string; vessels: VesselOption[]; initial: StayDraft; fixedSubject?: string }) {
  const router = useRouter();
  const uid = useId();
  const [draft, setDraft] = useState<StayDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof StayDraft>(key: K, value: StayDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const selected = vessels.find((v) => v.id === draft.vesselId) ?? null;
  const needsLength = draft.kind === "vessel" && (draft.newVessel || (selected !== null && selected.lengthFt === null));
  const editing = fixedSubject !== undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (!editing && draft.kind === "vessel") {
      if (draft.newVessel) {
        if (draft.vesselName.trim() === "") problems.vesselName = "Enter the vessel's name.";
      } else if (!draft.vesselId) problems.vessel = "Pick a vessel from the list, or add a new one.";
    }
    if (needsLength) {
      const n = Number(draft.lengthFt);
      if (draft.lengthFt.trim() === "" || !Number.isInteger(n) || n < 1 || n > 1500) problems.lengthFt = "Enter the length overall in whole feet, e.g. 120.";
    }
    if (draft.kind !== "vessel" && draft.title.trim() === "") problems.title = draft.kind === "event" ? "Name the event, e.g. Community sail day." : "Say what closes the berth, e.g. Pier repair.";
    if (draft.start === "") problems.start = "Choose the first day.";
    if (draft.end === "") problems.end = "Choose the last day.";
    if (draft.start !== "" && draft.end !== "" && draft.end < draft.start) problems.end = "The last day is before the first day.";
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    const q = new URLSearchParams();
    if (!editing) {
      q.set("kind", draft.kind);
      if (draft.kind === "vessel") {
        if (draft.newVessel) { q.set("vname", draft.vesselName.trim()); if (draft.vesselPrefix) q.set("vprefix", draft.vesselPrefix); }
        else if (draft.vesselId) q.set("vessel", draft.vesselId);
      }
    }
    if (needsLength) q.set("len", String(Number(draft.lengthFt)));
    if (draft.kind !== "vessel") q.set("title", draft.title.trim());
    q.set("start", draft.start);
    q.set("end", draft.end);
    if (draft.notes.trim() !== "") q.set("notes", draft.notes.trim());
    if (draft.berthId) q.set("berth", draft.berthId);
    router.push(`${basePath}?${q.toString()}`, { scroll: false });
  };

  const err = (key: string) => (errors[key] ? <p id={`${uid}-${key}-err`} className="field-error">{errors[key]}</p> : null);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {editing ? (
        <div>
          <p className="t-caption field-label">Reservation</p>
          <p className="font-semibold">{fixedSubject}</p>
        </div>
      ) : (
        <fieldset>
          <legend className="t-caption field-label">What is the berth for?</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {([["vessel", "A vessel"], ["event", "An event"], ["closure", "A closure"]] as const).map(([kind, label]) => (
              <label key={kind} className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name={`${uid}-kind`} value={kind} checked={draft.kind === kind} onChange={() => set("kind", kind)} className="h-4 w-4 accent-prussian" />
                {label}
              </label>
            ))}
          </div>
          <p className="field-hint">{draft.kind === "vessel" ? "Checked against each berth's length." : draft.kind === "event" ? "Occupies a berth like a vessel does, e.g. a community sail day. No length check." : "Takes a berth out of service, e.g. pier repair. No length check."}</p>
        </fieldset>
      )}

      {!editing && draft.kind === "vessel" && !draft.newVessel && (
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-vessel`}>Vessel</label>
          <div id={`${uid}-vessel`}>
            <VesselCombobox vessels={vessels} value={draft.vesselId} onChange={(id) => set("vesselId", id)} invalid={Boolean(errors.vessel)} describedBy={errors.vessel ? `${uid}-vessel-err` : undefined} />
          </div>
          {err("vessel")}
          <button type="button" className="link mt-1.5 text-[0.875rem]" onClick={() => setDraft((d) => ({ ...d, newVessel: true, vesselId: null }))}>Not in the list? Add a new vessel</button>
        </div>
      )}

      {!editing && draft.kind === "vessel" && draft.newVessel && (
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
          <div>
            <label className="t-caption field-label" htmlFor={`${uid}-vprefix`}>Type</label>
            <select id={`${uid}-vprefix`} className="input" value={draft.vesselPrefix} onChange={(e) => set("vesselPrefix", e.target.value)}>
              <option value="">None</option>
              {VESSEL_PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="t-caption field-label" htmlFor={`${uid}-vname`}>New vessel name</label>
            <input id={`${uid}-vname`} className="input" value={draft.vesselName} onChange={(e) => set("vesselName", e.target.value)} aria-invalid={errors.vesselName ? true : undefined} aria-describedby={errors.vesselName ? `${uid}-vesselName-err` : undefined} placeholder="e.g. Northern Star" autoComplete="off" />
          </div>
          <div className="col-span-2">
            {err("vesselName")}
            <button type="button" className="link text-[0.875rem]" onClick={() => set("newVessel", false)}>Pick an existing vessel instead</button>
          </div>
        </div>
      )}

      {needsLength && (
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-len`}>Length overall (ft)</label>
          <input id={`${uid}-len`} className="input t-num !w-32" inputMode="numeric" value={draft.lengthFt} onChange={(e) => set("lengthFt", e.target.value)} aria-invalid={errors.lengthFt ? true : undefined} aria-describedby={`${uid}-len-hint${errors.lengthFt ? ` ${uid}-lengthFt-err` : ""}`} placeholder="e.g. 120" autoComplete="off" />
          <p id={`${uid}-len-hint`} className="field-hint">
            {draft.newVessel ? "Needed to check which berths the vessel fits." : selected?.lengthStatus === "conflict" ? `The registry lists two lengths for ${selected.displayName}. Enter the right one; it is saved as verified.` : `There is no length on file for ${selected?.displayName ?? "this vessel"}. Enter it once; it is saved to the registry as verified.`}
          </p>
          {err("lengthFt")}
        </div>
      )}

      {draft.kind !== "vessel" && (
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-title`}>{draft.kind === "event" ? "Event name" : "Reason for the closure"}</label>
          <input id={`${uid}-title`} className="input" list={`${uid}-titles`} value={draft.title} onChange={(e) => set("title", e.target.value)} aria-invalid={errors.title ? true : undefined} aria-describedby={errors.title ? `${uid}-title-err` : undefined} autoComplete="off" />
          <datalist id={`${uid}-titles`}>{TITLE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
          {err("title")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-start`}>First day</label>
          <input id={`${uid}-start`} type="date" className="input t-num" min="1997-01-01" value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value, end: d.end === "" || d.end < e.target.value ? e.target.value : d.end }))} aria-invalid={errors.start ? true : undefined} aria-describedby={errors.start ? `${uid}-start-err` : undefined} />
          {err("start")}
        </div>
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-end`}>Last day (inclusive)</label>
          <input id={`${uid}-end`} type="date" className="input t-num" min={draft.start || "1997-01-01"} value={draft.end} onChange={(e) => set("end", e.target.value)} aria-invalid={errors.end ? true : undefined} aria-describedby={errors.end ? `${uid}-end-err` : undefined} />
          {err("end")}
        </div>
      </div>

      <div>
        <label className="t-caption field-label" htmlFor={`${uid}-notes`}>Notes (optional)</label>
        <textarea id={`${uid}-notes`} className="input" rows={2} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. ETA 1200, fueling at 0800" />
      </div>

      <div>
        <button type="submit" className="btn btn-primary">{editing ? "Check berths for these dates" : "Find a berth"}</button>
      </div>
    </form>
  );
}
