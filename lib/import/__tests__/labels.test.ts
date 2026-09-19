import { describe, expect, it } from "vitest";
import { classifyLabel, isOccupantLabel, VOCAB } from "../labels";

describe("classifyLabel", () => {
  it("recognises every vessel prefix, including the OS/V spelling", () => {
    for (const prefix of ["R/V", "M/V", "M/Y", "S/V", "S/Y", "F/V", "OSV", "OS/V", "Tug", "Barge"]) {
      const label = classifyLabel(`${prefix} Golden Compass`);
      expect(label.kind, prefix).toBe("vessel");
      expect(label).toMatchObject({ nameKey: "GOLDEN COMPASS" });
    }
    expect(classifyLabel("OS/V Iron Meridian")).toMatchObject({ kind: "vessel", prefix: "OSV" });
    expect(classifyLabel("TUG  western   current")).toMatchObject({ kind: "vessel", prefix: "Tug", nameKey: "WESTERN CURRENT" });
  });

  it("maps every vocabulary string to its class, in any case and spacing", () => {
    for (const t of VOCAB.closures) expect(classifyLabel(t.toUpperCase())).toMatchObject({ kind: "closure", title: t, unknown: false });
    for (const t of VOCAB.events) expect(classifyLabel(`  ${t.replace(" ", "   ")} `)).toMatchObject({ kind: "event", title: t, unknown: false });
    for (const t of VOCAB.notes) expect(classifyLabel(t.toLowerCase())).toMatchObject({ kind: "note", note: t });
  });

  it("keeps the three lists disjoint", () => {
    const all = [...VOCAB.closures, ...VOCAB.events, ...VOCAB.notes].map((t) => t.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
  });

  it("calls bare numbers junk, whether typed as numbers or as text", () => {
    for (const v of [1400, 6, 29, "1030", " 11 "]) expect(classifyLabel(v).kind).toBe("junk");
  });

  it("keeps unknown text as an event and flags it, rather than dropping it", () => {
    expect(classifyLabel("Mystery visit")).toEqual({ kind: "event", text: "Mystery visit", title: "Mystery visit", unknown: true });
  });

  it("separates labels that claim the berth from notes and junk", () => {
    expect(isOccupantLabel(classifyLabel("R/V Blue Reef"))).toBe(true);
    expect(isOccupantLabel(classifyLabel("Holiday"))).toBe(true);
    expect(isOccupantLabel(classifyLabel("Wire spooling"))).toBe(true);
    expect(isOccupantLabel(classifyLabel("ETA 1200"))).toBe(false);
    expect(isOccupantLabel(classifyLabel(1400))).toBe(false);
  });
});
