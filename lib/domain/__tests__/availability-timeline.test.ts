import { describe, expect, it } from "vitest";
import { classifyBerths, type BerthInfo, type Occupancy } from "../availability";
import { describePhase, isCompleted, stayPhase } from "../phase";
import { buildTimeline } from "../timeline";

const berths: BerthInfo[] = [
  { id: "npw", name: "North Pier West", lengthFt: 410 },
  { id: "npf", name: "North Pier Face", lengthFt: 75 },
  { id: "sfe", name: "South Float East", lengthFt: 90 },
];
const occ = (id: string, berthId: string, start: string, end: string): Occupancy => ({ id, berthId, start, end, label: id });

describe("classifyBerths", () => {
  const range = { start: "2026-10-10", end: "2026-10-14" };

  it("separates too short, occupied and available, best fit first", () => {
    const out = classifyBerths(berths, [occ("stay", "npw", "2026-10-14", "2026-10-20")], { range, vesselLengthFt: 85 });
    expect(out.map((o) => [o.berth.id, o.verdict])).toEqual([["sfe", "available"], ["npw", "occupied"], ["npf", "too_short"]]);
    expect(out[1].conflicts.map((c) => c.id)).toEqual(["stay"]); // touching on Oct 14 collides
    expect(out[2].fit).toMatchObject({ kind: "too_long", overByFt: 10 });
  });

  it("says too short even when the berth is also occupied: it can never work", () => {
    const out = classifyBerths(berths, [occ("stay", "npf", "2026-10-01", "2026-10-31")], { range, vesselLengthFt: 170 });
    expect(out.find((o) => o.berth.id === "npf")!.verdict).toBe("too_short");
  });

  it("skips the fit check for events and ignores the row being edited", () => {
    const out = classifyBerths(berths, [occ("me", "npf", "2026-10-10", "2026-10-14")], { range, vesselLengthFt: null, excludeReservationId: "me" });
    expect(out.every((o) => o.verdict === "available" && o.fit === null)).toBe(true);
  });
});

describe("stayPhase", () => {
  const today = "2026-09-19";
  it("knows upcoming, in port and completed", () => {
    expect(stayPhase({ start: "2026-09-20", end: "2026-09-25" }, today)).toEqual({ kind: "upcoming", startsInDays: 1 });
    expect(stayPhase({ start: "2026-09-17", end: "2026-09-23" }, today)).toEqual({ kind: "in_port", day: 3, of: 7, endsInDays: 4 });
    expect(stayPhase({ start: "2026-09-19", end: "2026-09-19" }, today)).toMatchObject({ kind: "in_port", day: 1, of: 1 });
    expect(stayPhase({ start: "2026-09-10", end: "2026-09-18" }, today)).toEqual({ kind: "completed", endedDaysAgo: 1 });
  });
  it("a stay ending today is not completed yet", () => {
    expect(isCompleted({ start: "2026-09-10", end: "2026-09-19" }, today)).toBe(false);
    expect(isCompleted({ start: "2026-09-10", end: "2026-09-18" }, today)).toBe(true);
  });
  it("reads naturally", () => {
    expect(describePhase({ kind: "upcoming", startsInDays: 1 })).toBe("Starts tomorrow");
    expect(describePhase({ kind: "in_port", day: 3, of: 7, endsInDays: 4 })).toBe("Here now, day 3 of 7");
    expect(describePhase({ kind: "completed", endedDaysAgo: 5 })).toBe("Ended 5 days ago");
  });
});

describe("buildTimeline", () => {
  const item = (id: string, start: string, end: string, status: "confirmed" | "cancelled" = "confirmed") => ({ id, berthId: "npw", start, end, status });

  it("clips stays at the month edge and marks continuation", () => {
    const [row] = buildTimeline("2026-10", ["npw"], [item("long", "2026-09-20", "2026-11-05")]);
    expect(row.bars[0]).toMatchObject({ startDay: 1, span: 31, continuesBefore: true, continuesAfter: true, lane: 0 });
  });

  it("keeps confirmed stays in lane 0 and drops a cancelled one on the same days beneath", () => {
    const [row] = buildTimeline("2026-10", ["npw"], [item("old", "2026-10-05", "2026-10-09", "cancelled"), item("new", "2026-10-06", "2026-10-10")]);
    const lane = Object.fromEntries(row.bars.map((b) => [b.item.id, b.lane]));
    expect(lane).toEqual({ new: 0, old: 1 });
    expect(row.laneCount).toBe(2);
  });

  it("returns an empty single-lane row for a quiet berth", () => {
    expect(buildTimeline("2026-09", ["npw"], [])).toEqual([{ berthId: "npw", laneCount: 1, bars: [] }]);
  });
});
