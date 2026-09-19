"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { setVesselLengthAction } from "@/lib/actions/vessels";

/** Records a vessel's length. Never refused: a true length stands even if it turns old stays into misfits, and the form says how many. */
export function SetLengthForm({ vesselId, version, name, current, candidates }: { vesselId: string; version: number; name: string; current: number | null; candidates: number[] }) {
  const router = useRouter();
  const uid = useId();
  const [value, setValue] = useState(current !== null ? String(current) : "");
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const save = (lengthFt: number) =>
    startTransition(async () => {
      const result = await setVesselLengthAction({ vesselId, version, lengthFt });
      if (!result.ok) return setNote({ tone: "error", text: result.message });
      const { misfitsBefore, misfitsAfter } = result.data;
      setNote({ tone: "ok", text: misfitsAfter === misfitsBefore ? `Saved as verified. Stays too long for their berth: ${misfitsAfter}.` : `Saved as verified. Stays too long for their berth: ${misfitsBefore} before, ${misfitsAfter} now.` });
      router.refresh();
    });

  const submit = () => {
    const n = Number(value);
    if (value.trim() === "" || !Number.isInteger(n) || n < 1 || n > 1500) return setNote({ tone: "error", text: "Enter whole feet, e.g. 120." });
    save(n);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={uid} className="sr-only">Length of {name} in feet</label>
        <input id={uid} className="input input-sm t-num !h-[1.875rem] !w-20" inputMode="numeric" placeholder="ft" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} disabled={pending} autoComplete="off" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={submit} disabled={pending}>{pending ? "Saving..." : current === null ? "Set length" : "Update"}</button>
        {candidates.length > 1 && candidates.map((ft) => (
          <button key={ft} type="button" className="btn btn-secondary btn-sm" onClick={() => { setValue(String(ft)); save(ft); }} disabled={pending}>Use {ft} ft</button>
        ))}
      </div>
      <p aria-live="polite" className={`text-[0.8125rem] ${note ? (note.tone === "ok" ? "text-clear" : "font-medium text-revision") : "sr-only"}`}>{note?.text ?? ""}</p>
    </div>
  );
}
