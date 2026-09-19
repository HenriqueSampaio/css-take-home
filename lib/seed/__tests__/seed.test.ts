import { describe, expect, it } from "vitest";
import { cloneFixtureSeed, fixtureSeed } from "../fixture";
import { loadSeed } from "../load";
import { validateSeed } from "../validate";

describe("fixture seed", () => {
  it("satisfies every seed invariant", () => {
    expect(validateSeed(fixtureSeed)).toEqual([]);
  });

  it("contains what the tests rely on: the six real berths, a 170 ft vessel and a 40 ft one", () => {
    expect(fixtureSeed.berths).toEqual(loadSeed().berths);
    expect(fixtureSeed.vessels.find((v) => v.nameKey === "FAR HORIZON")).toMatchObject({ id: "v_far-horizon", prefix: "M/Y", lengthFt: 170 });
    expect(fixtureSeed.vessels.find((v) => v.nameKey === "SILVER GULL")).toMatchObject({ lengthFt: 40 });
    // One vessel too long for every berth but the two big piers, one short enough for all of them.
    const shortest = Math.min(...fixtureSeed.berths.map((b) => b.lengthFt));
    expect(fixtureSeed.berths.filter((b) => b.lengthFt >= 170).map((b) => b.id)).toEqual(["north-pier-west", "north-pier-east"]);
    expect(shortest).toBeGreaterThanOrEqual(40);
  });

  it("hands out independent copies", () => {
    const copy = cloneFixtureSeed();
    copy.vessels[0].lengthFt = 999;
    copy.berths.pop();
    expect(fixtureSeed.vessels[0].lengthFt).toBe(60);
    expect(fixtureSeed.berths).toHaveLength(6);
  });
});

describe("validateSeed", () => {
  it("reports each kind of problem", () => {
    const broken = cloneFixtureSeed();
    broken.berths[1].id = broken.berths[0].id;
    broken.berths[2].name = "north pier west";
    broken.berths[3].lengthFt = 0;
    broken.vessels[0].lengthFt = 1501;
    broken.vessels[1].nameKey = "SOMETHING ELSE";
    broken.vessels[2].id = broken.vessels[3].id;
    const errors = validateSeed(broken).join("\n");
    for (const expected of ["duplicate berth id", "duplicate berth name", "bad length 0", "bad length 1501", "nameKey does not match", "duplicate vessel id", "id is not the slug of its name"]) {
      expect(errors).toContain(expected);
    }
    expect(validateSeed({ berths: [], vessels: [] })).toEqual(["at least one berth is required"]);
  });
});

describe("committed seed (data/seed/*.json)", () => {
  it("satisfies every seed invariant", () => {
    expect(validateSeed(loadSeed())).toEqual([]);
  });

  it("has the six berths in dock order and a registry in which every vessel has a length", () => {
    const seed = loadSeed();
    expect(seed.berths.map((b) => b.id)).toEqual(["north-pier-west", "north-pier-face", "north-pier-east", "inner-channel", "south-float-west", "south-float-east"]);
    expect(seed.berths.map((b) => b.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seed.vessels.length).toBeGreaterThan(100);
    expect(seed.vessels.every((v) => Number.isInteger(v.lengthFt) && v.lengthFt >= 1)).toBe(true);
  });
});
