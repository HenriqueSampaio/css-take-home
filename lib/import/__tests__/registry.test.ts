import { describe, expect, it } from "vitest";
import { linkVessels, parseRegistry, type GridVessel } from "../registry";
import { SheetBuilder } from "./fixture";

function science() {
  return new SheetBuilder("Science")
    .set("A1", "VESSEL").set("B1", "OPERATOR")
    .set("A2", "R/V Iron Skua 72'").set("B2", "Harbor Institute")
    .set("A3", "Cell: 555-0198").set("B3", "Capt. Cameron Underhill")
    .set("A4", "Capt. Drew Garland").set("A5", "rowan.oakes@example.com").set("A6", "https://www.example.org/vessel 12'")
    .set("A7", "LOA: 145', Draft: 12'")
    .set("A8", "R/V High Reef 32'")
    .set("A9", "R/V High Sound 32'").set("B9", "LOA: 65', Draft: 4'")
    .set("A10", "R/V Iron Ketch 46'").set("C10", "LOA: 46', Draft: 6'")
    .set("A11", "R/V HIGH REEF 72'")
    .build();
}

function yachts() {
  // No header row: A1 is already a vessel.
  return new SheetBuilder("Yachts")
    .set("A1", "M/Y Far Horizon 170'")
    .set("A2", "F/V Iron Ketch 65'")
    .set("B3", "M/Y Not In Column A 99'")
    .build();
}

const grid = (...names: [string, number][]): GridVessel[] => {
  const byKey = new Map<string, Map<string, number>>();
  for (const [raw, n] of names) {
    const key = raw.replace(/^\S+\s+/, "").toUpperCase();
    byKey.set(key, (byKey.get(key) ?? new Map()).set(raw, n));
  }
  return [...byKey.entries()].map(([nameKey, forms]) => ({ nameKey, forms }));
};

describe("parseRegistry", () => {
  it("reads vessel rows from column A only and ignores headers, phones, captains, emails and links", () => {
    const { entries, ignoredColumnA } = parseRegistry([science(), yachts()]);
    expect(entries.map((e) => `${e.ref} ${e.prefix} ${e.nameKey} ${e.lengthFt}`)).toEqual([
      "Science!A2 R/V IRON SKUA 72",
      "Science!A8 R/V HIGH REEF 32",
      "Science!A9 R/V HIGH SOUND 32",
      "Science!A10 R/V IRON KETCH 46",
      "Science!A11 R/V HIGH REEF 72",
      "Yachts!A1 M/Y FAR HORIZON 170",
      "Yachts!A2 F/V IRON KETCH 65",
    ]);
    expect(ignoredColumnA).toBe(6);
  });

  it("collects LOA notes from anywhere in a vessel's block of rows", () => {
    const { entries } = parseRegistry([science()]);
    expect(entries[0].loa).toEqual([{ ref: "Science!A7", lengthFt: 145 }]);
    expect(entries[2].loa).toEqual([{ ref: "Science!B9", lengthFt: 65 }]);
  });

  it("ignores sheets that are not registries", () => {
    expect(parseRegistry([new SheetBuilder("Tours").set("A1", "R/V Iron Skua 72'").build()]).entries).toEqual([]);
  });
});

describe("linkVessels", () => {
  const registry = parseRegistry([science(), yachts()]).entries;
  const link = (...names: [string, number][]) => linkVessels(grid(...names), registry);
  const find = (vessels: ReturnType<typeof link>, key: string) => vessels.find((v) => v.nameKey === key);

  it("unknown: the registry has never heard of the name", () => {
    const v = find(link(["R/V Long Ketch", 273]), "LONG KETCH");
    expect(v).toMatchObject({ lengthStatus: "unknown", lengthFt: null, lengthCandidates: [], lengthEvidence: null, origin: "grid" });
  });

  it("verified: same prefix and name, one length", () => {
    const far = find(link(["M/Y FAR HORIZON", 3]), "FAR HORIZON");
    expect(far).toMatchObject({ id: "v_far-horizon", name: "Far Horizon", prefix: "M/Y", lengthStatus: "verified", lengthFt: 170, lengthCandidates: [170] });
    expect(far?.lengthEvidence).toBe("Yachts!A1 M/Y Far Horizon 170' (prefix and name match)");
  });

  it("probable: the name matches but the registry lists another type prefix", () => {
    const far = find(link(["S/V FAR HORIZON", 5], ["S/V Far Horizon", 2]), "FAR HORIZON");
    expect(far).toMatchObject({ prefix: "S/V", lengthStatus: "probable", lengthFt: 170 });
    expect(far?.lengthEvidence).toBe("Yachts!A1 M/Y Far Horizon 170' (name match, registry lists a different type prefix)");
  });

  it("conflict: one name listed with two lengths, across sheets and prefixes", () => {
    const ketch = find(link(["R/V Iron Ketch", 1]), "IRON KETCH");
    expect(ketch).toMatchObject({ lengthStatus: "conflict", lengthFt: null, lengthCandidates: [46, 65] });
    expect(ketch?.lengthEvidence).toContain("Science!A10 R/V Iron Ketch 46'; Yachts!A2 F/V Iron Ketch 65'");
  });

  it("conflict: an LOA note that contradicts the listed length (an agreeing one is harmless)", () => {
    const vessels = link();
    expect(find(vessels, "HIGH SOUND")).toMatchObject({ lengthStatus: "conflict", lengthFt: null, lengthCandidates: [32, 65], origin: "registry" });
    expect(find(vessels, "IRON SKUA")).toMatchObject({ lengthStatus: "conflict", lengthCandidates: [72, 145] });
    expect(find(link(["R/V Solo", 1]), "SOLO")?.lengthStatus).toBe("unknown");
  });

  it("keeps registry-only vessels so the booking form knows their lengths", () => {
    const vessels = link(["S/V Far Horizon", 1]);
    expect(vessels.filter((v) => v.origin === "registry").map((v) => v.nameKey).sort()).toEqual(["HIGH REEF", "HIGH SOUND", "IRON KETCH", "IRON SKUA"]);
    expect(find(vessels, "HIGH REEF")).toMatchObject({ name: "High Reef", prefix: "R/V", lengthStatus: "conflict", lengthCandidates: [32, 72] });
  });

  it("names a vessel after its most frequent spelling and most frequent prefix", () => {
    const v = find(link(["S/V IRON PETREL", 4], ["S/V Iron Petrel", 1], ["M/V Iron Petrel", 2]), "IRON PETREL");
    expect(v).toMatchObject({ name: "Iron Petrel", prefix: "S/V" });
  });

  it("returns vessels sorted by id", () => {
    const ids = link(["R/V Zulu", 1], ["R/V Alpha", 1]).map((v) => v.id);
    expect(ids).toEqual([...ids].sort());
  });
});
