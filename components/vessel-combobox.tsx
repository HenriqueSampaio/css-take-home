"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { VesselOption } from "@/lib/db/queries/vessels";

const MAX_SHOWN = 8;

/**
 * Searchable vessel picker over the whole registry (a few hundred rows, shipped to the client).
 * Standard ARIA combobox: arrows move, Enter picks, Escape closes. Each option shows the
 * length on file, because that is what decides where the vessel can go.
 */
export function VesselCombobox({ vessels, value, onChange, invalid, describedBy }: { vessels: VesselOption[]; value: string | null; onChange: (id: string | null) => void; invalid?: boolean; describedBy?: string }) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => vessels.find((v) => v.id === value) ?? null, [vessels, value]);
  const [query, setQuery] = useState(selected?.displayName ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "" || (selected && q === selected.displayName.toLowerCase())) return vessels;
    const starts = vessels.filter((v) => v.name.toLowerCase().startsWith(q) || v.displayName.toLowerCase().startsWith(q));
    const contains = vessels.filter((v) => !starts.includes(v) && v.displayName.toLowerCase().includes(q));
    return [...starts, ...contains];
  }, [vessels, query, selected]);
  const shown = matches.slice(0, MAX_SHOWN);

  const pick = (v: VesselOption) => {
    onChange(v.id);
    setQuery(v.displayName);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${listId}-${shown[active].id}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder="Type a vessel name, e.g. Golden Compass"
        className="input"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); if (value) onChange(null); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label="Vessels" className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-auto border border-ink bg-sheet-raised shadow-floating">
          {shown.map((v, i) => (
            <li
              key={v.id}
              id={`${listId}-${v.id}`}
              role="option"
              aria-selected={v.id === value}
              // mousedown, not click: it fires before the input's blur closes the list
              onMouseDown={(e) => { e.preventDefault(); pick(v); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-2.5 py-1.5 ${i === active ? "bg-prussian-tone" : ""}`}
            >
              <span className="truncate">{v.displayName}</span>
              <span className="t-data shrink-0 text-ink-2">
                {v.lengthFt !== null ? `${v.lengthFt} ft` : v.lengthStatus === "conflict" ? "two lengths on file" : "no length on file"}
                {v.lengthStatus === "probable" ? " (probable)" : ""}
              </span>
            </li>
          ))}
          {matches.length > MAX_SHOWN && <li className="t-data border-t border-line px-2.5 py-1.5 text-ink-2" aria-hidden>{matches.length - MAX_SHOWN} more. Keep typing to narrow the list.</li>}
          {matches.length === 0 && <li className="px-2.5 py-2 text-[0.875rem] text-ink-2">No vessel by that name. Use &ldquo;Add a new vessel&rdquo; below.</li>}
        </ul>
      )}
    </div>
  );
}
