import { describe, expect, it } from "vitest";
import { BERTH_IDS } from "../contract";
import { cloneFixtureSeed, fixtureSeed } from "../fixture";
import { importReport, loadSeed } from "../load";
import { validateSeed } from "../validate";

describe("fixture seed", () => {
  it("satisfies every seed invariant", () => {
    expect(validateSeed(fixtureSeed)).toEqual([]);
  });

  it("contains the situations the tests and demos rely on", () => {
    const { vessels, reservations, issues } = fixtureSeed;
    expect(reservations.length).toBeGreaterThanOrEqual(25);
    expect(vessels.find((v) => v.nameKey === "FAR HORIZON")).toMatchObject({ lengthFt: 170, lengthStatus: "probable" });
    expect(vessels.find((v) => v.nameKey === "LONG KETCH")).toMatchObject({ lengthFt: null, lengthStatus: "unknown" });
    expect(vessels.find((v) => v.lengthStatus === "conflict")?.lengthCandidates).toHaveLength(2);
    expect(reservations.filter((r) => r.vesselId === "v_far-horizon" && r.berthId === "south-float-east").length).toBeGreaterThan(0);
    expect(reservations.some((r) => r.kind === "event" && r.title === "Community sail day")).toBe(true);
    expect(reservations.some((r) => r.kind === "closure" && r.title === "Pier repair - no docking")).toBe(true);
    expect(reservations.some((r) => r.startDate.slice(0, 7) !== r.endDate.slice(0, 7))).toBe(true);
    expect(issues.filter((i) => i.type === "overlap")).toHaveLength(2);
    expect(issues.some((i) => i.type === "length_conflict" && i.vesselId !== null && i.reservationId === null)).toBe(true);
    const warned = issues.find((i) => i.type === "ambiguous_extent");
    expect(reservations.find((r) => r.id === warned?.reservationId)?.status).toBe("confirmed");
  });

  it("hands out independent copies", () => {
    const copy = cloneFixtureSeed();
    copy.reservations[0].berthId = "inner-channel";
    expect(fixtureSeed.reservations[0].berthId).not.toBe("inner-channel");
  });
});

describe("committed seed (data/seed/*.json)", () => {
  it("satisfies every seed invariant", () => {
    expect(validateSeed(loadSeed())).toEqual([]);
  });

  it("has the six berths and an import report object", () => {
    expect(loadSeed().berths.map((b) => b.id).sort()).toEqual([...BERTH_IDS].sort());
    expect(typeof importReport).toBe("object");
  });
});
