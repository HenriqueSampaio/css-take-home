import { describe, expect, it } from "vitest";
import { describeFit, fitVerdict, hasUsableLength } from "../fit";
import { displayVesselName, looksLikeVessel, parseVesselName, toDisplayCase, vesselIdFromKey } from "../names";

describe("fit", () => {
  it("flags the seeded legacy problem: a 170 ft yacht on a 90 ft float", () => {
    const v = fitVerdict(170, 90);
    expect(v).toEqual({ kind: "too_long", vesselFt: 170, berthFt: 90, overByFt: 80 });
    expect(describeFit(v)).toContain("80 ft too long");
  });
  it("allows an exact fit and never passes an unknown length", () => {
    expect(fitVerdict(90, 90)).toEqual({ kind: "fits", marginFt: 0 });
    expect(fitVerdict(null, 410)).toEqual({ kind: "unknown" });
    expect(hasUsableLength("probable")).toBe(true);
    expect(hasUsableLength("conflict")).toBe(false);
  });
});

describe("vessel names", () => {
  it("gives both casings of a hull one identity", () => {
    expect(parseVesselName("S/V IRON PETREL").nameKey).toBe(parseVesselName("S/V Iron Petrel").nameKey);
  });
  it("ignores the type prefix for identity (grid S/V vs registry M/Y)", () => {
    expect(parseVesselName("S/V Far Horizon").nameKey).toBe(parseVesselName("M/Y Far Horizon").nameKey);
    expect(parseVesselName("M/Y Far Horizon").prefix).toBe("M/Y");
  });
  it("accepts every prefix in the workbook, normalising OS/V to OSV", () => {
    for (const p of ["R/V", "M/V", "M/Y", "S/V", "S/Y", "F/V", "OSV", "Tug", "Barge"]) expect(parseVesselName(`${p} Test Hull`).prefix).toBe(p);
    expect(parseVesselName("OS/V Golden Osprey")).toEqual({ prefix: "OSV", name: "Golden Osprey", nameKey: "GOLDEN OSPREY" });
    expect(parseVesselName("  Barge   SALT  DORY ").nameKey).toBe("SALT DORY");
  });
  it("does not mistake events or notes for vessels", () => {
    for (const s of ["Community sail day", "ETA 1200", "Tugboat parade", "Barge", "1400"]) expect(looksLikeVessel(s)).toBe(false);
  });
  it("builds display names and ids", () => {
    expect(toDisplayCase("GOLDEN COMPASS")).toBe("Golden Compass");
    expect(toDisplayCase("Iron Petrel")).toBe("Iron Petrel");
    expect(displayVesselName("R/V", "Long Ketch")).toBe("R/V Long Ketch");
    expect(vesselIdFromKey("GOLDEN COMPASS")).toBe("v_golden-compass");
  });
});
