"use client";

import { useId, useMemo, useState } from "react";
import type { VesselOption } from "@/lib/db/queries/vessels";
import { Search } from "./icons";

const MAX_SHOWN = 7;

/**
 * Searchable vessel picker over the whole registry. Standard ARIA combobox: arrows move,
 * Enter picks, Escape closes. Each option shows the vessel's length, because that is what
 * decides where it can go.
 */
export function VesselCombobox({ id, vessels, value, onChange, invalid, describedBy }: { id: string; vessels: VesselOption[]; value: string | null; onChange: (id: string | null) => void; invalid?: boolean; describedBy?: string }) {
  const listId = useId();
  const selected = useMemo(() => vessels.find((v) => v.id === value) ?? null, [vessels, value]);
  const [query, setQuery] = useState(selected?.displayName ?? "");
  const [open, setOpen] = useState(false);
  // -1 = nothing highlighted: Enter then submits the form instead of picking a row the user never chose.
  const [active, setActive] = useState(-1);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "" || (selected && q === selected.displayName.toLowerCase())) return vessels;
    const starts = vessels.filter((v) => v.name.toLowerCase().startsWith(q) || v.displayName.toLowerCase().startsWith(q));
    const contains = vessels.filter((v) => !starts.includes(v) && v.displayName.toLowerCase().includes(q));
    return [...starts, ...contains];
  }, [vessels, query, selected]);
  const shown = matches.slice(0, MAX_SHOWN);
  const openList = () => { setOpen(true); setActive(selected ? shown.findIndex((v) => v.id === selected.id) : -1); };
  const pick = (v: VesselOption) => { onChange(v.id); setQuery(v.displayName); setOpen(false); };

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-3 text-ink-3" />
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 && shown[active] ? `${listId}-${shown[active].id}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search vessels, e.g. Far Horizon"
        className="input !pl-9"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(e.target.value.trim() === "" ? -1 : 0); if (value) onChange(null); }}
        onFocus={openList}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) return openList(); setActive((i) => Math.min(i + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); if (!open) return openList(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && open && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active]); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label="Vessels" className="fade-in absolute inset-x-0 top-full z-20 mt-1.5 max-h-80 overflow-auto bg-sheet-raised p-1 shadow-[var(--shadow-float)]">
          {shown.map((v, i) => (
            <li
              key={v.id}
              id={`${listId}-${v.id}`}
              role="option"
              aria-selected={v.id === value}
              // mousedown, not click: it fires before the input's blur closes the list
              onMouseDown={(e) => { e.preventDefault(); pick(v); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-2.5 py-2 ${i === active ? "bg-prussian-tone" : ""}`}
            >
              <span className={`truncate ${v.id === value ? "font-bold" : "font-medium"}`}>{v.displayName}</span>
              <span className="t-data t-num shrink-0 font-semibold text-ink-2">{v.lengthFt} ft</span>
            </li>
          ))}
          {matches.length > MAX_SHOWN && <li role="presentation" className="t-data px-2.5 py-2 text-ink-3">{matches.length - MAX_SHOWN} more. Keep typing to narrow it down.</li>}
          {matches.length === 0 && <li role="presentation" className="px-2.5 py-2 text-[0.875rem] text-ink-2">No vessel by that name. Add it as a new vessel below.</li>}
        </ul>
      )}
      <p className="sr-only" role="status">{open ? (matches.length === 0 ? "No vessel by that name." : `${matches.length} ${matches.length === 1 ? "vessel matches" : "vessels match"}.`) : ""}</p>
    </div>
  );
}
