"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import type { VesselOption } from "@/lib/db/queries/vessels";
import { VESSEL_PREFIXES } from "@/lib/domain/names";
import { KIND_ICON, Plus } from "./icons";
import { VesselCombobox } from "./vessel-combobox";

export type StayDraft = {
  kind: "vessel" | "event" | "closure";
  vesselId: string | null;
  newVessel: boolean;
  vesselName: string;
  vesselPrefix: string;
  vesselLengthFt: string;
  title: string;
  start: string;
  end: string;
  notes: string;
  berthId: string | null;
};

const KINDS = [["vessel", "Vessel"], ["event", "Event"], ["closure", "Closure"]] as const;
const KIND_HINT = { vessel: "Checked against the length of every berth.", event: "Takes a berth like a vessel does, e.g. a community sail day.", closure: "Takes a berth out of service, e.g. pier repair." } as const;
const TITLE_SUGGESTIONS = ["Community sail day", "Student tour", "Public open house", "Donor reception", "Pier repair", "Dock maintenance"];

/**
 * "What and when". Submitting does not book anything: it puts the stay in the URL and the
 * server answers with every berth checked. Booking happens from that list, so the coordinator
 * always sees why a berth can or cannot be used.
 */
export function ReservationForm({ basePath, vessels, initial, today, fixedSubject, lockStart = false, hasResults = false }: { basePath: string; vessels: VesselOption[]; initial: StayDraft; today: string; fixedSubject?: string; lockStart?: boolean; hasResults?: boolean }) {
  const router = useRouter();
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<StayDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showNotes, setShowNotes] = useState(initial.notes !== "");
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof StayDraft>(key: K, value: StayDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const editing = fixedSubject !== undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (!editing && draft.kind === "vessel") {
      if (draft.newVessel) {
        if (draft.vesselName.trim() === "") problems.vesselName = "Enter the vessel's name.";
        const n = Number(draft.vesselLengthFt);
        if (draft.vesselLengthFt.trim() === "" || !Number.isInteger(n) || n < 1 || n > 1500) problems.vesselLengthFt = "Enter its length in whole feet, e.g. 120.";
      } else if (!draft.vesselId) problems.vessel = "Pick a vessel from the list, or add a new one.";
    }
    if (draft.kind !== "vessel" && draft.title.trim() === "") problems.title = draft.kind === "event" ? "Name the event, e.g. Community sail day." : "Say what closes the berth, e.g. Pier repair.";
    if (draft.start === "") problems.start = "Choose the first day.";
    else if (!lockStart && draft.start < today) problems.start = "Reservations start today or later.";
    if (draft.end === "") problems.end = "Choose the last day.";
    else if (draft.start !== "" && draft.end < draft.start) problems.end = "The last day is before the first day.";
    else if (draft.end < today) problems.end = "The last day is already in the past.";
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      // Move focus to the first problem so it is read out and the coordinator lands where the fix is.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    const q = new URLSearchParams();
    if (!editing) {
      q.set("kind", draft.kind);
      if (draft.kind === "vessel") {
        if (draft.newVessel) {
          q.set("vname", draft.vesselName.trim());
          if (draft.vesselPrefix) q.set("vprefix", draft.vesselPrefix);
          q.set("len", String(Number(draft.vesselLengthFt)));
        } else if (draft.vesselId) q.set("vessel", draft.vesselId);
      }
    }
    if (draft.kind !== "vessel") q.set("title", draft.title.trim());
    q.set("start", draft.start);
    q.set("end", draft.end);
    if (draft.notes.trim() !== "") q.set("notes", draft.notes.trim());
    if (draft.berthId) q.set("berth", draft.berthId);
    startTransition(() => router.push(`${basePath}?${q.toString()}`, { scroll: false }));
  };

  const err = (key: string) => (errors[key] ? <p id={`${uid}-${key}-err`} className="field-error" role="alert">{errors[key]}</p> : null);

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
      {editing ? (
        <p className="text-[1.0625rem] font-bold">{fixedSubject}</p>
      ) : (
        <fieldset>
          <legend className="t-caption field-label">What needs a berth?</legend>
          <div className="segmented">
            {KINDS.map(([kind, label]) => {
              const KindIcon = KIND_ICON[kind];
              return (
                <label key={kind}>
                  <input type="radio" name={`${uid}-kind`} value={kind} checked={draft.kind === kind} onChange={() => set("kind", kind)} />
                  <KindIcon size={16} />{label}
                </label>
              );
            })}
          </div>
          <p className="field-hint">{KIND_HINT[draft.kind]}</p>
        </fieldset>
      )}

      {!editing && draft.kind === "vessel" && !draft.newVessel && (
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-vessel`}>Vessel</label>
          <VesselCombobox id={`${uid}-vessel`} vessels={vessels} value={draft.vesselId} onChange={(id) => set("vesselId", id)} invalid={Boolean(errors.vessel)} describedBy={errors.vessel ? `${uid}-vessel-err` : undefined} />
          {err("vessel")}
          <button type="button" className="link mt-2 inline-flex items-center gap-1 text-[0.875rem]" onClick={() => setDraft((d) => ({ ...d, newVessel: true, vesselId: null }))}><Plus size={14} />Add a new vessel</button>
        </div>
      )}

      {!editing && draft.kind === "vessel" && draft.newVessel && (
        <div className="rise-in flex flex-col gap-3 bg-sheet-sunk p-3.5">
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2.5">
            <div>
              <label className="t-caption field-label" htmlFor={`${uid}-vprefix`}>Type</label>
              <select id={`${uid}-vprefix`} className="input" value={draft.vesselPrefix} onChange={(e) => set("vesselPrefix", e.target.value)}>
                <option value="">None</option>
                {VESSEL_PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="t-caption field-label" htmlFor={`${uid}-vname`}>New vessel name</label>
              <input id={`${uid}-vname`} className="input" value={draft.vesselName} onChange={(e) => set("vesselName", e.target.value)} aria-invalid={errors.vesselName ? true : undefined} aria-describedby={errors.vesselName ? `${uid}-vesselName-err` : undefined} placeholder="e.g. Northern Star" autoComplete="off" maxLength={80} />
            </div>
          </div>
          {err("vesselName")}
          <div>
            <label className="t-caption field-label" htmlFor={`${uid}-vlen`}>Length (ft)</label>
            <input id={`${uid}-vlen`} className="input t-num !w-32" inputMode="numeric" value={draft.vesselLengthFt} onChange={(e) => set("vesselLengthFt", e.target.value)} aria-invalid={errors.vesselLengthFt ? true : undefined} aria-describedby={`${uid}-vlen-hint${errors.vesselLengthFt ? ` ${uid}-vesselLengthFt-err` : ""}`} placeholder="e.g. 120" autoComplete="off" />
            <p id={`${uid}-vlen-hint`} className="field-hint">Needed to check which berths it fits. Saved to the vessel list.</p>
            {err("vesselLengthFt")}
          </div>
          <button type="button" className="link self-start text-[0.875rem]" onClick={() => set("newVessel", false)}>Pick an existing vessel instead</button>
        </div>
      )}

      {draft.kind !== "vessel" && (
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-title`}>{draft.kind === "event" ? "Event name" : "Reason for the closure"}</label>
          <input id={`${uid}-title`} className="input" list={`${uid}-titles`} value={draft.title} onChange={(e) => set("title", e.target.value)} aria-invalid={errors.title ? true : undefined} aria-describedby={errors.title ? `${uid}-title-err` : undefined} autoComplete="off" maxLength={120} />
          <datalist id={`${uid}-titles`}>{TITLE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
          {err("title")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-start`}>First day</label>
          <input id={`${uid}-start`} type="date" className="input t-num" min={lockStart ? undefined : today} disabled={lockStart} value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value, end: d.end === "" || d.end < e.target.value ? e.target.value : d.end }))} aria-invalid={errors.start ? true : undefined} aria-describedby={errors.start ? `${uid}-start-err` : lockStart ? `${uid}-start-hint` : undefined} />
          {lockStart && <p id={`${uid}-start-hint`} className="field-hint">Already started, so this cannot move.</p>}
          {err("start")}
        </div>
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-end`}>Last day</label>
          <input id={`${uid}-end`} type="date" className="input t-num" min={draft.start > today ? draft.start : today} value={draft.end} onChange={(e) => set("end", e.target.value)} aria-invalid={errors.end ? true : undefined} aria-describedby={errors.end ? `${uid}-end-err` : undefined} />
          {err("end")}
        </div>
      </div>

      {showNotes ? (
        <div className="rise-in">
          <label className="t-caption field-label" htmlFor={`${uid}-notes`}>Notes</label>
          <textarea id={`${uid}-notes`} className="input" rows={2} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. ETA 1200, fueling at 0800" maxLength={1000} autoFocus={initial.notes === ""} />
        </div>
      ) : (
        <button type="button" className="link inline-flex items-center gap-1 self-start text-[0.875rem]" onClick={() => setShowNotes(true)}><Plus size={14} />Add a note</button>
      )}

      <button type="submit" className={`btn ${hasResults ? "btn-secondary" : "btn-primary"} w-full`} disabled={pending}>
        {pending ? "Checking berths..." : hasResults ? "Check again" : editing ? "Check berths for these dates" : "Find a berth"}
      </button>
    </form>
  );
}
