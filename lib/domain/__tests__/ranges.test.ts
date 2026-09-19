import { describe, expect, it } from "vitest";
import { clip, findOverlappingPairs, lengthInDays, overlaps } from "../ranges";

const r = (start: string, end: string) => ({ start, end });

describe("ranges (inclusive)", () => {
  it("treats touching stays as a collision: a berth-day has one occupant", () => {
    expect(overlaps(r("2019-07-01", "2019-07-05"), r("2019-07-05", "2019-07-09"))).toBe(true);
    expect(overlaps(r("2019-07-01", "2019-07-05"), r("2019-07-06", "2019-07-09"))).toBe(false);
    expect(overlaps(r("2019-07-03", "2019-07-03"), r("2019-07-01", "2019-07-31"))).toBe(true);
  });

  it("counts both ends", () => {
    expect(lengthInDays(r("2019-07-01", "2019-07-01"))).toBe(1);
    expect(lengthInDays(r("2007-01-01", "2008-02-29"))).toBe(425);
  });

  it("clips to a window", () => {
    const july = r("2019-07-01", "2019-07-31");
    expect(clip(r("2019-06-20", "2019-07-04"), july)).toEqual(r("2019-07-01", "2019-07-04"));
    expect(clip(r("2019-08-01", "2019-08-04"), july)).toBeNull();
  });

  it("finds the real 1998 double-booking, only within the same berth", () => {
    const items = [
      { id: "wild-star", berth: "npw", ...r("1998-09-16", "1998-09-21") },
      { id: "salt-dory", berth: "npw", ...r("1998-09-14", "1998-09-20") },
      { id: "elsewhere", berth: "npe", ...r("1998-09-14", "1998-09-20") },
      { id: "later", berth: "npw", ...r("1998-09-22", "1998-09-30") },
    ];
    const pairs = findOverlappingPairs(items, (i) => i.berth).map(([a, b]) => [a.id, b.id].sort());
    expect(pairs).toEqual([["salt-dory", "wild-star"]]);
  });

  it("reports every pair in a three-way pile-up", () => {
    const items = ["a", "b", "c"].map((id) => ({ id, berth: "x", ...r("2019-01-01", "2019-01-10") }));
    expect(findOverlappingPairs(items, (i) => i.berth)).toHaveLength(3);
  });
});
