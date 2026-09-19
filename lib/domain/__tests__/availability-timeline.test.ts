import { describe, expect, it } from "vitest";
import { classifyBerths, type BerthInfo, type Occupancy } from "../availability";
import { buildTimeline } from "../timeline";

const berths: BerthInfo[] = [
  { id: "npw", name: "North Pier West", lengthFt: 410 },
  { id: "npf", name: "North Pier Face", lengthFt: 75 },
  { id: "sfe", name: "South Float East", lengthFt: 90 },
];
const occ = (id: string, berthId: string, start: string, end: string, status: Occupancy["status"] = "confirmed"): Occupancy => ({ id, berthId, start, end, status, label: id });

describe("classifyBerths", () => {
  const range = { start: "2019-07-10", end: "2019-07-14" };

  it("separates too short, occupied and available, best fit first", () => {
    const out = classifyBerths(berths, [occ("stay", "npw", "2019-07-14", "2019-07-20")], { range, vesselLengthFt: 85, requiresFit: true });
    expect(out.map((o) => [o.berth.id, o.verdict])).toEqual([["sfe", "available"], ["npw", "occupied"], ["npf", "too_short"]]);
    expect(out[1].conflicts.map((c) => c.id)).toEqual(["stay"]); // touching on Jul 14 collides
    expect(out[2].fit).toMatchObject({ kind: "too_long", overByFt: 10 });
  });

  it("treats unresolved legacy stays as a caution, not a block", () => {
    const out = classifyBerths(berths, [occ("legacy", "sfe", "2019-07-01", "2019-07-31", "needs_review")], { range, vesselLengthFt: 40, requiresFit: true });
    const sfe = out.find((o) => o.berth.id === "sfe")!;
    expect(sfe.verdict).toBe("available");
    expect(sfe.cautions).toHaveLength(1);
  });

  it("asks for a length instead of guessing", () => {
    const out = classifyBerths(berths, [], { range, vesselLengthFt: null, requiresFit: true });
    expect(out.every((o) => o.verdict === "length_needed")).toBe(true);
  });

  it("skips the fit check for events and ignores the row being edited", () => {
    const out = classifyBerths(berths, [occ("me", "npf", "2019-07-10", "2019-07-14")], { range, vesselLengthFt: null, requiresFit: false, excludeReservationId: "me" });
    expect(out.every((o) => o.verdict === "available" && o.fit === null)).toBe(true);
  });
});

describe("buildTimeline", () => {
  const item = (id: string, start: string, end: string, status: "confirmed" | "needs_review" = "confirmed") => ({ id, berthId: "npw", start, end, status });

  it("clips stays at the month edge and marks continuation", () => {
    const [row] = buildTimeline("2019-07", ["npw"], [item("long", "2019-06-20", "2019-08-05")]);
    expect(row.bars[0]).toMatchObject({ startDay: 1, span: 31, continuesBefore: true, continuesAfter: true, lane: 0 });
  });

  it("keeps confirmed stays in lane 0 and stacks a double-booking beneath", () => {
    const [row] = buildTimeline("1998-09", ["npw"], [
      item("wild-star", "1998-09-16", "1998-09-21", "needs_review"),
      item("salt-dory", "1998-09-14", "1998-09-20", "needs_review"),
      item("confirmed", "1998-09-01", "1998-09-15"),
    ]);
    const lane = Object.fromEntries(row.bars.map((b) => [b.item.id, b.lane]));
    expect(lane.confirmed).toBe(0);
    expect(new Set([lane["salt-dory"], lane["wild-star"]]).size).toBe(2); // never drawn on top of each other
    // Salt Dory collides with the confirmed stay (Sep 14-15) so it drops a lane; Wild Star
    // starts Sep 16, collides with nothing in lane 0, and is packed back up there.
    expect(lane).toMatchObject({ "salt-dory": 1, "wild-star": 0 });
    expect(row.laneCount).toBe(2);
  });

  it("returns an empty single-lane row for a quiet berth", () => {
    expect(buildTimeline("2026-09", ["npw"], [])).toEqual([{ berthId: "npw", laneCount: 1, bars: [] }]);
  });
});
