"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { createBerthAction, restoreBerthAction, retireBerthAction, updateBerthAction } from "@/lib/actions/berths";
import type { ServiceFailure } from "@/lib/services/result";
import { Archive, Pencil, Plus, Undo } from "./icons";
import { Refusal } from "./refusal";

const parseLength = (raw: string): number | null => {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 2000 ? n : null;
};

/** Add a berth: a name and a length are all a berth is. It appears on the schedule straight away. */
export function AddBerthForm() {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [length, setLength] = useState("");
  const [errors, setErrors] = useState<{ name?: string; length?: string }>({});
  const [failure, setFailure] = useState<ServiceFailure | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const lengthFt = parseLength(length);
    const problems = { name: name.trim().length < 2 ? "Give the berth a name." : undefined, length: lengthFt === null ? "Enter its length in whole feet, e.g. 120." : undefined };
    setErrors(problems);
    if (problems.name || problems.length || lengthFt === null) return;
    startTransition(async () => {
      setFailure(null);
      const result = await createBerthAction({ name: name.trim(), lengthFt });
      if (!result.ok) return setFailure(result);
      setAdded(name.trim());
      setName(""); setLength(""); setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => { setAdded(null); setOpen(true); }}><Plus size={16} />Add a berth</button>
        {added && <p className="notice notice-clear !py-2 font-semibold" role="status">Added {added}. It is on the schedule now.</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="sheet rise-in flex flex-col gap-4 p-5">
      <h2 className="t-heading">New berth</h2>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-name`}>Name</label>
          <input id={`${uid}-name`} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. East Pier" maxLength={60} autoFocus autoComplete="off" aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? `${uid}-name-err` : undefined} />
          {errors.name && <p id={`${uid}-name-err`} className="field-error" role="alert">{errors.name}</p>}
        </div>
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-len`}>Length (ft)</label>
          <input id={`${uid}-len`} className="input t-num" inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value)} placeholder="e.g. 120" autoComplete="off" aria-invalid={errors.length ? true : undefined} aria-describedby={errors.length ? `${uid}-len-err` : undefined} />
          {errors.length && <p id={`${uid}-len-err`} className="field-error" role="alert">{errors.length}</p>}
        </div>
      </div>
      <p className="field-hint !mt-0">Only vessels this long or shorter can be booked on it.</p>
      {failure && <Refusal failure={failure} />}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Adding..." : "Add berth"}</button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => { setOpen(false); setFailure(null); setErrors({}); }}>Never mind</button>
      </div>
    </form>
  );
}

/** Correct a berth's name or length, or retire it. Both are refused, with the stays named, if an upcoming stay depends on it. */
export function BerthRowActions({ berthId, version, name, lengthFt, canRetire }: { berthId: string; version: number; name: string; lengthFt: number; canRetire: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [mode, setMode] = useState<"idle" | "edit" | "retire">("idle");
  const [draftName, setDraftName] = useState(name);
  const [draftLength, setDraftLength] = useState(String(lengthFt));
  const [failure, setFailure] = useState<ServiceFailure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (event: FormEvent) => {
    event.preventDefault();
    const len = parseLength(draftLength);
    if (draftName.trim().length < 2) return setError("Give the berth a name.");
    if (len === null) return setError("Enter its length in whole feet, e.g. 120.");
    setError(null);
    startTransition(async () => {
      setFailure(null);
      const result = await updateBerthAction({ berthId, version, name: draftName.trim(), lengthFt: len });
      if (!result.ok) return setFailure(result);
      setMode("idle");
      router.refresh();
    });
  };

  const retire = () =>
    startTransition(async () => {
      setFailure(null);
      const result = await retireBerthAction({ berthId, version });
      if (!result.ok) return setFailure(result);
      setMode("idle");
      router.refresh();
    });

  if (mode === "idle") {
    return (
      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraftName(name); setDraftLength(String(lengthFt)); setFailure(null); setMode("edit"); }}><Pencil size={14} />Edit</button>
        {canRetire && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFailure(null); setMode("retire"); }}><Archive size={14} />Retire</button>}
      </div>
    );
  }

  if (mode === "retire") {
    return (
      <div className="rise-in flex w-full flex-col gap-2 bg-sheet-sunk p-3.5 sm:max-w-md">
        <p className="text-[0.875rem]"><strong>Retire {name}?</strong> It comes off the schedule and can no longer be booked. You can bring it back later.</p>
        {failure && <Refusal failure={failure} />}
        <div className="flex gap-2">
          <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={retire}>{pending ? "Retiring..." : "Retire berth"}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} autoFocus onClick={() => setMode("idle")}>Keep it</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={save} noValidate className="rise-in flex w-full flex-col gap-3 bg-sheet-sunk p-3.5 sm:max-w-md">
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2.5">
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-name`}>Name</label>
          <input id={`${uid}-name`} className="input" value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={60} autoFocus autoComplete="off" />
        </div>
        <div>
          <label className="t-caption field-label" htmlFor={`${uid}-len`}>Length (ft)</label>
          <input id={`${uid}-len`} className="input t-num" inputMode="numeric" value={draftLength} onChange={(e) => setDraftLength(e.target.value)} autoComplete="off" />
        </div>
      </div>
      {error && <p className="field-error !mt-0" role="alert">{error}</p>}
      {failure && <Refusal failure={failure} />}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving..." : "Save changes"}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => { setMode("idle"); setFailure(null); setError(null); }}>Discard</button>
      </div>
    </form>
  );
}

export function RestoreBerthButton({ berthId, version }: { berthId: string; version: number }) {
  const router = useRouter();
  const [failure, setFailure] = useState<ServiceFailure | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => startTransition(async () => { const r = await restoreBerthAction({ berthId, version }); if (r.ok) router.refresh(); else setFailure(r); })}>
        <Undo size={14} />{pending ? "Restoring..." : "Bring back"}
      </button>
      {failure && <Refusal failure={failure} />}
    </div>
  );
}
