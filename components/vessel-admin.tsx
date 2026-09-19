"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { createVesselAction, updateVesselAction } from "@/lib/actions/vessels";
import { VESSEL_PREFIXES } from "@/lib/domain/names";
import type { ServiceFailure } from "@/lib/services/result";
import { Pencil, Plus } from "./icons";
import { Refusal } from "./refusal";

const parseLength = (raw: string): number | null => {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 1500 ? n : null;
};

/** Register a vessel. Its length is required: without one it could never be checked against a berth. */
export function AddVesselForm() {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [name, setName] = useState("");
  const [length, setLength] = useState("");
  const [errors, setErrors] = useState<{ name?: string; length?: string }>({});
  const [failure, setFailure] = useState<ServiceFailure | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const lengthFt = parseLength(length);
    const problems = { name: name.trim() === "" ? "Enter the vessel's name." : undefined, length: lengthFt === null ? "Enter its length in whole feet, e.g. 120." : undefined };
    setErrors(problems);
    if (problems.name || lengthFt === null) return;
    startTransition(async () => {
      setFailure(null);
      const result = await createVesselAction({ name: name.trim(), prefix: prefix || null, lengthFt });
      if (!result.ok) return setFailure(result);
      setAdded(`${prefix ? prefix + " " : ""}${name.trim()}`);
      setName(""); setLength(""); setPrefix(""); setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => { setAdded(null); setOpen(true); }}><Plus size={16} />Add a vessel</button>
        {added && <p className="notice notice-ok !py-2 font-semibold" role="status">Added {added}.</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="surface rise-in flex flex-col gap-4 p-5">
      <h2 className="t-heading">New vessel</h2>
      <div className="grid gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_8rem]">
        <div>
          <label className="label" htmlFor={`${uid}-prefix`}>Type</label>
          <select id={`${uid}-prefix`} className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)}>
            <option value="">None</option>
            {VESSEL_PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-name`}>Name</label>
          <input id={`${uid}-name`} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northern Star" maxLength={80} autoFocus autoComplete="off" aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? `${uid}-name-err` : undefined} />
          {errors.name && <p id={`${uid}-name-err`} className="field-error" role="alert">{errors.name}</p>}
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-len`}>Length (ft)</label>
          <input id={`${uid}-len`} className="input t-num" inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value)} placeholder="e.g. 120" autoComplete="off" aria-invalid={errors.length ? true : undefined} aria-describedby={errors.length ? `${uid}-len-err` : undefined} />
          {errors.length && <p id={`${uid}-len-err`} className="field-error" role="alert">{errors.length}</p>}
        </div>
      </div>
      {failure && <Refusal failure={failure} />}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Adding..." : "Add vessel"}</button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => { setOpen(false); setFailure(null); setErrors({}); }}>Never mind</button>
      </div>
    </form>
  );
}

/** Correct a vessel's length in place. Refused, with the stays named, if an upcoming stay would stop fitting. */
export function VesselLengthEdit({ vesselId, version, name, lengthFt }: { vesselId: string; version: number; name: string; lengthFt: number }) {
  const router = useRouter();
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(lengthFt));
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<ServiceFailure | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (event: FormEvent) => {
    event.preventDefault();
    const len = parseLength(value);
    if (len === null) return setError("Enter whole feet, e.g. 120.");
    setError(null);
    startTransition(async () => {
      setFailure(null);
      const result = await updateVesselAction({ vesselId, version, lengthFt: len });
      if (!result.ok) return setFailure(result);
      setEditing(false);
      router.refresh();
    });
  };

  if (!editing) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setValue(String(lengthFt)); setFailure(null); setError(null); setEditing(true); }} aria-label={`Edit the length of ${name}`}>
        <Pencil size={14} />Edit
      </button>
    );
  }

  return (
    <form onSubmit={save} noValidate className="rise-in flex w-full flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor={uid} className="sr-only">Length of {name} in feet</label>
        <input id={uid} className="input t-num !h-8 !w-24" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} autoFocus autoComplete="off" aria-invalid={error ? true : undefined} />
        <span className="t-small text-ink-3">ft</span>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving..." : "Save"}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setEditing(false)}>Discard</button>
      </div>
      {error && <p className="field-error !mt-0" role="alert">{error}</p>}
      {failure && <Refusal failure={failure} />}
    </form>
  );
}
